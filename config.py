"""Configuration for SeatLock.

Values come from environment variables, optionally loaded from a `.env`
file in the project root (see `.env.example`). Defaults are zero-cost:
SQLite + DB-backed holds, no Redis, no Docker. Set DATABASE_URL to use
PostgreSQL.
"""
import os

from dotenv import load_dotenv

# Load .env before any os.environ lookups below. Real environment
# variables always win over values in the file.
load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))


def _int(name, default):
    try:
        return int(os.environ.get(name, default))
    except (TypeError, ValueError):
        return int(default)


def _bool(name, default=False):
    v = os.environ.get(name)
    if v is None:
        return default
    return v.strip().lower() in ("1", "true", "yes", "on")


def _hold_seconds():
    # SEATLOCK_HOLD_SECONDS is mainly for tests (short holds).
    v = os.environ.get("SEATLOCK_HOLD_SECONDS")
    if v:
        try:
            return int(v)
        except ValueError:
            pass
    return _int("SEATLOCK_HOLD_MINUTES", 10) * 60


class Config:
    SECRET_KEY = os.environ.get("SEATLOCK_SECRET_KEY", "dev-secret-change-me")
    JWT_SECRET = os.environ.get("SEATLOCK_JWT_SECRET", SECRET_KEY)
    JWT_EXPIRY_HOURS = _int("SEATLOCK_JWT_EXPIRY_HOURS", 24)

    SQLALCHEMY_DATABASE_URI = os.environ.get("DATABASE_URL", "sqlite:///seatlock.db")
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # Seat holds
    HOLD_SECONDS = _hold_seconds()
    MAX_SEATS_PER_HOLD = _int("SEATLOCK_MAX_SEATS_PER_HOLD", 8)
    # Background cleanup interval (seconds). Lazy expiry on seat requests
    # also runs, so expiry does not depend on this thread alone.
    CLEANUP_INTERVAL_SECONDS = _int("SEATLOCK_CLEANUP_SECONDS", 30)
    BACKGROUND_CLEANUP = True

    RATELIMIT_ENABLED = True

    # Server
    HOST = os.environ.get("HOST", "127.0.0.1")
    PORT = _int("PORT", 5000)
    DEBUG = _bool("FLASK_DEBUG", False)

    # Built frontend (frontend/dist) is served by Flask when it exists.
    FRONTEND_DIST = os.environ.get(
        "FRONTEND_DIST",
        os.path.join(os.path.dirname(os.path.abspath(__file__)), "frontend", "dist"),
    )
    # Comma-separated origins allowed to call /api from another origin
    # (only needed if the frontend is hosted separately). Empty = same-origin only.
    CORS_ORIGINS = [o.strip() for o in os.environ.get("CORS_ORIGINS", "").split(",") if o.strip()]


class TestConfig(Config):
    TESTING = True
    # Tests use a temp file DB set by the fixture via app config override.
    SQLALCHEMY_DATABASE_URI = "sqlite:///:memory:"
    RATELIMIT_ENABLED = False
    BACKGROUND_CLEANUP = False
