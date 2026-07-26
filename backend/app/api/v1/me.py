"""
Personal cabinet: profile, analysis history and saved locations.

Everything here is scoped to the bearer token's user. Ownership is enforced in
the queries themselves (`WHERE ... AND user_id = ?`) rather than by reading a
row and comparing afterwards, so a mismatched id is indistinguishable from a
missing one and cannot be used to probe which analysis ids exist.
"""

import asyncio
import logging

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status

from app.api.deps import current_user
from app.api.v1.community import report_out
from app.services import auth as auth_service, store
from app.services.auth import AuthError, User
from app.services.schemas import (
    ChangePasswordRequest,
    SaveLocationRequest,
    ShareAnalysisRequest,
)

logger = logging.getLogger("airq.api")
router = APIRouter(prefix="/me", tags=["cabinet"])


def _analysis_out(record: store.AnalysisRecord) -> dict:
    return {
        "id": record.id,
        "createdAt": record.created_at,
        "latitude": record.latitude,
        "longitude": record.longitude,
        "aqi": record.aqi,
        "pm25": round(record.pm25, 1),
        "rawAiPm25": record.raw_ai_pm25,
        "uncertainty": record.uncertainty,
        "confidence": record.confidence,
        "skyScore": record.sky_score,
        "statusText": record.status_text,
        "fusionMethod": record.fusion_method,
        "stationsUsed": record.stations_used,
        "place": record.place,
        "isPublic": record.is_public,
        "hasThumbnail": record.has_thumbnail,
        "thumbnailUrl": f"/api/v1/me/analyses/{record.id}/thumbnail" if record.has_thumbnail else None,
    }


def _location_out(loc: store.SavedLocation) -> dict:
    return {
        "id": loc.id,
        "name": loc.name,
        "latitude": loc.latitude,
        "longitude": loc.longitude,
        "createdAt": loc.created_at,
    }


# ── Profile ──────────────────────────────────────────────────────────

@router.get("/profile")
async def profile(user: User = Depends(current_user)):
    """Account details plus the aggregates the cabinet header shows."""
    stats = await asyncio.to_thread(store.user_stats, user.id)
    trend = await asyncio.to_thread(store.analysis_trend, user.id, 30)
    return {
        "user": {
            "id": user.id,
            "username": user.username,
            "created_at": user.created_at,
            "is_admin": auth_service.is_admin(user.username),
        },
        "stats": stats,
        "trend": trend,
    }


@router.post("/password", status_code=status.HTTP_204_NO_CONTENT)
async def change_password(body: ChangePasswordRequest, user: User = Depends(current_user)):
    """
    Change the account password.

    Existing tokens keep working: they are signed with a server secret, not
    derived from the password, so there is nothing here that invalidates them.
    Session revocation would need a token version column — out of scope.
    """
    try:
        # PBKDF2 twice over (verify + hash) is ~0.5 s of CPU, which would stall
        # the event loop inline. Same reasoning as register/login.
        await asyncio.to_thread(
            auth_service.change_password, user.id, body.current_password, body.new_password
        )
    except AuthError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    logger.info("Password changed for user %r", user.username)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ── Analysis history ─────────────────────────────────────────────────

@router.get("/analyses")
async def list_analyses(
    limit: int = Query(30, ge=1, le=100),
    offset: int = Query(0, ge=0),
    user: User = Depends(current_user),
):
    """Past scans, newest first."""
    records = await asyncio.to_thread(store.list_analyses, user.id, limit, offset)
    total = await asyncio.to_thread(store.count_analyses, user.id)
    return {
        "total": total,
        "count": len(records),
        "limit": limit,
        "offset": offset,
        "analyses": [_analysis_out(r) for r in records],
    }


@router.get("/analyses/{analysis_id}")
async def get_analysis(analysis_id: int, user: User = Depends(current_user)):
    record = await asyncio.to_thread(store.get_analysis, analysis_id)
    if record is None or record.user_id != user.id:
        raise HTTPException(status_code=404, detail="Analysis not found")
    return _analysis_out(record)


@router.get("/analyses/{analysis_id}/thumbnail")
async def get_analysis_thumbnail(analysis_id: int, user: User = Depends(current_user)):
    """
    The stored frame for one scan.

    Cached privately and immutably: the bytes for a given id never change, but
    they are one user's photograph and must not land in a shared cache.
    """
    record = await asyncio.to_thread(store.get_analysis, analysis_id)
    if record is None or record.user_id != user.id:
        raise HTTPException(status_code=404, detail="Analysis not found")

    data = await asyncio.to_thread(store.get_thumbnail, analysis_id)
    if data is None:
        raise HTTPException(status_code=404, detail="No image stored for this analysis")

    return Response(
        content=data,
        media_type="image/jpeg",
        headers={"Cache-Control": "private, max-age=86400, immutable"},
    )


@router.patch("/analyses/{analysis_id}")
async def share_analysis(
    analysis_id: int,
    body: ShareAnalysisRequest,
    user: User = Depends(current_user),
):
    """
    Publish a scan to the community map, or take it back down.

    Sharing exposes the coordinates and the photo to every user, so it is
    off by default and only ever turned on by this call.
    """
    ok = await asyncio.to_thread(store.set_analysis_public, analysis_id, user.id, body.is_public)
    if not ok:
        raise HTTPException(status_code=404, detail="Analysis not found")

    record = await asyncio.to_thread(store.get_analysis, analysis_id)
    return _analysis_out(record)


@router.delete("/analyses/{analysis_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_analysis(analysis_id: int, user: User = Depends(current_user)):
    ok = await asyncio.to_thread(store.delete_analysis, analysis_id, user.id)
    if not ok:
        raise HTTPException(status_code=404, detail="Analysis not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ── Saved locations ──────────────────────────────────────────────────

@router.get("/locations")
async def list_locations(user: User = Depends(current_user)):
    locations = await asyncio.to_thread(store.list_locations, user.id)
    return {"count": len(locations), "locations": [_location_out(l) for l in locations]}


@router.post("/locations", status_code=status.HTTP_201_CREATED)
async def add_location(body: SaveLocationRequest, user: User = Depends(current_user)):
    """Pin a place so the map and the route planner can jump straight to it."""
    try:
        loc = await asyncio.to_thread(
            store.add_location, user.id, body.name, body.latitude, body.longitude
        )
    except store.StoreError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    return _location_out(loc)


@router.delete("/locations/{location_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_location(location_id: int, user: User = Depends(current_user)):
    ok = await asyncio.to_thread(store.delete_location, location_id, user.id)
    if not ok:
        raise HTTPException(status_code=404, detail="Location not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ── Own reports ──────────────────────────────────────────────────────

@router.get("/reports")
async def my_reports(
    limit: int = Query(50, ge=1, le=200),
    user: User = Depends(current_user),
):
    """The reports this account has filed, newest first."""
    reports = await asyncio.to_thread(store.list_user_reports, user.id, limit)
    return {"count": len(reports), "reports": [report_out(r) for r in reports]}
