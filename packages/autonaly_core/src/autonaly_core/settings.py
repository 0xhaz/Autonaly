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
    gemini_model: str = "gemini-2.5-flash"
    max_llm_retries: int = 3

    @property
    def is_local(self) -> bool:
        return self.env is Env.LOCAL


@lru_cache
def get_settings() -> Settings:
    return Settings()
