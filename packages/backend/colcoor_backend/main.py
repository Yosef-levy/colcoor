import uvicorn

from colcoor_backend.app import create_app

app = create_app()


def main() -> None:
    uvicorn.run(
        "colcoor_backend.main:app",
        host="127.0.0.1",
        port=8000,
        reload=True,
    )


if __name__ == "__main__":
    main()
