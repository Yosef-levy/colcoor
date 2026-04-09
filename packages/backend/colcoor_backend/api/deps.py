from typing import Annotated

from fastapi import Depends, Header, HTTPException, status


async def bearer_token(authorization: Annotated[str | None, Header()] = None) -> str:
    """Require Authorization: Bearer <token> on protected routes (docs/monetization.md)."""
    if authorization is None or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid Authorization header",
        )
    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Empty bearer token",
        )
    return token


BearerToken = Annotated[str, Depends(bearer_token)]
