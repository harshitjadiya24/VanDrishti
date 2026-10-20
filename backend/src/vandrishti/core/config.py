"""Settings from environment variables (`VANDRISHTI_*`) and the repo-root `.env`."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import URL

REPO_ROOT = Path(__file__).resolve().parents[4]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="VANDRISHTI_",
        env_file=REPO_ROOT / ".env",
        env_file_encoding="utf-8",
        # The .env may hold keys for later phases (or the archived build): ignore them.
        extra="ignore",
    )

    env: Literal["dev", "test", "prod"] = "dev"
    log_level: str = "INFO"
    log_json: bool = True

    db_host: str = "localhost"
    db_port: int = Field(default=5432, ge=1, le=65535)
    db_user: str = "vandrishti"
    db_password: SecretStr = SecretStr("change-me")
    db_name: str = "vandrishti"

    redis_url: str = "redis://localhost:6379/0"

    # Originals are content-addressed and immutable; derivatives live beside them.
    storage_root: Path = Path("data/store")
    model_cache_dir: Path = Path("data/models")

    # Ingestion and preprocessing (Phase 1, image sections 2-4).
    # A new burst starts when frames from one camera are further apart than this.
    sequence_gap_seconds: float = Field(default=10.0, ge=0)
    display_max_side: int = Field(default=1600, ge=256, le=8192)
    # Light 3x3 median filter on the display copy (useful for grainy night IR); off by default.
    denoise: bool = False
    upload_max_mb: int = Field(default=50, ge=1)
    watch_interval_seconds: float = Field(default=30.0, ge=1)
    # Bearer token for write endpoints until login and roles arrive (Phase 8). Unset: writes
    # are allowed only with env=dev, and the API listens on 127.0.0.1 only.
    ingest_token: SecretStr | None = None

    # 5.2 detection (Phase 2). CPU was measured faster than MPS for the compact detector on
    # an M3 (0.16 vs 0.33 s/image): the default is CPU, not "auto".
    detector_device: Literal["auto", "mps", "cuda", "cpu"] = "cpu"
    detector_batch_size: int = Field(default=8, ge=1, le=64)
    detector_min_confidence: float = Field(default=0.05, ge=0, le=1)  # boxes stored from here
    # An animal box at or above this means "animal"; below, the frame is likely blank.
    animal_threshold: float = Field(default=0.2, ge=0, le=1)
    # People and vehicles are blurred from this (lower: privacy errs on the safe side).
    privacy_threshold: float = Field(default=0.1, ge=0, le=1)

    # On an 8 GB M3 only one heavy model should be resident at a time.
    model_device: Literal["auto", "mps", "cuda", "cpu"] = "auto"
    model_max_loaded: int = Field(default=1, ge=1)
    model_memory_budget_mb: int = Field(default=3000, ge=128)

    @field_validator("storage_root", "model_cache_dir")
    @classmethod
    def _anchor_to_repo(cls, value: Path) -> Path:
        value = value.expanduser()
        return value if value.is_absolute() else (REPO_ROOT / value).resolve()

    @property
    def database_url(self) -> URL:
        return URL.create(
            drivername="postgresql+psycopg",
            username=self.db_user,
            password=self.db_password.get_secret_value(),
            host=self.db_host,
            port=self.db_port,
            database=self.db_name,
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()
