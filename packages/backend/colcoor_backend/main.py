import uvicorn

from colcoor_backend.app import create_app
from colcoor_backend.core.config import get_settings
from colcoor_backend.logging_config import configure_logging

app = create_app()


def main() -> None:
    configure_logging()
    settings = get_settings()
    reload = not settings.is_production()
    uvicorn.run(
        "colcoor_backend.main:app",
        host="127.0.0.1",
        port=settings.port,
        reload=reload,
    )


if __name__ == "__main__":
    main()
