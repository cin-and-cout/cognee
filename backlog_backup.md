# Backlog Backup: Claim Consistency Tracker

This file contains the complete backlog details for the Claim Consistency Tracker project. It serves as a local backup and a source for issue creation.

---

## Issue #1: Setup Environment & Architecture Structure

### Background
We are initiating a Python-based implementation for the Claim Consistency Tracker using Cognee as the memory layer. Standard development settings (Ruff, Black, Pytest) ensure consistent style and testing.

### Objective
Setup standard Python project structure, package manager, config files, and dev dependencies.

### Implementation Details
*   Initialize `pyproject.toml` or `requirements.txt`.
*   Include dependencies: `cognee`, `fastapi`, `pydantic`, `uvicorn`, `httpx`, `openai`.
*   Configure `ruff` and `black` inside `pyproject.toml`.
*   Create root project directories: `app/`, `tests/`, `docs/`, `data/`.

### Definition of Done (DoD)
- [ ] Passes global DoD (compiles, linted, unit tests pass)
- [ ] `poetry run ruff check` runs with zero warnings.
- [ ] Project environment successfully initializes and imports all core libraries.

### Files expected to be modified
- `pyproject.toml`
- `README.md`
- `app/__init__.py`

### Dependencies
- None

### Suggested Branch Name
`feature/env-setup`

### Suggested Commit Message
`feat(env): setup project structure and configs`

### Testing & Verification
Run `poetry run ruff check` and `poetry run pytest` to verify the environment.

### Complexity & Priority
* **Complexity:** S
* **Priority:** Critical
* **MoSCoW Category:** Must Have

---

## Issue #2: Cognee Schema Definition & Seed Dataset Creation

### Background
Cognee relies on custom DataPoint classes inheriting from `DataPoint` to index nodes and edges in the semantic graph. We must design schemas that map politicians, sub-topics, and claims.

### Objective
Create Pydantic classes representing `Politician`, `Topic`, and `Claim`, and compile a mock corpus of 50-150 claims with source metadata.

### Implementation Details
*   Define `Politician(DataPoint)` with name and party.
*   Define `Topic(DataPoint)` with name and subtopics.
*   Define `Claim(DataPoint)` with statement text, date, and source link.
*   Create a mock corpus in `data/historical_claims.json`.

### Definition of Done (DoD)
- [ ] Passes global DoD (compiles, linted, unit tests pass)
- [ ] Pydantic schema validation tests pass.
- [ ] Mock dataset contains at least 50 structured statements with dates and source links.

### Files expected to be modified
- `app/schemas.py`
- `data/historical_claims.json`
- `tests/test_schemas.py`

### Dependencies
- #1

### Suggested Branch Name
`feature/cognee-schemas`

### Suggested Commit Message
`feat(schemas): define cognee datapoints and seed data`

### Testing & Verification
Run `pytest tests/test_schemas.py`.

### Complexity & Priority
* **Complexity:** M
* **Priority:** Critical
* **MoSCoW Category:** Must Have

---

## Issue #3: Historical Data Ingestion Pipeline

### Background
Seed data must be ingested with `temporal_cognify=True` to build the temporal knowledge graph in Cognee.

### Objective
Create an ingestion script that reads `historical_claims.json` and loads it into Cognee, checking for correct node insertion.

### Implementation Details
*   Implement `ingest_historical_data.py`.
*   Use `cognee.add_data_points` and `cognee.cognify` with `temporal_cognify=True`.
*   Create a database reset script `reset_db.py` to wipe local Cognee databases.

### Definition of Done (DoD)
- [ ] Passes global DoD (compiles, linted, unit tests pass)
- [ ] Ingestion script runs end-to-end without errors.
- [ ] Ingested facts can be retrieved from local SQLite database.

### Files expected to be modified
- `ingest_historical_data.py`
- `reset_db.py`
- `tests/test_ingestion.py`

### Dependencies
- #2

### Suggested Branch Name
`feature/ingestion-pipeline`

### Suggested Commit Message
`feat(ingest): implement historical data ingestion`

### Testing & Verification
Run `python ingest_historical_data.py` then `python reset_db.py`.

### Complexity & Priority
* **Complexity:** M
* **Priority:** Critical
* **MoSCoW Category:** Must Have

---

## Issue #4: WebSocket Live-Feed Simulator

### Background
To demo real-time analysis, the backend must stream transcript segments sequentially over WebSockets.

### Objective
Build a FastAPI WebSocket endpoint that reads a pre-transcribed text file and streams sentence chunks at a configurable delay.

### Implementation Details
*   Create `app/api/websocket.py` using FastAPI WebSocket.
*   Read input from `data/live_speech_demo.txt`.
*   Support configurable delay (e.g., query param `delay=2.5`).

### Definition of Done (DoD)
- [ ] Passes global DoD (compiles, linted, unit tests pass)
- [ ] WebSocket client receives all lines in order.
- [ ] Endpoint handles client disconnects gracefully.

### Files expected to be modified
- `app/api/websocket.py`
- `tests/test_websocket_stream.py`
- `data/live_speech_demo.txt`

### Dependencies
- #1

### Suggested Branch Name
`feature/websocket-simulator`

### Suggested Commit Message
`feat(stream): build websocket live-feed simulator`

### Testing & Verification
Run `pytest tests/test_websocket_stream.py`.

### Complexity & Priority
* **Complexity:** S
* **Priority:** High
* **MoSCoW Category:** Must Have

---

## Issue #5: Structured LLM Claim Extractor

### Background
Incoming speech sentences contain conversational text. We must extract distinct claims, their topic, and numeric values in a structured JSON layout.

### Objective
Create an LLM service utilizing structured outputs (Pydantic model validation) to extract claims.

### Implementation Details
*   Implement `app/services/extractor.py`.
*   Use OpenAI (or similar) JSON mode/structured output using Pydantic classes.
*   Extract: topic, metric, value, unit, claim statement.

### Definition of Done (DoD)
- [ ] Passes global DoD (compiles, linted, unit tests pass)
- [ ] Extractor returns valid JSON matching the schema.
- [ ] Extraction latency is under 1.0 second per sentence.

### Files expected to be modified
- `app/services/extractor.py`
- `tests/test_claim_extractor.py`

### Dependencies
- #1

### Suggested Branch Name
`feature/claim-extractor`

### Suggested Commit Message
`feat(nlp): build structured claim extraction service`

### Testing & Verification
Run `pytest tests/test_claim_extractor.py`.

### Complexity & Priority
* **Complexity:** M
* **Priority:** Critical
* **MoSCoW Category:** Must Have

---

## Issue #6: Cognee Temporal Search Implementation

### Background
For a given extracted claim, we must retrieve related historical claims by the same politician on the same topic made *before* the current date.

### Objective
Implement the query service using Cognee's `SearchType.TEMPORAL` filtering.

### Implementation Details
*   Implement `app/services/retrieval.py`.
*   Perform temporal search specifying the time-interval (before speech date) and topic entity filters.

### Definition of Done (DoD)
- [ ] Passes global DoD (compiles, linted, unit tests pass)
- [ ] Query successfully filters out claims made *after* the speech date.
- [ ] Returns top-k matching claims.

### Files expected to be modified
- `app/services/retrieval.py`
- `tests/test_temporal_search.py`

### Dependencies
- #3, #5

### Suggested Branch Name
`feature/temporal-retrieval`

### Suggested Commit Message
`feat(retrieval): implement temporal search query`

### Testing & Verification
Run `pytest tests/test_temporal_search.py`.

### Complexity & Priority
* **Complexity:** M
* **Priority:** Critical
* **MoSCoW Category:** Must Have

---

## Issue #7: Deterministic Numeric Diff Logic

### Background
Percentage and numeric comparison is error-prone when left to LLMs. Deterministic mathematical calculation is more reliable and explainable.

### Objective
Implement mathematical diffing for claims containing numeric values (e.g., inflation rates, unemployment, budgets).

### Implementation Details
*   Implement `app/services/comparison/numeric_diff.py`.
*   Calculate absolute drift and percentage variance.
*   Formulate readable verdict strings (e.g., "Stated figure differs from earlier figure by X%").

### Definition of Done (DoD)
- [ ] Passes global DoD (compiles, linted, unit tests pass)
- [ ] Unit tests verify calculations with floats, integers, and percentages.

### Files expected to be modified
- `app/services/comparison/numeric_diff.py`
- `tests/test_numeric_diff.py`

### Dependencies
- #5

### Suggested Branch Name
`feature/numeric-diff`

### Suggested Commit Message
`feat(compare): implement numeric diff engine`

### Testing & Verification
Run `pytest tests/test_numeric_diff.py`.

### Complexity & Priority
* **Complexity:** S
* **Priority:** High
* **MoSCoW Category:** Must Have

---

## Issue #8: Qualitative LLM NLI Contradiction Classifier

### Background
Qualitative statements require natural language inference to identify support, contradiction, or extension.

### Objective
Build a prompt-driven NLI classifier that accepts the new claim and a retrieved historical claim, outputting a structured verdict.

### Implementation Details
*   Implement `app/services/comparison/nli_classifier.py`.
*   Use LLM with strict categorical labels: `Consistent with prior statements`, `Contradicts statement from [date]`, or `No prior record`.

### Definition of Done (DoD)
- [ ] Passes global DoD (compiles, linted, unit tests pass)
- [ ] NLI engine correctly classifies test sets of consistent/contradictory claims.

### Files expected to be modified
- `app/services/comparison/nli_classifier.py`
- `tests/test_nli_classifier.py`

### Dependencies
- #5

### Suggested Branch Name
`feature/nli-classifier`

### Suggested Commit Message
`feat(compare): implement qualitative NLI classifier`

### Testing & Verification
Run `pytest tests/test_nli_classifier.py`.

### Complexity & Priority
* **Complexity:** M
* **Priority:** Critical
* **MoSCoW Category:** Must Have

---

## Issue #9: Unified Pipeline Orchestrator

### Background
The individual components (stream, extraction, retrieval, and comparison) must be integrated into a unified pipeline.

### Objective
Create an orchestrator module that ties the WebSocket stream messages to the extraction, retrieval, and hybrid comparison engine.

### Implementation Details
*   Create `app/services/orchestrator.py` and a runner script `run_pipeline.py`.
*   Run the entire sequence asynchronously.

### Definition of Done (DoD)
- [ ] Passes global DoD (compiles, linted, unit tests pass)
- [ ] End-to-end integration tests execute successfully for a mock stream.

### Files expected to be modified
- `app/services/orchestrator.py`
- `run_pipeline.py`
- `tests/test_integration.py`

### Dependencies
- #4, #6, #7, #8

### Suggested Branch Name
`feature/pipeline-orchestrator`

### Suggested Commit Message
`feat(pipeline): create unified pipeline orchestrator`

### Testing & Verification
Run `python run_pipeline.py`.

### Complexity & Priority
* **Complexity:** M
* **Priority:** Critical
* **MoSCoW Category:** Must Have

---

## Issue #10: Real-time Dashboard UI

### Background
Fact-checkers require a clean visual dashboard to monitor the live feed and see flagged claims side-by-side with historical records.

### Objective
Build a frontend web interface displaying a rolling live transcript, metadata, and highlight cards showing consistency verdicts.

### Implementation Details
*   Build `app/templates/index.html` and CSS/JS files.
*   Open a WebSocket connection to the FastAPI backend.
*   Dynamically display cards with glassmorphism or dark-mode styling on contradictions.

### Definition of Done (DoD)
- [ ] Passes global DoD (compiles, linted, unit tests pass)
- [ ] UI updates in real-time as WebSocket messages arrive.
- [ ] Alert cards render correctly with difference metrics and sources.

### Files expected to be modified
- `app/templates/index.html`
- `app/static/style.css`
- `app/static/main.js`

### Dependencies
- #4, #9

### Suggested Branch Name
`feature/dashboard-ui`

### Suggested Commit Message
`feat(ui): design real-time dashboard UI`

### Testing & Verification
Launch backend and open local browser to verify UI interactions.

### Complexity & Priority
* **Complexity:** L
* **Priority:** High
* **MoSCoW Category:** Should Have

---

## Issue #11: Demo Verdict Cache System

### Background
Nondeterministic LLM API responses can cause live demos to behave unpredictably. Caching verified claims ensures stability.

### Objective
Implement a local cache (JSON file or SQLite) that holds pre-calculated extraction and NLI comparison outcomes for demo speech sentences.

### Implementation Details
*   Implement `app/services/cache.py`.
*   If a sentence exists in the cache, retrieve its pre-saved verdict instead of executing live API calls.

### Definition of Done (DoD)
- [ ] Passes global DoD (compiles, linted, unit tests pass)
- [ ] Cache hits execute instantly and return correct verdicts.

### Files expected to be modified
- `app/services/cache.py`
- `data/demo_cache.json`

### Dependencies
- #9

### Suggested Branch Name
`feature/demo-cache`

### Suggested Commit Message
`feat(performance): implement cache system for demo stability`

### Testing & Verification
Verify pipeline output when running pre-cached statements.

### Complexity & Priority
* **Complexity:** S
* **Priority:** Medium
* **MoSCoW Category:** Should Have

---

## Issue #12: Code Polish, Testing, and Documentation

### Background
Production readiness requires thorough testing, documentation, and clean static checks.

### Objective
Polish the codebase, ensure all test suites pass, write comprehensive instructions in the README, and check test coverage.

### Implementation Details
*   Add inline documentation and clean code formatting.
*   Add comprehensive usage steps in `README.md`.

### Definition of Done (DoD)
- [ ] Passes global DoD (compiles, linted, unit tests pass)
- [ ] Code coverage meets or exceeds 80%.
- [ ] Zero linter or configuration issues remain.

### Files expected to be modified
- `README.md`
- `tests/conftest.py`

### Dependencies
- #10, #11

### Suggested Branch Name
`feature/polish-docs`

### Suggested Commit Message
`docs(polish): finalize tests and README instructions`

### Testing & Verification
Run all checks: `ruff check`, `black --check`, `pytest --cov`.

### Complexity & Priority
* **Complexity:** M
* **Priority:** Medium
* **MoSCoW Category:** Should Have
