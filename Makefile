SHELL := /bin/bash

.PHONY: start clean ingest test lint

start:
	@echo "Ensuring port 8000 is free..."
	@fuser -k 8000/tcp || true
	@echo "Starting FastAPI server..."
	@source .venv/bin/activate && uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

clean:
	@echo "Freeing port 8000..."
	@fuser -k 8000/tcp || true

ingest:
	@source .venv/bin/activate && python ingest_historical_data.py

test:
	@source .venv/bin/activate && PYTHONPATH=. pytest -p no:warnings

lint:
	@source .venv/bin/activate && ruff check
