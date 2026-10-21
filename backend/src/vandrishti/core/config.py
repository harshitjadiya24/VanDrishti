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
    # Bearer token that lets machines (camera stations, scripts) upload images. People sign in
    # instead. Unset: only signed-in users with the RUN permission can upload.
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

    # 5.3-5.5 (Phase 3). SpeciesNet runs in its own environment (ADR 0004).
    speciesnet_tool_dir: Path = Path("tools/speciesnet")
    # SAM 2 on MPS makes the Metal driver reserve ~2.4 GB hidden from RSS: CPU by default.
    segmenter_device: Literal["auto", "mps", "cuda", "cpu"] = "cpu"
    verifier_device: Literal["auto", "mps", "cuda", "cpu"] = "cpu"

    # 10.5 re-identification (Phase 6, ADR 0007). The threshold comes from the ATRW open-set
    # test for MegaDescriptor (95% of known tigers score above it); it only chooses between
    # "possible match" and "possibly a new tiger" for a person to check. It is model-specific.
    reid_model: Literal["megadescriptor-t-224", "dinov2-small"] = "megadescriptor-t-224"
    reid_match_threshold: float = Field(default=0.76, ge=0, le=1)
    reid_device: Literal["auto", "mps", "cuda", "cpu"] = "cpu"

    # Section 11 alerts (Phase 7). The webhook gets open alerts at or above the minimum
    # severity, signed with HMAC-SHA256 (see alerts/service.py). https only outside dev.
    alert_webhook_url: str | None = None
    alert_webhook_secret: SecretStr | None = None
    alert_webhook_min_severity: Literal["info", "warning", "critical"] = "warning"
    alert_webhook_max_attempts: int = Field(default=5, ge=1, le=50)
    alert_webhook_timeout_seconds: float = Field(default=10.0, gt=0, le=60)
    camera_silent_days: int = Field(default=7, ge=1)

    # Sign-in (Phase 8). Sessions live in Postgres; the cookie holds a random token.
    session_idle_hours: float = Field(default=12, gt=0)
    session_max_hours: float = Field(default=168, gt=0)  # 7 days, then sign in again
    login_max_failures: int = Field(default=5, ge=1)
    login_lock_minutes: int = Field(default=15, ge=1)
    # Where the API listens. The container sets 0.0.0.0 on the private compose network and
    # trusts the reverse proxy's forwarded address; nothing else may set it.
    api_host: str = "127.0.0.1"
    api_port: int = Field(default=8000, ge=1, le=65535)
    forwarded_allow_ips: str = "127.0.0.1"

    # Requests per minute per integration key on /v1 (in-process limiter).
    api_rate_per_minute: int = Field(default=120, ge=1)

    @field_validator("alert_webhook_url")
    @classmethod
    def _http_only(cls, value: str | None) -> str | None:
        if value and not value.startswith(("https://", "http://")):
            raise ValueError("alert_webhook_url must be an http(s) URL")
        return value or None

    # On an 8 GB M3 only one heavy model should be resident at a time.
    model_device: Literal["auto", "mps", "cuda", "cpu"] = "auto"
    model_max_loaded: int = Field(default=1, ge=1)
    model_memory_budget_mb: int = Field(default=3000, ge=128)

    @field_validator("storage_root", "model_cache_dir", "speciesnet_tool_dir")
    @classmethod
    def _anchor_to_repo(cls, value: Path) -> Path:
        value = value.expanduser()
        return value if value.is_absolute() else (REPO_ROOT / value).resolve()

    def production_problems(self) -> list[str]:
        """Settings that are fine on a laptop but unsafe on a server (checked at API start)."""
        if self.env != "prod":
            return []
        problems = []
        if self.db_password.get_secret_value() in ("change-me", "", "vandrishti"):
            problems.append("set VANDRISHTI_DB_PASSWORD to a strong secret")
        if self.alert_webhook_url and not self.alert_webhook_url.startswith("https://"):
            problems.append("VANDRISHTI_ALERT_WEBHOOK_URL must use https")
        if self.alert_webhook_url and self.alert_webhook_secret is None:
            problems.append("set VANDRISHTI_ALERT_WEBHOOK_SECRET")
        if self.ingest_token is not None and len(self.ingest_token.get_secret_value()) < 32:
            problems.append("VANDRISHTI_INGEST_TOKEN must be at least 32 characters")
        return problems

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
