"""Strava API client: OAuth token exchange/refresh and activity file upload.

Docs: https://developers.strava.com/docs/authentication/ and
https://developers.strava.com/docs/uploads/
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from urllib.parse import urlencode

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import Settings
from app.models import StravaToken

AUTHORIZE_URL = "https://www.strava.com/oauth/authorize"
TOKEN_URL = "https://www.strava.com/oauth/token"
API_BASE = "https://www.strava.com/api/v3"
SCOPE = "read,activity:write"


class StravaError(Exception):
    pass


class StravaNotConnected(StravaError):
    pass


@dataclass
class UploadState:
    upload_id: int
    status: str  # processing | done | error
    activity_id: int | None = None
    error: str | None = None


class StravaClient:
    def __init__(self, settings: Settings, transport: httpx.BaseTransport | None = None):
        self.settings = settings
        self._http = httpx.Client(timeout=30, transport=transport)

    # --- OAuth ---------------------------------------------------------------------------
    def authorize_url(self, state: str) -> str:
        params = {
            "client_id": self.settings.strava_client_id,
            "redirect_uri": self.settings.strava_redirect_uri,
            "response_type": "code",
            "approval_prompt": "auto",
            "scope": SCOPE,
            "state": state,
        }
        return f"{AUTHORIZE_URL}?{urlencode(params)}"

    def exchange_code(self, db: Session, code: str) -> StravaToken:
        payload = self._token_request({"code": code, "grant_type": "authorization_code"})
        athlete = payload.get("athlete") or {}
        db.query(StravaToken).delete()
        token = StravaToken(
            athlete_id=athlete.get("id", 0),
            athlete_name=f"{athlete.get('firstname', '')} {athlete.get('lastname', '')}".strip(),
            access_token=payload["access_token"],
            refresh_token=payload["refresh_token"],
            expires_at=payload["expires_at"],
        )
        db.add(token)
        db.commit()
        return token

    def valid_access_token(self, db: Session) -> str:
        token = db.scalars(select(StravaToken)).first()
        if token is None:
            raise StravaNotConnected("Strava is not connected")
        # Refresh a bit before expiry (tokens last 6 hours).
        if token.expires_at - 300 <= time.time():
            payload = self._token_request(
                {"refresh_token": token.refresh_token, "grant_type": "refresh_token"}
            )
            token.access_token = payload["access_token"]
            token.refresh_token = payload["refresh_token"]
            token.expires_at = payload["expires_at"]
            db.commit()
        return token.access_token

    def _token_request(self, extra: dict) -> dict:
        data = {
            "client_id": self.settings.strava_client_id,
            "client_secret": self.settings.strava_client_secret,
            **extra,
        }
        resp = self._http.post(TOKEN_URL, data=data)
        if resp.status_code != 200:
            raise StravaError(f"Strava token request failed ({resp.status_code}): {resp.text}")
        return resp.json()

    # --- Uploads -------------------------------------------------------------------------
    def upload_fit(
        self, db: Session, fit_bytes: bytes, *, name: str, description: str, external_id: str
    ) -> UploadState:
        headers = {"Authorization": f"Bearer {self.valid_access_token(db)}"}
        resp = self._http.post(
            f"{API_BASE}/uploads",
            headers=headers,
            data={
                "data_type": "fit",
                "name": name,
                "description": description,
                "trainer": "1",
                "external_id": external_id,
            },
            files={"file": (f"{external_id}.fit", fit_bytes, "application/octet-stream")},
        )
        if resp.status_code not in (200, 201):
            raise StravaError(f"Upload failed ({resp.status_code}): {resp.text}")
        return self._parse_upload(resp.json())

    def upload_status(self, db: Session, upload_id: int) -> UploadState:
        headers = {"Authorization": f"Bearer {self.valid_access_token(db)}"}
        resp = self._http.get(f"{API_BASE}/uploads/{upload_id}", headers=headers)
        if resp.status_code != 200:
            raise StravaError(f"Upload status failed ({resp.status_code}): {resp.text}")
        return self._parse_upload(resp.json())

    @staticmethod
    def _parse_upload(body: dict) -> UploadState:
        if body.get("error"):
            status = "error"
        elif body.get("activity_id"):
            status = "done"
        else:
            status = "processing"
        return UploadState(
            upload_id=body["id"],
            status=status,
            activity_id=body.get("activity_id"),
            error=body.get("error"),
        )
