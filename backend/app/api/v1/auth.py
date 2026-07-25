import asyncio
import logging

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.deps import current_user
from app.services import auth as auth_service
from app.services.auth import AuthError, User, UsernameTakenError
from app.services.schemas import (
    LoginRequest,
    RegisterRequest,
    TokenResponse,
    UserOut,
)

logger = logging.getLogger("airq.api")
router = APIRouter(prefix="/auth", tags=["auth"])


def _user_out(user: User) -> UserOut:
    """Single place the is_admin flag is derived, so login and /me cannot drift."""
    return UserOut(
        id=user.id,
        username=user.username,
        created_at=user.created_at,
        is_admin=auth_service.is_admin(user.username),
    )


def _token_response(user: User) -> TokenResponse:
    token, expires_in = auth_service.create_access_token(user)
    return TokenResponse(
        access_token=token,
        expires_in=expires_in,
        user=_user_out(user),
    )


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(body: RegisterRequest):
    """Create an account and return a token, so signing up logs you straight in."""
    try:
        # PBKDF2 at 600k iterations takes ~100-300 ms, which would stall the
        # event loop for every other request if run inline.
        user = await asyncio.to_thread(auth_service.create_user, body.username, body.password)
    except UsernameTakenError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    except AuthError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    logger.info("Registered user %r (id=%d)", user.username, user.id)
    return _token_response(user)


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest):
    try:
        user = await asyncio.to_thread(auth_service.authenticate, body.username, body.password)
    except AuthError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
            headers={"WWW-Authenticate": "Bearer"},
        )

    return _token_response(user)


@router.get("/me", response_model=UserOut)
async def me(user: User = Depends(current_user)):
    """Used by the frontend to validate a stored token on page load."""
    return _user_out(user)
