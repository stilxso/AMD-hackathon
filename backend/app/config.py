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

    # Gemini generates the "why is pollution at this level" explanation. Empty
    # disables /explain with a clear 503 rather than breaking startup.
    gemini_api_key: str = ""
    # gemini-2.5-flash is still listed by ListModels but generateContent returns
    # 404 "no longer available to new users" — verify a model actually answers
    # before setting it here, the listing alone is not enough.
    gemini_model: str = "gemini-3.6-flash"

    # ── ML model ─────────────────────────────────────────────────────
    model_path: str = "fineweights.pt"

    # Empirical divisor mapping the checkpoint's raw head output to µg/m³.
    #
    # WARNING: this is a calibration constant, not a derived conversion. The
    # training script is not part of this repository, so the unit of the raw
    # output is unverified — it may be µg/m³ at a different scale, AQI, or a
    # normalised target. The value below was chosen because it places typical
    # sky photographs in a plausible PM2.5 range. Everything downstream
    # (weather correction, station blending) assumes the result is µg/m³.
    # Re-derive this against labelled data before trusting absolute values.
    pm25_calibration_divisor: float = 5.0
    pm25_max: float = 350.0

    # Monte-Carlo dropout passes used to estimate model uncertainty.
    # Only the small regression head is re-run, so this is cheap.
    mc_dropout_samples: int = 20

    # ── Auth ─────────────────────────────────────────────────────────
    # HS256 signing key for access tokens. Empty means "generate a random key
    # at startup", so sessions survive only until the process restarts. Set a
    # long random value in .env for anything beyond local development.
    jwt_secret: str = ""
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24 * 7  # 7 days

    # SQLite file holding the users table, relative to the backend/ directory.
    db_path: str = "airq.db"

    # Demo account seeded at startup when missing. Set demo_password to an
    # empty string to skip seeding.
    demo_username: str = "admin"
    demo_password: str = "doniponi228"

    # Comma-separated usernames granted the admin UI. Empty falls back to the
    # seeded demo account, so a stock dev setup has exactly one admin.
    admin_usernames: str = ""

    # ── Server ───────────────────────────────────────────────────────
    host: str = "0.0.0.0"
    port: int = 8000
    log_level: str = "info"
    max_upload_bytes: int = 10 * 1024 * 1024  # 10 MB

    # Comma-separated browser origins allowed to call the API directly.
    # The Next.js dev server proxies through a rewrite, so this only matters
    # for direct cross-origin calls (e.g. a deployed frontend).
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000,http://localhost:3001"

    # ── Derived helpers ──────────────────────────────────────────────

    @property
    def model_abs_path(self) -> Path:
        """Resolve model_path relative to the backend/ directory."""
        base = Path(__file__).resolve().parent.parent  # backend/
        return (base / self.model_path).resolve()

    @property
    def db_abs_path(self) -> Path:
        """Resolve db_path relative to the backend/ directory."""
        base = Path(__file__).resolve().parent.parent  # backend/
        return (base / self.db_path).resolve()

    @property
    def admin_username_set(self) -> set[str]:
        """
        Usernames that get the admin UI, lowercased.

        users.username is UNIQUE COLLATE NOCASE, so "Admin" and "admin" are the
        same account — the admin check has to agree with that.
        """
        raw = self.admin_usernames or self.demo_username
        return {u.strip().lower() for u in raw.split(",") if u.strip()}

    @property
    def cors_origin_list(self) -> list[str]:
        """Parse cors_origins into a list, ignoring blank entries."""
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


# Singleton – import this everywhere
settings = Settings()
