.DEFAULT_GOAL := help
.PHONY: help setup up down logs smoke test lint fmt engine-local clean

help:  ## Show available targets
	@grep -hE '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) \
		| awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

setup:  ## Install the workspace (Python 3.12 pinned)
	uv sync --all-packages

up:  ## Start local GCP substitutes (Pub/Sub + Firestore emulators)
	docker compose -f docker-compose.local.yml up -d
	@echo "waiting for emulators..."
	@until docker compose -f docker-compose.local.yml ps --format json \
		| grep -q healthy 2>/dev/null; do sleep 2; done || true
	@docker compose -f docker-compose.local.yml ps

down:  ## Stop emulators
	docker compose -f docker-compose.local.yml down

logs:  ## Tail emulator logs
	docker compose -f docker-compose.local.yml logs -f

smoke:  ## P0 exit gate — all three ports + a real Vertex call
	uv run python scripts/smoke.py

test:  ## Run the test suite (offline; cassettes, no cloud)
	uv run pytest

lint:  ## Ruff check
	uv run ruff check .

fmt:  ## Ruff format + import sort
	uv run ruff format . && uv run ruff check --fix .

engine-local:  ## Run the exposure engine on :8080
	uv run uvicorn autonaly_engine.main:app --reload --port 8080

clean:  ## Remove local artifacts and caches
	rm -rf artifacts/_smoke .pytest_cache .ruff_cache
