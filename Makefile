.PHONY: install dev dev-backend dev-frontend test test-backend test-frontend lint build serve docker migrate migration

install:
	cd backend && python3 -m venv .venv && .venv/bin/pip install -e ".[dev]"
	cd frontend && npm ci

# Runs backend (:8000) and frontend (:5173) together. Open http://localhost:5173
dev:
	$(MAKE) -j2 dev-backend dev-frontend

dev-backend:
	cd backend && .venv/bin/uvicorn app.main:app --reload --port 8000

dev-frontend:
	cd frontend && npm run dev

test: test-backend test-frontend

test-backend:
	cd backend && .venv/bin/pytest -q

test-frontend:
	cd frontend && npm test

lint:
	cd backend && .venv/bin/ruff check .
	cd frontend && npm run typecheck

build:
	cd frontend && npm run build

# Production-like: FastAPI serves the built app on http://localhost:8000
serve: build
	cd backend && FRONTEND_URL=http://localhost:8000 STRAVA_REDIRECT_URI=http://localhost:8000/api/strava/callback \
		.venv/bin/uvicorn app.main:app --port 8000

docker:
	docker compose up --build

# Apply pending Alembic migrations to $DATABASE_URL (defaults to backend/data/rowlog.db).
# Also runs automatically on app startup, so this is mainly for CI/scripting.
migrate:
	cd backend && .venv/bin/alembic upgrade head

# Generate a migration from model changes: make migration name="add foo column"
migration:
	cd backend && .venv/bin/alembic revision --autogenerate -m "$(name)"
