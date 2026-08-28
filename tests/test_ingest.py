"""Ingestion tests — offline, no LLM, no emulator.

The paths worth pinning are the ones that must never silently misbehave: the
Pydantic gate, idempotency, and the environment guard that stops a local process
talking to production.
"""

from __future__ import annotations

import os
from datetime import UTC, datetime

import pytest
from autonaly_core.schema import Signal
from autonaly_core.settings import Env, Settings
from autonaly_ingest.injector import REPLAYS
from autonaly_ingest.worker import (
    QUOTA_BACKOFF_SECONDS,
    PermanentFailure,
    handle,
    is_rate_limited,
)


class FakeLedger:
    def __init__(self, seen_keys: set[str] | None = None) -> None:
        self._seen = seen_keys or set()
        self.recorded: list[tuple[str, str | None, bool]] = []

    def seen(self, signal_key: str) -> bool:
        return signal_key in self._seen

    def record(self, signal: Signal, route: str | None, filed: bool) -> None:
        self.recorded.append((signal.key(), route, filed))


def _signal(headline: str = "Canal blocked") -> Signal:
    return Signal(
        headline=headline,
        body="body",
        source="test",
        observed_at=datetime(2026, 8, 18, tzinfo=UTC),
    )


class TestPydanticGate:
    """Malformed messages must dead-letter, not crash the worker or half-process."""

    def test_malformed_json_raises_permanent_failure(self):
        with pytest.raises(PermanentFailure):
            handle(b"not json at all", {}, FakeLedger())

    def test_missing_required_fields_raises_permanent_failure(self):
        with pytest.raises(PermanentFailure):
            handle(b'{"headline": "no timestamp"}', {}, FakeLedger())

    def test_wrong_types_raise_permanent_failure(self):
        payload = b'{"headline": 42, "source": "x", "observed_at": "not-a-date"}'
        with pytest.raises(PermanentFailure):
            handle(payload, {}, FakeLedger())

    def test_the_gate_does_not_record_a_rejected_signal(self):
        ledger = FakeLedger()
        with pytest.raises(PermanentFailure):
            handle(b"{}", {}, ledger)
        assert ledger.recorded == []


class TestRateLimitIsNotAFailure:
    """A rate-limited model used to cost the whole message.

    A 429 nacked, Pub/Sub redelivered immediately, the retry re-ran the entire
    agent against quota that was still exhausted, and five attempts burned in
    nine minutes — dead-lettering a signal over a condition that clears itself
    in about a minute. The classifier is what keeps 'not right now' apart from
    'never'; getting it wrong in either direction breaks something.
    """

    def test_vertex_resource_exhausted_is_a_rate_limit(self):
        assert is_rate_limited(RuntimeError("429 RESOURCE_EXHAUSTED. {'error': ...}"))

    def test_an_error_carrying_a_429_code_is_a_rate_limit(self):
        exc = RuntimeError("quota exceeded")
        exc.code = 429
        assert is_rate_limited(exc)

    def test_an_ordinary_failure_is_not_a_rate_limit(self):
        # Must nack promptly rather than sleeping through three backoffs.
        assert not is_rate_limited(ConnectionError("engine unreachable"))
        assert not is_rate_limited(ValueError("bad rankings payload"))

    def test_a_malformed_signal_is_never_treated_as_a_rate_limit(self):
        # The demo's dead-letter beat depends on this dead-lettering fast.
        assert not is_rate_limited(PermanentFailure("2 validation errors"))

    def test_backoffs_are_ordered_and_bounded(self):
        # Long enough for a per-minute quota to refill, short enough that the
        # message lease survives the wait.
        assert list(QUOTA_BACKOFF_SECONDS) == sorted(QUOTA_BACKOFF_SECONDS)
        assert sum(QUOTA_BACKOFF_SECONDS) < 600


class TestIdempotency:
    """The same signal twice must not bill Gemini twice or file two briefings."""

    def test_known_signal_is_a_no_op(self):
        signal = _signal()
        ledger = FakeLedger(seen_keys={signal.key()})
        result = handle(signal.model_dump_json().encode(), {}, ledger)
        assert result["status"] == "duplicate"

    def test_duplicate_does_not_re_record(self):
        signal = _signal()
        ledger = FakeLedger(seen_keys={signal.key()})
        handle(signal.model_dump_json().encode(), {}, ledger)
        assert ledger.recorded == []

    def test_key_is_stable_across_serialisation(self):
        signal = _signal()
        restored = Signal.model_validate_json(signal.model_dump_json())
        assert restored.key() == signal.key()

    def test_different_headlines_get_different_keys(self):
        assert _signal("Canal blocked").key() != _signal("Strait threatened").key()


class TestReplayCatalogue:
    def test_every_replay_is_a_valid_signal(self):
        for name, signal in REPLAYS.items():
            assert isinstance(signal, Signal), name
            assert signal.headline and signal.observed_at

    def test_replays_have_distinct_keys(self):
        keys = [s.key() for s in REPLAYS.values()]
        assert len(keys) == len(set(keys))

    def test_suez_replay_carries_the_event_dates_in_its_body(self):
        # The agent has to extract these; if they vanish the chokepoint route
        # cannot fetch the right PortWatch window.
        body = REPLAYS["suez"].body
        assert "2021-03-23" in body and "2021-03-29" in body

    def test_out_of_scope_replay_exists(self):
        assert "financial" in REPLAYS


class TestEnvironmentGuard:
    """A local process silently publishing to production is the failure this
    guard exists to prevent — it happened, and cost a debugging session."""

    def test_local_without_emulators_is_refused(self, monkeypatch):
        monkeypatch.delenv("PUBSUB_EMULATOR_HOST", raising=False)
        monkeypatch.delenv("FIRESTORE_EMULATOR_HOST", raising=False)
        with pytest.raises(RuntimeError, match="REAL GCP"):
            Settings(env=Env.LOCAL).assert_environment_consistent()

    def test_local_with_emulators_is_accepted(self, monkeypatch):
        monkeypatch.setenv("PUBSUB_EMULATOR_HOST", "localhost:8085")
        monkeypatch.setenv("FIRESTORE_EMULATOR_HOST", "localhost:8086")
        Settings(env=Env.LOCAL).assert_environment_consistent()

    def test_gcp_with_emulator_vars_is_refused(self, monkeypatch):
        # The reverse mistake: cloud config, but traffic diverted to localhost.
        monkeypatch.setenv("PUBSUB_EMULATOR_HOST", "localhost:8085")
        with pytest.raises(RuntimeError, match="redirected to a local emulator"):
            Settings(env=Env.GCP).assert_environment_consistent()

    def test_gcp_clean_is_accepted(self, monkeypatch):
        monkeypatch.delenv("PUBSUB_EMULATOR_HOST", raising=False)
        monkeypatch.delenv("FIRESTORE_EMULATOR_HOST", raising=False)
        Settings(env=Env.GCP).assert_environment_consistent()

    def test_the_guard_reads_os_environ_not_settings(self, monkeypatch):
        # The original bug: Settings looked correct because pydantic-settings had
        # read the env file, while os.environ — which the Google clients actually
        # consult — was empty.
        monkeypatch.delenv("PUBSUB_EMULATOR_HOST", raising=False)
        monkeypatch.delenv("FIRESTORE_EMULATOR_HOST", raising=False)
        assert "PUBSUB_EMULATOR_HOST" not in os.environ
        with pytest.raises(RuntimeError):
            Settings(env=Env.LOCAL).assert_environment_consistent()
