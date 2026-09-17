from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from app.config import get_settings
from app.db import init_engine
from app.routers import stats, strava, workouts


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_engine()
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="RowLog API", version="0.1.0", lifespan=lifespan)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=[o.strip() for o in settings.cors_origins.split(",") if o.strip()],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/api/health")
    def health():
        return {"status": "ok"}

    app.include_router(workouts.router)
    app.include_router(stats.router)
    app.include_router(strava.router)

    # Production: serve the built single-page app, falling back to index.html for client routes.
    static = Path(settings.static_dir)
    if (static / "index.html").exists():
        @app.get("/{path:path}", include_in_schema=False)
        def spa(path: str):
            candidate = (static / path).resolve()
            if path and candidate.is_file() and static.resolve() in candidate.parents:
                return FileResponse(candidate)
            return FileResponse(static / "index.html")

    return app


app = create_app()
