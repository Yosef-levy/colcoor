from fastapi import APIRouter, HTTPException, status

from colcoor_backend.api.schemas import AuthCursorRequest, AuthResponse

router = APIRouter()


@router.post("/cursor", response_model=AuthResponse)
def exchange_cursor_token(_body: AuthCursorRequest) -> AuthResponse:
    """Validate Cursor token and issue backend JWT (docs/authentication.md §3).

    Stub: returns 501 until Cursor verification and user provisioning exist.
    """
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="POST /auth/cursor is not implemented yet",
    )
