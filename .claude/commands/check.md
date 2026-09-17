Run the full quality gate and fix anything that fails before reporting back:

1. `cd backend && .venv/bin/ruff check . && .venv/bin/pytest -q`
2. `cd frontend && npm run typecheck && npm test && npm run build`

If a dependency is missing, run `make install` first. Summarise what failed and what you changed.
