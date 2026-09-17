from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration, read from environment variables or a .env file."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str = "sqlite:///./data/rowlog.db"
    # Where the browser app lives. Used to redirect after the Strava OAuth callback.
    frontend_url: str = "http://localhost:5173"
    # Allowed CORS origins (comma separated). Only needed when frontend and backend
    # are served from different origins without the Vite proxy.
    cors_origins: str = "http://localhost:5173"

    strava_client_id: str = ""
    strava_client_secret: str = ""
    # Must match the "Authorization Callback Domain" of your Strava API application.
    strava_redirect_uri: str = "http://localhost:5173/api/strava/callback"

    # Directory of the built frontend (npm run build). Served by FastAPI when present.
    static_dir: str = "../frontend/dist"

    @property
    def strava_configured(self) -> bool:
        return bool(self.strava_client_id and self.strava_client_secret)


@lru_cache
def get_settings() -> Settings:
    return Settings()
