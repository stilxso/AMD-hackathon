"""
Crowdsourced observations.

Two kinds of user contribution share one map layer:

- **Reports** — a subjective judgement of the air at a coordinate, optionally
  with visibility, symptoms and a note. No instrument, no model.
- **Shared analyses** — a photo scan whose owner chose to publish it. The number
  comes from the same pipeline as a private scan.

Neither feeds `FusionEngine`. Unvalidated submissions moving the headline number
is a distinct decision with its own failure mode (a handful of bad reports would
skew the estimate everyone sees), so crowd data is displayed alongside the
measured and modelled layers, never merged into them.
"""

import asyncio
import logging

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status

from app.api.deps import current_user
from app.services import store
from app.services.auth import User
from app.services.fusion import pm25_to_aqi
from app.services.schemas import ReportRequest

logger = logging.getLogger("airq.api")
router = APIRouter(prefix="/community", tags=["community"])

# Reports are opinions about a moment. Older ones stop describing current air,
# so the map layer is bounded rather than cumulative.
_REPORT_MAX_AGE_H = 24
_SHARED_MAX_AGE_H = 48


def report_out(report: store.Report) -> dict:
    return {
        "id": report.id,
        "username": report.username,
        "createdAt": report.created_at,
        "latitude": report.latitude,
        "longitude": report.longitude,
        "perceived": report.perceived,
        "visibilityKm": report.visibility_km,
        "symptoms": report.symptoms,
        "note": report.note,
    }


def _shared_out(record: store.AnalysisRecord) -> dict:
    """
    A published scan, as seen by other users.

    Deliberately narrower than the owner's own view in /me/analyses: the model
    diagnostics (sky score, MC-dropout uncertainty, raw head output) are for the
    person who took the photo, not for the map.
    """
    return {
        "id": record.id,
        "username": record.username,
        "createdAt": record.created_at,
        "latitude": record.latitude,
        "longitude": record.longitude,
        "aqi": record.aqi,
        "pm25": round(record.pm25, 1),
        "statusText": record.status_text,
        "place": record.place,
        "thumbnailUrl": (
            f"/api/v1/community/analyses/{record.id}/thumbnail" if record.has_thumbnail else None
        ),
    }


def _validate_box(min_lat: float, min_lng: float, max_lat: float, max_lng: float) -> None:
    if min_lat >= max_lat or min_lng >= max_lng:
        raise HTTPException(status_code=400, detail="Empty or inverted bounding box")


# ── Reports ──────────────────────────────────────────────────────────

@router.post("/reports", status_code=status.HTTP_201_CREATED)
async def create_report(body: ReportRequest, user: User = Depends(current_user)):
    """
    File an observation of the air where you are.

    Authenticated so every pin has an author — an anonymous endpoint that writes
    to a public map is an open invitation to fill it with noise.
    """
    try:
        report = await asyncio.to_thread(
            store.add_report,
            user_id=user.id,
            latitude=body.latitude,
            longitude=body.longitude,
            perceived=body.perceived,
            visibility_km=body.visibility_km,
            symptoms=body.symptoms,
            note=body.note,
        )
    except store.StoreError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    logger.info(
        "Report %d from %r at %.3f,%.3f: %s",
        report.id, user.username, body.latitude, body.longitude, body.perceived,
    )
    return report_out(report)


@router.get("/reports")
async def list_reports(
    min_lat: float = Query(..., ge=-90.0, le=90.0),
    min_lng: float = Query(..., ge=-180.0, le=180.0),
    max_lat: float = Query(..., ge=-90.0, le=90.0),
    max_lng: float = Query(..., ge=-180.0, le=180.0),
    hours: int = Query(_REPORT_MAX_AGE_H, ge=1, le=168),
    limit: int = Query(200, ge=1, le=500),
):
    """
    Recent reports inside the viewport.

    Unauthenticated like /stations, so the landing map can draw the community
    layer before anyone signs in. Reports carry a username and a coarse
    coordinate and nothing else about their author.
    """
    _validate_box(min_lat, min_lng, max_lat, max_lng)
    reports = await asyncio.to_thread(
        store.list_reports_in_box,
        min_lat, min_lng, max_lat, max_lng,
        max_age_hours=hours,
        limit=limit,
    )
    return {"count": len(reports), "hours": hours, "reports": [report_out(r) for r in reports]}


@router.delete("/reports/{report_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_report(report_id: int, user: User = Depends(current_user)):
    """Withdraw your own report. Someone else's returns 404, not 403."""
    ok = await asyncio.to_thread(store.delete_report, report_id, user.id)
    if not ok:
        raise HTTPException(status_code=404, detail="Report not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ── Shared analyses ──────────────────────────────────────────────────

@router.get("/analyses")
async def list_shared_analyses(
    min_lat: float = Query(..., ge=-90.0, le=90.0),
    min_lng: float = Query(..., ge=-180.0, le=180.0),
    max_lat: float = Query(..., ge=-90.0, le=90.0),
    max_lng: float = Query(..., ge=-180.0, le=180.0),
    hours: int = Query(_SHARED_MAX_AGE_H, ge=1, le=336),
    limit: int = Query(200, ge=1, le=500),
):
    """Photo scans their owners published, inside the viewport."""
    _validate_box(min_lat, min_lng, max_lat, max_lng)
    records = await asyncio.to_thread(
        store.list_public_analyses_in_box,
        min_lat, min_lng, max_lat, max_lng,
        max_age_hours=hours,
        limit=limit,
    )
    return {"count": len(records), "hours": hours, "analyses": [_shared_out(r) for r in records]}


@router.get("/analyses/{analysis_id}/thumbnail")
async def shared_thumbnail(analysis_id: int):
    """
    The photo behind a shared scan.

    The is_public check is repeated here rather than assumed from the listing:
    this URL is guessable, and without it un-sharing an analysis would leave its
    image reachable by id.
    """
    record = await asyncio.to_thread(store.get_analysis, analysis_id)
    if record is None or not record.is_public:
        raise HTTPException(status_code=404, detail="Analysis not found")

    data = await asyncio.to_thread(store.get_thumbnail, analysis_id)
    if data is None:
        raise HTTPException(status_code=404, detail="No image stored for this analysis")

    return Response(
        content=data,
        media_type="image/jpeg",
        headers={"Cache-Control": "public, max-age=3600"},
    )


# ── Summary ──────────────────────────────────────────────────────────

@router.get("/summary")
async def community_summary(
    min_lat: float = Query(..., ge=-90.0, le=90.0),
    min_lng: float = Query(..., ge=-180.0, le=180.0),
    max_lat: float = Query(..., ge=-90.0, le=90.0),
    max_lng: float = Query(..., ge=-180.0, le=180.0),
    hours: int = Query(_REPORT_MAX_AGE_H, ge=1, le=168),
):
    """
    What the crowd is saying in this viewport: the spread of perceived levels
    and the mean AQI of the shared scans.

    This is what lets the UI put "12 people nearby call the air poor" next to a
    monitor reading, which is the whole point of collecting the reports.
    """
    _validate_box(min_lat, min_lng, max_lat, max_lng)

    reports, shared = await asyncio.gather(
        asyncio.to_thread(
            store.list_reports_in_box,
            min_lat, min_lng, max_lat, max_lng, max_age_hours=hours, limit=500,
        ),
        asyncio.to_thread(
            store.list_public_analyses_in_box,
            min_lat, min_lng, max_lat, max_lng, max_age_hours=hours, limit=500,
        ),
    )

    breakdown = {level: 0 for level in store.PERCEIVED_LEVELS}
    for r in reports:
        breakdown[r.perceived] = breakdown.get(r.perceived, 0) + 1

    visibilities = [r.visibility_km for r in reports if r.visibility_km is not None]
    shared_pm25 = [a.pm25 for a in shared]

    return {
        "hours": hours,
        "reports": len(reports),
        "sharedAnalyses": len(shared),
        "perceived": breakdown,
        # The most-reported level, or None when nobody has reported. A tie
        # resolves to the more severe side, since understating air quality is
        # the costlier error.
        "consensus": (
            max(store.PERCEIVED_LEVELS, key=lambda lvl: (breakdown[lvl], store.PERCEIVED_LEVELS.index(lvl)))
            if reports else None
        ),
        "meanVisibilityKm": round(sum(visibilities) / len(visibilities), 1) if visibilities else None,
        "sharedMeanPm25": round(sum(shared_pm25) / len(shared_pm25), 1) if shared_pm25 else None,
        "sharedMeanAqi": pm25_to_aqi(sum(shared_pm25) / len(shared_pm25)) if shared_pm25 else None,
    }
