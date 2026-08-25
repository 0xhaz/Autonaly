"""Single settings object. One env var (AUTONALY_ENV) decides local vs GCP.

See workplan.md §1 — this is the seam that makes cutover a config flip.
"""

from __future__ import annotations

from enum import StrEnum
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[4]


class Env(StrEnum):
    LOCAL = "local"
    GCP = "gcp"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="AUTONALY_",
        env_file=(REPO_ROOT / ".env.local", REPO_ROOT / ".env.gcp"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    env: Env = Env.LOCAL

    # --- GCP identity (used in both envs: Vertex has no emulator) ---
    project_id: str = "autonaly-hackathon"
    location: str = "us-central1"
    """Region for Cloud Run, Pub/Sub, GCS, Scheduler."""

    vertex_location: str = "global"
    """Separate on purpose: Gemini 3.x is served from the `global` endpoint and
    404s in us-central1, verified 2026-08-17 (workplan.md §7 RK-D)."""

    # --- artifacts (the only port needing two real implementations) ---
    artifact_root: Path = REPO_ROOT / "artifacts"
    artifact_bucket: str = "autonaly-artifacts"

    # --- pub/sub (emulator honours PUBSUB_EMULATOR_HOST; code is identical) ---
    signals_topic: str = "signals"
    signals_subscription: str = "signals-sub"
    dlq_topic: str = "signals-dlq"

    # --- firestore (emulator honours FIRESTORE_EMULATOR_HOST; code is identical) ---
    briefings_collection: str = "briefings"
    events_collection: str = "events"

    # --- exposure engine ---
    engine_url: str = "http://localhost:8080"

    # --- LLM (no emulator — real Vertex in every environment) ---
    gemini_model: str = "gemini-3.7-flash"
    """Must be 3.5+ to satisfy the hackathon requirement (hackathon.md §2).
    Benchmarked 2026-08-17: 3.7-flash fastest and cleanest structured output;
    3.6-flash dropped fields; 2.5-flash would fail eligibility."""

    max_llm_retries: int = 3

    @property
    def is_local(self) -> bool:
        return self.env is Env.LOCAL

    def assert_environment_consistent(self) -> None:
        """Refuse to run local against production, or cloud against emulators.

        Silent misrouting is worse than a crash: the injector published to real
        Pub/Sub for an entire debugging session while appearing to work, because
        publishing to production succeeds perfectly well. This turns that class
        of mistake into an immediate, legible failure.
        """
        import os

        pubsub = os.environ.get("PUBSUB_EMULATOR_HOST")
        firestore = os.environ.get("FIRESTORE_EMULATOR_HOST")

        if self.is_local:
            missing = [
                name
                for name, value in (
                    ("PUBSUB_EMULATOR_HOST", pubsub),
                    ("FIRESTORE_EMULATOR_HOST", firestore),
                )
                if not value
            ]
            if missing:
                raise RuntimeError(
                    f"AUTONALY_ENV=local but {' and '.join(missing)} not set — "
                    f"Google clients would silently use REAL GCP. Start the "
                    f"emulators with `make up`, or set AUTONALY_ENV=gcp deliberately."
                )
        elif pubsub or firestore:
            raise RuntimeError(
                "AUTONALY_ENV=gcp but emulator host variables are set — cloud "
                "traffic would be redirected to a local emulator. Unset "
                "PUBSUB_EMULATOR_HOST and FIRESTORE_EMULATOR_HOST."
            )


def _load_env_files() -> None:
    """Load .env into the real process environment, not just into Settings.

    pydantic-settings reads the env file into this object, but the Google client
    libraries read `PUBSUB_EMULATOR_HOST` and `FIRESTORE_EMULATOR_HOST` from
    `os.environ`. A process that built Settings without also populating os.environ
    therefore looked correctly configured while silently talking to production —
    which is exactly what happened to the replay injector, creating real topics
    and publishing real messages to GCP while the worker listened to the
    emulator. Loading here means importing settings is sufficient.
    """
    import os

    from dotenv import load_dotenv

    # An explicit AUTONALY_ENV in the real environment decides which file to
    # read. Loading .env.local when the caller asked for gcp would inject
    # emulator hosts into a cloud-bound process — precisely the misrouting
    # assert_environment_consistent exists to catch, and better never created.
    # (Blanking the vars instead does not work: the Google clients test for
    # presence, not truthiness, and an empty host yields "the target uri is
    # not valid: dns:///".)
    explicit = os.environ.get("AUTONALY_ENV")
    names = (".env.gcp",) if explicit == "gcp" else (".env.local", ".env.gcp")
    for name in names:
        path = REPO_ROOT / name
        if path.exists():
            load_dotenv(path, override=False)


@lru_cache
def get_settings() -> Settings:
    # The consistency check deliberately does NOT run here. It belongs where the
    # risk is — the factories that build Pub/Sub and Firestore clients. The
    # exposure engine reads artifacts and never touches either, so requiring it
    # to declare emulator hosts it will not use would be noise.
    _load_env_files()
    return Settings()
