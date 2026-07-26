"""
User accounts: SQLite storage, password hashing and JWT issue/verify.

Storage is a single `users` table in a local SQLite file (see
settings.db_abs_path). There is no ORM — one table with four columns does not
justify the dependency.

Passwords are stored as PBKDF2-HMAC-SHA256 with a per-user random salt, using
only the standard library. Verification is constant-time.
"""

import hashlib
import hmac
import logging
import sqlite3
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path

import jwt

from app.config import settings

logger = logging.getLogger("airq.auth")

# Cost parameter for password hashing. Raising it invalidates nothing — the
# iteration count is stored inside each hash string, so old hashes keep
# verifying with the count they were created at.
PBKDF2_ITERATIONS = 600_000
SALT_BYTES = 16

USERNAME_MIN, USERNAME_MAX = 3, 32
PASSWORD_MIN = 8


class AuthError(Exception):
    """Raised for any recoverable auth failure (bad credentials, invalid input)."""


class UsernameTakenError(AuthError):
    """Registration hit the UNIQUE constraint on users.username."""


@dataclass(frozen=True)
class User:
    id: int
    username: str
    created_at: str


# ── Password hashing ─────────────────────────────────────────────────

def hash_password(password: str) -> str:
    """Return a `pbkdf2_sha256$iterations$salt$hash` string."""
    salt = secrets.token_bytes(SALT_BYTES)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, PBKDF2_ITERATIONS)
    return f"pbkdf2_sha256${PBKDF2_ITERATIONS}${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    """Constant-time check of a password against a stored hash string."""
    try:
        algorithm, iterations, salt_hex, digest_hex = stored.split("$")
        if algorithm != "pbkdf2_sha256":
            return False
        salt = bytes.fromhex(salt_hex)
        expected = bytes.fromhex(digest_hex)
    except ValueError:
        # Malformed hash column — treat as a failed login, not a crash.
        return False

    candidate = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, int(iterations))
    return hmac.compare_digest(candidate, expected)


# ── Database ─────────────────────────────────────────────────────────

def _connect() -> sqlite3.Connection:
    path: Path = settings.db_abs_path
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    """Create the users table if it does not exist. Safe to call repeatedly."""
    with _connect() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                username      TEXT    NOT NULL UNIQUE COLLATE NOCASE,
                password_hash TEXT    NOT NULL,
                created_at    TEXT    NOT NULL
            )
            """
        )


def _row_to_user(row: sqlite3.Row) -> User:
    return User(id=row["id"], username=row["username"], created_at=row["created_at"])


def create_user(username: str, password: str) -> User:
    """
    Insert a new account. Raises AuthError if the input is invalid or the
    username is already taken.
    """
    username = username.strip()

    if not (USERNAME_MIN <= len(username) <= USERNAME_MAX):
        raise AuthError(
            f"Username must be {USERNAME_MIN}-{USERNAME_MAX} characters"
        )
    if not all(c.isalnum() or c in "._-" for c in username):
        raise AuthError("Username may only contain letters, digits, '.', '_' and '-'")
    if len(password) < PASSWORD_MIN:
        raise AuthError(f"Password must be at least {PASSWORD_MIN} characters")

    now = datetime.now(timezone.utc).isoformat()
    try:
        with _connect() as conn:
            cur = conn.execute(
                "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
                (username, hash_password(password), now),
            )
            user_id = cur.lastrowid
    except sqlite3.IntegrityError:
        # UNIQUE COLLATE NOCASE — "Admin" collides with "admin".
        raise UsernameTakenError("That username is already taken")

    return User(id=user_id, username=username, created_at=now)


def get_user_by_username(username: str) -> User | None:
    with _connect() as conn:
        row = conn.execute(
            "SELECT id, username, created_at FROM users WHERE username = ?",
            (username.strip(),),
        ).fetchone()
    return _row_to_user(row) if row else None


def is_admin(username: str) -> bool:
    """
    Whether this account gets the admin UI. Driven by ADMIN_USERNAMES, not by a
    column — see settings.admin_username_set.
    """
    return username.strip().lower() in settings.admin_username_set


def get_user_by_id(user_id: int) -> User | None:
    with _connect() as conn:
        row = conn.execute(
            "SELECT id, username, created_at FROM users WHERE id = ?", (user_id,)
        ).fetchone()
    return _row_to_user(row) if row else None


def authenticate(username: str, password: str) -> User:
    """Return the user for valid credentials, else raise AuthError."""
    with _connect() as conn:
        row = conn.execute(
            "SELECT id, username, password_hash, created_at FROM users WHERE username = ?",
            (username.strip(),),
        ).fetchone()

    # Same message and roughly the same work for "no such user" and "wrong
    # password", so the response does not reveal which usernames exist.
    if row is None:
        hash_password(password)
        raise AuthError("Incorrect username or password")
    if not verify_password(password, row["password_hash"]):
        raise AuthError("Incorrect username or password")

    return _row_to_user(row)


def change_password(user_id: int, current_password: str, new_password: str) -> None:
    """
    Replace a user's password after checking the current one.

    Re-verifying rather than trusting the bearer token means a stolen token
    alone cannot lock the owner out of their own account.
    """
    if len(new_password) < PASSWORD_MIN:
        raise AuthError(f"Password must be at least {PASSWORD_MIN} characters")

    with _connect() as conn:
        row = conn.execute(
            "SELECT password_hash FROM users WHERE id = ?", (user_id,)
        ).fetchone()
        if row is None:
            raise AuthError("Account no longer exists")
        if not verify_password(current_password, row["password_hash"]):
            raise AuthError("Current password is incorrect")

        conn.execute(
            "UPDATE users SET password_hash = ? WHERE id = ?",
            (hash_password(new_password), user_id),
        )


def ensure_demo_user() -> None:
    """
    Seed the demo account described in the README, if it is missing.

    Controlled by DEMO_USERNAME / DEMO_PASSWORD. Set DEMO_PASSWORD to an empty
    string to disable seeding entirely — do that for any real deployment, since
    these credentials are public.
    """
    username, password = settings.demo_username, settings.demo_password
    if not username or not password:
        logger.info("Demo account seeding disabled (DEMO_PASSWORD is empty).")
        return

    if get_user_by_username(username):
        logger.info("Demo account %r already present.", username)
        return

    try:
        create_user(username, password)
        logger.warning(
            "Seeded demo account %r with a publicly known password. "
            "Set DEMO_PASSWORD= (empty) to disable this.",
            username,
        )
    except AuthError as exc:
        logger.error("Could not seed demo account: %s", exc)


# ── JWT ──────────────────────────────────────────────────────────────

def create_access_token(user: User) -> tuple[str, int]:
    """Sign a token for `user`. Returns (token, expires_in_seconds)."""
    expires_in = settings.jwt_expire_minutes * 60
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user.id),
        "username": user.username,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(seconds=expires_in)).timestamp()),
    }
    token = jwt.encode(payload, _secret(), algorithm=settings.jwt_algorithm)
    return token, expires_in


def user_from_token(token: str) -> User:
    """Decode a bearer token and load its user. Raises AuthError if invalid."""
    try:
        payload = jwt.decode(token, _secret(), algorithms=[settings.jwt_algorithm])
    except jwt.ExpiredSignatureError:
        raise AuthError("Session expired — please sign in again")
    except jwt.InvalidTokenError:
        raise AuthError("Invalid authentication token")

    subject = payload.get("sub")
    if subject is None:
        raise AuthError("Invalid authentication token")

    # The row is re-read rather than trusted from the payload, so a deleted
    # account cannot keep using a token that has not expired yet.
    user = get_user_by_id(int(subject))
    if user is None:
        raise AuthError("Account no longer exists")
    return user


def _secret() -> str:
    """
    The HS256 signing key.

    A blank JWT_SECRET falls back to a per-process random key: tokens then stop
    working after a restart, which is survivable in development and loudly wrong
    in production. It is deliberately not a fixed default — a hardcoded key
    committed to the repo would let anyone forge tokens.
    """
    if settings.jwt_secret:
        return settings.jwt_secret
    global _EPHEMERAL_SECRET
    if _EPHEMERAL_SECRET is None:
        _EPHEMERAL_SECRET = secrets.token_urlsafe(48)
        logger.warning(
            "JWT_SECRET is not set — using a random key for this process only. "
            "All sessions will be invalidated on restart. Set JWT_SECRET in .env."
        )
    return _EPHEMERAL_SECRET


_EPHEMERAL_SECRET: str | None = None
