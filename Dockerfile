# --- Build the frontend ---
FROM node:22-alpine AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# --- Python runtime serving API + built frontend ---
FROM python:3.12-slim
WORKDIR /app/backend
COPY backend/pyproject.toml ./
COPY backend/app ./app
RUN pip install --no-cache-dir .
COPY --from=web /web/dist /app/frontend/dist

ENV STATIC_DIR=/app/frontend/dist \
    DATABASE_URL=sqlite:////data/rowlog.db \
    FRONTEND_URL=http://localhost:8000 \
    CORS_ORIGINS=http://localhost:8000 \
    STRAVA_REDIRECT_URI=http://localhost:8000/api/strava/callback

VOLUME /data
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
