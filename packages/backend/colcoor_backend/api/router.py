from fastapi import APIRouter

from colcoor_backend.api.routes import auth, conversations, health, me, side_chat

api_router = APIRouter()
api_router.include_router(health.router, tags=["health"])
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(me.router, prefix="/me", tags=["profile"])
api_router.include_router(conversations.router, prefix="/conversations", tags=["conversations"])
api_router.include_router(side_chat.router, prefix="/conversations", tags=["side-chat"])
