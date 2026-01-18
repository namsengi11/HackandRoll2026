import uvicorn
from fastapi import FastAPI

from raredex_backend.label_generation.api.routes import router
from raredex_backend.label_generation.core.config import get_settings


def create_app() -> FastAPI:
    app = FastAPI(title="RareDex Label Service")

    settings = get_settings()
    # Attach settings to router (simple DI)
    router.settings = settings  # type: ignore[attr-defined]

    app.include_router(router)
    return app


app = create_app()


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
