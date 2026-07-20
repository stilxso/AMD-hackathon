"""
Application configuration loaded from environment variables.

Uses pydantic-settings to validate and parse .env file.
All API tokens default to empty strings so the server can start
even without external API access (graceful degradation).
"""

from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """AirQ backend configuration."""

    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().parent.parent / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ── External API tokens ──────────────────────────────────────────
    waqi_api_token: str = "demo"
    openaq_api_key: str = ""
    openweather_api_key: str = ""

    # ── ML model ─────────────────────────────────────────────────────
    model_path: str = "fineweights.pt"
    num_classes: int = 5

    # ── Server ───────────────────────────────────────────────────────
    host: str = "0.0.0.0"
    port: int = 8000
    log_level: str = "info"

    # ── Derived helpers ──────────────────────────────────────────────

    @property
    def model_abs_path(self) -> Path:
        """Resolve model_path relative to the backend/ directory."""
        base = Path(__file__).resolve().parent.parent  # backend/
        return (base / self.model_path).resolve()


# Singleton – import this everywhere
settings = Settings()
