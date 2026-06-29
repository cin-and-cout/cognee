# Project Task Checklist

## Execution Guidelines
* Run unit and integration tests after every task.
* Implement sequentially; do not bypass dependencies.
* Follow the branch and commit naming patterns specified in the issues.

## Traceability Matrix
| Req ID | Milestone | Issue ID | ADR Reference | Acceptance Criteria |
| :--- | :--- | :--- | :--- | :--- |
| REQ-001 | Milestone 1 | #1 | ADR-001 | Pytest passes for schema validation and database reset script. |
| REQ-001 | Milestone 1 | #2 | ADR-001 | Seed data loaded successfully into Cognee local graph database. |
| REQ-001 | Milestone 1 | #3 | ADR-001 | Ingestion script successfully runs without errors and persists data. |
| REQ-002 | Milestone 2 | #4 | ADR-003 | WebSocket client receives sentences one-by-one at a 2.5s interval. |
| REQ-003 | Milestone 2 | #5 | ADR-002 | Prompt extracts structured JSON claim details from mock speech. |
| REQ-004 | Milestone 3 | #6 | ADR-001 | Cognee query fetches correct historical claim given a target topic. |
| REQ-005 | Milestone 3 | #7 | ADR-002 | Test suite verifies mathematical drift calculation accuracy. |
| REQ-006 | Milestone 3 | #8 | ADR-002 | NLI LLM returns exact categorical string classification output. |
| REQ-001..6 | Milestone 4 | #9 | ADR-001..3 | End-to-end local CLI pipeline outputs correct consistency reports. |
| REQ-002,5,6 | Milestone 4 | #10 | ADR-003 | Dashboard displays live feed stream and flagged alert cards properly. |
| REQ-005,6 | Milestone 5 | #11 | ADR-003 | Pipeline retrieves cached/pre-verified verdicts when cache hits. |
| REQ-001..6 | Milestone 5 | #12 | ADR-001..3 | Linter, unit tests, and coverage metrics meet DoD threshold. |

---

## Milestone 1: Project Initialization & Ingestion (Must Have)
- [ ] **[Task 1.1] Setup Environment & Architecture Structure**
  - **Issue Link:** #1
  - **Focus:** Backend / Environment Setup
  - **Verification:** Run `poetry run ruff check` or `pytest` to check layout.
- [ ] **[Task 1.2] Cognee Schema Definition & Seed Dataset Creation**
  - **Issue Link:** #2
  - **Focus:** Cognee / Schema Definition
  - **Verification:** Run `pytest tests/test_schemas.py` to verify Pydantic structure.
- [ ] **[Task 1.3] Historical Data Ingestion Pipeline**
  - **Issue Link:** #3
  - **Focus:** Data Ingestion
  - **Verification:** Run `python ingest_historical_data.py` and inspect sqlite file.

## Milestone 2: Simulated Stream & Claim Extraction (Must Have)
- [ ] **[Task 2.1] WebSocket Live-Feed Simulator**
  - **Issue Link:** #4
  - **Focus:** API / WebSockets
  - **Verification:** Run `python -m pytest tests/test_websocket_stream.py`.
- [ ] **[Task 2.2] Structured LLM Claim Extractor**
  - **Issue Link:** #5
  - **Focus:** NLP / Claim Extraction
  - **Verification:** Run `python -m pytest tests/test_claim_extractor.py`.

## Milestone 3: Temporal Retrieval & Hybrid Comparison Engine (Must Have)
- [ ] **[Task 3.1] Cognee Temporal Search Implementation**
  - **Issue Link:** #6
  - **Focus:** Cognee / Retrieval
  - **Verification:** Run `python -m pytest tests/test_temporal_search.py`.
- [ ] **[Task 3.2] Deterministic Numeric Diff Logic**
  - **Issue Link:** #7
  - **Focus:** Core Engine / Mathematics
  - **Verification:** Run `python -m pytest tests/test_numeric_diff.py`.
- [ ] **[Task 3.3] Qualitative LLM NLI Contradiction Classifier**
  - **Issue Link:** #8
  - **Focus:** Core Engine / NLI
  - **Verification:** Run `python -m pytest tests/test_nli_classifier.py`.

## Milestone 4: Core Pipeline Integration & Web Dashboard (Should Have)
- [ ] **[Task 4.1] Unified Pipeline Orchestrator**
  - **Issue Link:** #9
  - **Focus:** System Integration
  - **Verification:** Run `python run_pipeline.py --input speech_sample.txt`.
- [ ] **[Task 4.2] Real-time Dashboard UI**
  - **Issue Link:** #10
  - **Focus:** Frontend / Dashboard
  - **Verification:** Open dashboard UI in browser and monitor visual cards.

## Milestone 5: Verification, Caching & Polish (Should Have)
- [ ] **[Task 5.1] Demo Verdict Cache System**
  - **Issue Link:** #11
  - **Focus:** Performance / Caching
  - **Verification:** Run integration tests and check console for cache hits.
- [ ] **[Task 5.2] Code Polish, Testing, and Documentation**
  - **Issue Link:** #12
  - **Focus:** QA / Documentation
  - **Verification:** Run `poetry run pytest --cov=app` to confirm 80%+ coverage.
