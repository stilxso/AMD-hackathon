"""
Per-user persistence: analysis history, saved locations and community reports.

Shares the SQLite file that holds `users` (settings.db_abs_path). Like
app.services.auth this stays on plain sqlite3 — the tables are flat and the
queries are single-table lookups, which does not justify an ORM.

Thumbnails are stored as JPEG BLOBs on the analyses row rather than as files on
disk: the rows are already user-scoped and deleted with the account's data, so
keeping the bytes in the same place removes the orphaned-file problem entirely.
At THUMBNAIL_MAX_PX a frame is a few kB, so this stays far from the size where
a BLOB column becomes the wrong call.
"""

import logging
import sqlite3
from dataclasses import dataclass
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
from typing import Literal, Optional

from app.config import settings

logger = logging.getLogger("airq.store")

# Longest edge of a stored history thumbnail, in pixels.
THUMBNAIL_MAX_PX = 320
THUMBNAIL_QUALITY = 72

PerceivedLevel = Literal["good", "moderate", "poor", "severe"]
PERCEIVED_LEVELS: tuple[str, ...] = ("good", "moderate", "poor", "severe")


class StoreError(Exception):
    """Recoverable persistence failure (bad input, name collision)."""


def connect() -> sqlite3.Connection:
    path: Path = settings.db_abs_path
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    # History and report reads are user-scoped and frequent; the default
    # journal serialises them behind any write.
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_store() -> None:
    """Create the history / locations / reports tables. Safe to call repeatedly."""
    with connect() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS analyses (
                id             INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                created_at     TEXT    NOT NULL,
                latitude       REAL    NOT NULL,
                longitude      REAL    NOT NULL,
                aqi            INTEGER NOT NULL,
                pm25           REAL    NOT NULL,
                raw_ai_pm25    REAL,
                uncertainty    REAL,
                confidence     REAL,
                sky_score      REAL,
                status_text    TEXT,
                fusion_method  TEXT,
                stations_used  INTEGER NOT NULL DEFAULT 0,
                place          TEXT,
                is_public      INTEGER NOT NULL DEFAULT 0,
                thumbnail      BLOB
            );
            CREATE INDEX IF NOT EXISTS idx_analyses_user
                ON analyses (user_id, created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_analyses_public
                ON analyses (is_public, created_at DESC);

            CREATE TABLE IF NOT EXISTS saved_locations (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                name       TEXT    NOT NULL,
                latitude   REAL    NOT NULL,
                longitude  REAL    NOT NULL,
                created_at TEXT    NOT NULL,
                UNIQUE (user_id, name COLLATE NOCASE)
            );

            CREATE TABLE IF NOT EXISTS reports (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                created_at    TEXT    NOT NULL,
                latitude      REAL    NOT NULL,
                longitude     REAL    NOT NULL,
                perceived     TEXT    NOT NULL,
                visibility_km REAL,
                symptoms      TEXT,
                note          TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_reports_created
                ON reports (created_at DESC);
            """
        )


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ── Thumbnails ───────────────────────────────────────────────────────

def make_thumbnail(image_bytes: bytes) -> Optional[bytes]:
    """
    Downscale an upload to a small JPEG for the history list.

    Returns None if the image cannot be decoded. History is a side effect of a
    successful analysis, so a thumbnail failure must never fail the request —
    the row is still worth keeping without the picture.
    """
    try:
        from PIL import Image

        with Image.open(BytesIO(image_bytes)) as img:
            # EXIF-rotated phone photos would otherwise be stored sideways.
            from PIL import ImageOps

            img = ImageOps.exif_transpose(img)
            img = img.convert("RGB")
            img.thumbnail((THUMBNAIL_MAX_PX, THUMBNAIL_MAX_PX))

            buf = BytesIO()
            img.save(buf, format="JPEG", quality=THUMBNAIL_QUALITY, optimize=True)
            return buf.getvalue()
    except Exception as exc:
        logger.warning("Could not build history thumbnail: %s", exc)
        return None


# ── Analysis history ─────────────────────────────────────────────────

@dataclass(frozen=True)
class AnalysisRecord:
    id: int
    user_id: int
    username: str
    created_at: str
    latitude: float
    longitude: float
    aqi: int
    pm25: float
    raw_ai_pm25: Optional[float]
    uncertainty: Optional[float]
    confidence: Optional[float]
    sky_score: Optional[float]
    status_text: Optional[str]
    fusion_method: Optional[str]
    stations_used: int
    place: Optional[str]
    is_public: bool
    has_thumbnail: bool


_ANALYSIS_COLUMNS = """
    a.id, a.user_id, u.username, a.created_at, a.latitude, a.longitude,
    a.aqi, a.pm25, a.raw_ai_pm25, a.uncertainty, a.confidence, a.sky_score,
    a.status_text, a.fusion_method, a.stations_used, a.place, a.is_public,
    (a.thumbnail IS NOT NULL) AS has_thumbnail
"""


def _row_to_analysis(row: sqlite3.Row) -> AnalysisRecord:
    return AnalysisRecord(
        id=row["id"],
        user_id=row["user_id"],
        username=row["username"],
        created_at=row["created_at"],
        latitude=row["latitude"],
        longitude=row["longitude"],
        aqi=row["aqi"],
        pm25=row["pm25"],
        raw_ai_pm25=row["raw_ai_pm25"],
        uncertainty=row["uncertainty"],
        confidence=row["confidence"],
        sky_score=row["sky_score"],
        status_text=row["status_text"],
        fusion_method=row["fusion_method"],
        stations_used=row["stations_used"],
        place=row["place"],
        is_public=bool(row["is_public"]),
        has_thumbnail=bool(row["has_thumbnail"]),
    )


def save_analysis(
    *,
    user_id: int,
    latitude: float,
    longitude: float,
    aqi: int,
    pm25: float,
    raw_ai_pm25: Optional[float] = None,
    uncertainty: Optional[float] = None,
    confidence: Optional[float] = None,
    sky_score: Optional[float] = None,
    status_text: Optional[str] = None,
    fusion_method: Optional[str] = None,
    stations_used: int = 0,
    place: Optional[str] = None,
    thumbnail: Optional[bytes] = None,
) -> int:
    with connect() as conn:
        cur = conn.execute(
            """
            INSERT INTO analyses (
                user_id, created_at, latitude, longitude, aqi, pm25,
                raw_ai_pm25, uncertainty, confidence, sky_score, status_text,
                fusion_method, stations_used, place, thumbnail
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                user_id, _now(), latitude, longitude, aqi, pm25,
                raw_ai_pm25, uncertainty, confidence, sky_score, status_text,
                fusion_method, stations_used, place, thumbnail,
            ),
        )
        return cur.lastrowid


def list_analyses(user_id: int, limit: int = 30, offset: int = 0) -> list[AnalysisRecord]:
    with connect() as conn:
        rows = conn.execute(
            f"""
            SELECT {_ANALYSIS_COLUMNS}
            FROM analyses a JOIN users u ON u.id = a.user_id
            WHERE a.user_id = ?
            ORDER BY a.created_at DESC, a.id DESC
            LIMIT ? OFFSET ?
            """,
            (user_id, limit, offset),
        ).fetchall()
    return [_row_to_analysis(r) for r in rows]


def count_analyses(user_id: int) -> int:
    with connect() as conn:
        return conn.execute(
            "SELECT COUNT(*) FROM analyses WHERE user_id = ?", (user_id,)
        ).fetchone()[0]


def get_analysis(analysis_id: int) -> Optional[AnalysisRecord]:
    """Fetch by id without an ownership filter — callers decide what they allow."""
    with connect() as conn:
        row = conn.execute(
            f"""
            SELECT {_ANALYSIS_COLUMNS}
            FROM analyses a JOIN users u ON u.id = a.user_id
            WHERE a.id = ?
            """,
            (analysis_id,),
        ).fetchone()
    return _row_to_analysis(row) if row else None


def get_thumbnail(analysis_id: int) -> Optional[bytes]:
    with connect() as conn:
        row = conn.execute(
            "SELECT thumbnail FROM analyses WHERE id = ?", (analysis_id,)
        ).fetchone()
    return row["thumbnail"] if row and row["thumbnail"] else None


def set_analysis_public(analysis_id: int, user_id: int, is_public: bool) -> bool:
    """Returns False when the row does not exist or belongs to someone else."""
    with connect() as conn:
        cur = conn.execute(
            "UPDATE analyses SET is_public = ? WHERE id = ? AND user_id = ?",
            (1 if is_public else 0, analysis_id, user_id),
        )
        return cur.rowcount > 0


def delete_analysis(analysis_id: int, user_id: int) -> bool:
    with connect() as conn:
        cur = conn.execute(
            "DELETE FROM analyses WHERE id = ? AND user_id = ?", (analysis_id, user_id)
        )
        return cur.rowcount > 0


def user_stats(user_id: int) -> dict:
    """Headline numbers for the personal cabinet."""
    with connect() as conn:
        row = conn.execute(
            """
            SELECT COUNT(*)        AS total,
                   AVG(aqi)        AS avg_aqi,
                   MAX(aqi)        AS worst_aqi,
                   MIN(aqi)        AS best_aqi,
                   MAX(created_at) AS last_at,
                   SUM(is_public)  AS shared
            FROM analyses WHERE user_id = ?
            """,
            (user_id,),
        ).fetchone()
        reports = conn.execute(
            "SELECT COUNT(*) FROM reports WHERE user_id = ?", (user_id,)
        ).fetchone()[0]
        locations = conn.execute(
            "SELECT COUNT(*) FROM saved_locations WHERE user_id = ?", (user_id,)
        ).fetchone()[0]

    total = row["total"] or 0
    return {
        "analyses": total,
        "shared_analyses": row["shared"] or 0,
        "reports": reports,
        "saved_locations": locations,
        # Averages of an empty set are NULL, not 0 — a fresh account has no
        # average AQI, and reporting 0 would read as pristine air.
        "avg_aqi": round(row["avg_aqi"]) if total else None,
        "worst_aqi": row["worst_aqi"] if total else None,
        "best_aqi": row["best_aqi"] if total else None,
        "last_analysis_at": row["last_at"],
    }


def analysis_trend(user_id: int, limit: int = 30) -> list[dict]:
    """Oldest-first AQI series for the cabinet's sparkline."""
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT created_at, aqi, pm25 FROM analyses
            WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT ?
            """,
            (user_id, limit),
        ).fetchall()
    return [
        {"at": r["created_at"], "aqi": r["aqi"], "pm25": round(r["pm25"], 1)}
        for r in reversed(rows)
    ]


# ── Saved locations ──────────────────────────────────────────────────

@dataclass(frozen=True)
class SavedLocation:
    id: int
    name: str
    latitude: float
    longitude: float
    created_at: str


def add_location(user_id: int, name: str, latitude: float, longitude: float) -> SavedLocation:
    name = name.strip()
    if not (1 <= len(name) <= 60):
        raise StoreError("Name must be 1-60 characters")

    now = _now()
    try:
        with connect() as conn:
            cur = conn.execute(
                """
                INSERT INTO saved_locations (user_id, name, latitude, longitude, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (user_id, name, latitude, longitude, now),
            )
            location_id = cur.lastrowid
    except sqlite3.IntegrityError:
        raise StoreError("You already saved a location with that name")

    return SavedLocation(
        id=location_id, name=name, latitude=latitude, longitude=longitude, created_at=now
    )


def list_locations(user_id: int) -> list[SavedLocation]:
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT id, name, latitude, longitude, created_at
            FROM saved_locations WHERE user_id = ? ORDER BY created_at DESC
            """,
            (user_id,),
        ).fetchall()
    return [
        SavedLocation(
            id=r["id"],
            name=r["name"],
            latitude=r["latitude"],
            longitude=r["longitude"],
            created_at=r["created_at"],
        )
        for r in rows
    ]


def delete_location(location_id: int, user_id: int) -> bool:
    with connect() as conn:
        cur = conn.execute(
            "DELETE FROM saved_locations WHERE id = ? AND user_id = ?",
            (location_id, user_id),
        )
        return cur.rowcount > 0


# ── Community reports ────────────────────────────────────────────────

@dataclass(frozen=True)
class Report:
    id: int
    user_id: int
    username: str
    created_at: str
    latitude: float
    longitude: float
    perceived: str
    visibility_km: Optional[float]
    symptoms: list[str]
    note: Optional[str]


def _row_to_report(row: sqlite3.Row) -> Report:
    raw = row["symptoms"] or ""
    return Report(
        id=row["id"],
        user_id=row["user_id"],
        username=row["username"],
        created_at=row["created_at"],
        latitude=row["latitude"],
        longitude=row["longitude"],
        perceived=row["perceived"],
        visibility_km=row["visibility_km"],
        symptoms=[s for s in raw.split(",") if s],
        note=row["note"],
    )


def add_report(
    *,
    user_id: int,
    latitude: float,
    longitude: float,
    perceived: str,
    visibility_km: Optional[float] = None,
    symptoms: Optional[list[str]] = None,
    note: Optional[str] = None,
) -> Report:
    if perceived not in PERCEIVED_LEVELS:
        raise StoreError(f"perceived must be one of {', '.join(PERCEIVED_LEVELS)}")

    # Stored comma-joined, so a symptom may not contain the separator.
    cleaned = [s.strip().replace(",", " ") for s in (symptoms or []) if s.strip()][:8]

    with connect() as conn:
        cur = conn.execute(
            """
            INSERT INTO reports (
                user_id, created_at, latitude, longitude, perceived,
                visibility_km, symptoms, note
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                user_id, _now(), latitude, longitude, perceived,
                visibility_km, ",".join(cleaned), (note or "").strip()[:280] or None,
            ),
        )
        row = conn.execute(
            """
            SELECT r.id, r.user_id, u.username, r.created_at, r.latitude, r.longitude,
                   r.perceived, r.visibility_km, r.symptoms, r.note
            FROM reports r JOIN users u ON u.id = r.user_id WHERE r.id = ?
            """,
            (cur.lastrowid,),
        ).fetchone()
    return _row_to_report(row)


def list_reports_in_box(
    min_lat: float,
    min_lng: float,
    max_lat: float,
    max_lng: float,
    *,
    max_age_hours: int = 24,
    limit: int = 200,
) -> list[Report]:
    """
    Recent reports inside a bounding box.

    Age-bounded because a subjective observation describes the air at the moment
    it was written; a week-old pin on the map would read as current conditions.
    """
    cutoff = datetime.now(timezone.utc).timestamp() - max_age_hours * 3600
    cutoff_iso = datetime.fromtimestamp(cutoff, timezone.utc).isoformat()

    with connect() as conn:
        rows = conn.execute(
            """
            SELECT r.id, r.user_id, u.username, r.created_at, r.latitude, r.longitude,
                   r.perceived, r.visibility_km, r.symptoms, r.note
            FROM reports r JOIN users u ON u.id = r.user_id
            WHERE r.latitude BETWEEN ? AND ? AND r.longitude BETWEEN ? AND ?
              AND r.created_at >= ?
            ORDER BY r.created_at DESC
            LIMIT ?
            """,
            (min_lat, max_lat, min_lng, max_lng, cutoff_iso, limit),
        ).fetchall()
    return [_row_to_report(r) for r in rows]


def list_user_reports(user_id: int, limit: int = 50) -> list[Report]:
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT r.id, r.user_id, u.username, r.created_at, r.latitude, r.longitude,
                   r.perceived, r.visibility_km, r.symptoms, r.note
            FROM reports r JOIN users u ON u.id = r.user_id
            WHERE r.user_id = ? ORDER BY r.created_at DESC LIMIT ?
            """,
            (user_id, limit),
        ).fetchall()
    return [_row_to_report(r) for r in rows]


def delete_report(report_id: int, user_id: int) -> bool:
    with connect() as conn:
        cur = conn.execute(
            "DELETE FROM reports WHERE id = ? AND user_id = ?", (report_id, user_id)
        )
        return cur.rowcount > 0


def list_public_analyses_in_box(
    min_lat: float,
    min_lng: float,
    max_lat: float,
    max_lng: float,
    *,
    max_age_hours: int = 48,
    limit: int = 200,
) -> list[AnalysisRecord]:
    """Shared photo analyses inside a box, for the community map layer."""
    cutoff = datetime.now(timezone.utc).timestamp() - max_age_hours * 3600
    cutoff_iso = datetime.fromtimestamp(cutoff, timezone.utc).isoformat()

    with connect() as conn:
        rows = conn.execute(
            f"""
            SELECT {_ANALYSIS_COLUMNS}
            FROM analyses a JOIN users u ON u.id = a.user_id
            WHERE a.is_public = 1
              AND a.latitude BETWEEN ? AND ? AND a.longitude BETWEEN ? AND ?
              AND a.created_at >= ?
            ORDER BY a.created_at DESC
            LIMIT ?
            """,
            (min_lat, max_lat, min_lng, max_lng, cutoff_iso, limit),
        ).fetchall()
    return [_row_to_analysis(r) for r in rows]
