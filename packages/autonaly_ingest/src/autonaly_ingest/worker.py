"""Pub/Sub worker — the loop that makes the system autonomous.

A signal arrives, the Pydantic gate accepts or rejects it, an idempotency ledger
decides whether it has already been handled, and the agent runs. Nothing here
asks a human anything; the only human step is approving what comes out.

    make worker

Failure handling, which is deliberate and visible:

  malformed signal   -> Pydantic gate rejects -> nack -> redelivered
                     -> after 5 attempts -> dead-letter topic
  duplicate signal   -> ledger hit -> acked as a no-op, agent never runs
  model rate limit   -> waited out in place, without spending an attempt
  transient failure  -> nack -> redelivered -> succeeds or dead-letters
"""

from __future__ import annotations

import asyncio
import logging
import time
from datetime import UTC, datetime

from autonaly_core import get_settings
from autonaly_core.schema import Signal
from google.cloud import firestore
from pydantic import ValidationError

from .topology import ensure_topology

log = logging.getLogger(__name__)

SIGNAL_LEDGER_COLLECTION = "processed_signals"


class SignalLedger:
    """Records which signals have been handled, keyed by content hash.

    Deliberately not one of the three shared ports — this is an ingestion
    concern, not a contract other packages need. It uses the same Firestore
    client, so it follows the emulator locally and real Firestore after cutover.
    """

    def __init__(self, project: str, collection: str = SIGNAL_LEDGER_COLLECTION) -> None:
        self._db = firestore.Client(project=project)
        self._collection = collection

    def seen(self, signal_key: str) -> bool:
        return self._db.collection(self._collection).document(signal_key).get().exists

    def record(self, signal: Signal, route: str | None, filed: bool) -> None:
        self._db.collection(self._collection).document(signal.key()).set(
            {
                "signal_key": signal.key(),
                "headline": signal.headline,
                "source": signal.source,
                "observed_at": signal.observed_at.isoformat(),
                "processed_at": datetime.now(UTC).isoformat(),
                "route": route,
                "filed": filed,
            }
        )


class PermanentFailure(Exception):
    """A message that will never succeed — malformed, so let it dead-letter."""


# Waited out inside the callback rather than by nacking. A nack redelivers
# immediately, and the retry re-runs the whole agent — so a rate limit used to
# spend all five delivery attempts in nine minutes, each attempt asking for
# quota that was still exhausted, and the signal dead-lettered over a condition
# that clears on its own in about a minute. Holding the message is safe: the
# lease is extended while the callback runs, and handle() writes the ledger only
# after the agent succeeds, so a retry re-runs from clean.
QUOTA_BACKOFF_SECONDS = (45, 90, 180)


def is_rate_limited(exc: BaseException) -> bool:
    """Is this the model saying 'not right now' rather than 'never'?"""
    text = str(exc)
    return (
        getattr(exc, "code", None) == 429
        or "RESOURCE_EXHAUSTED" in text
        or "429" in text
        and "quota" in text.lower()
    )


def handle(data: bytes, attributes: dict[str, str], ledger: SignalLedger) -> dict:
    """Process one message. Raises to signal a nack."""
    try:
        signal = Signal.model_validate_json(data)
    except ValidationError as exc:
        # The Pydantic gate. Retrying will not help, but we still nack so the
        # subscription's dead-letter policy captures it rather than dropping it.
        log.error("signal failed validation, will dead-letter: %s", exc.error_count())
        raise PermanentFailure(str(exc)) from exc

    key = signal.key()

    if ledger.seen(key):
        # Idempotency: the same signal arriving twice must not produce a second
        # briefing or a second Gemini bill.
        log.info("signal %s already processed, no-op", key)
        return {"signal_key": key, "status": "duplicate"}

    from autonaly_agent.runner import run_on_signal

    result = asyncio.run(run_on_signal(signal))
    ledger.record(signal, result.route, result.filed)

    if result.filed and result.filed_id:
        # The briefing is filed and the gate is unaffected; the fan-out is
        # best-effort by design.
        from .notify import notify_analysts

        notify_analysts(result.filed_id)

    log.info("processed %s", result.summary())
    return {
        "signal_key": key,
        "status": "processed",
        "route": result.route,
        "filed": result.filed,
    }


def run_worker() -> None:
    """Subscribe and process forever."""
    from google.cloud import pubsub_v1

    settings = get_settings()
    topology = ensure_topology()
    ledger = SignalLedger(settings.project_id)

    subscriber = pubsub_v1.SubscriberClient()
    path = topology["signals_subscription"]

    def callback(message) -> None:  # noqa: ANN001 - pubsub message type
        attempt = message.delivery_attempt
        log.info("received message (delivery attempt %s)", attempt)
        for wait in (*QUOTA_BACKOFF_SECONDS, None):
            try:
                handle(message.data, dict(message.attributes), ledger)
                message.ack()
                return
            except PermanentFailure:
                # Malformed. Retrying cannot help; let the subscription's
                # dead-letter policy do its job.
                message.nack()
                return
            except Exception as exc:
                if is_rate_limited(exc) and wait is not None:
                    log.warning("model rate limited, waiting %ss before retrying", wait)
                    time.sleep(wait)
                    continue
                log.exception("transient failure, nacking for redelivery")
                message.nack()
                return

    print(f"\n  worker listening on {path}")
    print(f"  dead-letter topic: {topology['dlq_topic']}\n")

    future = subscriber.subscribe(path, callback)
    try:
        future.result()
    except KeyboardInterrupt:
        future.cancel()
        print("\n  worker stopped\n")


def main() -> int:
    # No dotenv call here on purpose: get_settings() loads the env files into
    # os.environ centrally, which is what stops a process from looking correctly
    # configured while its Google clients quietly address production.
    logging.basicConfig(level=logging.INFO, format="  %(message)s")
    run_worker()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
