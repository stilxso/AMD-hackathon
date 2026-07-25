"""
Shared FastAPI dependencies.

`current_user` is the guard for protected endpoints: it reads the
`Authorization: Bearer <token>` header and resolves it to a User, or fails with
401 and a WWW-Authenticate header so clients know to re-authenticate.
"""

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.services import auth as auth_service
from app.services.auth import AuthError, User

# auto_error=False so a missing header produces our own 401 with the same shape
# as an invalid one, rather than FastAPI's bare 403.
bearer_scheme = HTTPBearer(auto_error=False)


async def current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> User:
    if credentials is None or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        return auth_service.user_from_token(credentials.credentials)
    except AuthError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
            headers={"WWW-Authenticate": "Bearer"},
        )
