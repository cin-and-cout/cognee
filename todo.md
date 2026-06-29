# Interactive Onboarding Prompt & Project Task Checklist

## 1. Onboarding Instructions (For New Developers or AI Agents)
Welcome to the **Claim Consistency Tracker** implementation workspace. 

If you are picking up this project, please follow these instructions:
1.  **Read this document** to understand the current project state, dependencies, and git branch rules.
2.  **Verify the current environment:**
    *   Ensure the Python virtual environment is active: `source .venv/bin/activate`
    *   Run tests to verify the existing baseline: `pytest`
    *   Run linter to confirm clean code layout: `ruff check`
3.  **Locate the next task:** Inspect the **Phased Task Checklist** below, identify the first unchecked checkbox `[ ]`, and checkout or create its corresponding branch.
4.  **Execute sequentially:** Do not skip dependencies. Always update the checkboxes in this file as you complete tasks.

---

## 2. Current Project State
*   **Current Branch:** `feature/extension-scaffolding`
*   **Python Virtual Environment:** Fully initialized in `.venv/` with all dependencies installed.
*   **Completed Work:** 
    *   [x] Task 1.1: Project environment initialization, directory structure, Ruff configuration, and dependency setup.
    *   [x] Task 1.2: Cognee custom Pydantic schemas (`app/schemas.py`) and a mock corpus of 59 historical statements ([data/historical_claims.json](file:///home/ani/cognee/data/historical_claims.json)).
    *   [x] Task 1.3: Historical data ingestion script using Cognee and database reset setup.
    *   [x] Task 2.1: WebSocket Live-Feed Simulator streaming speech sentences at a configurable interval.
    *   [x] Task 2.2: Structured LLM Claim Extractor using Cognee's LLMGateway and custom extraction prompt.
    *   [x] Task 3.1: Cognee Temporal Search Implementation.
    *   [x] Task 3.2: Deterministic Numeric Diff Logic.
    *   [x] Task 3.3: Qualitative LLM NLI Contradiction Classifier.
    *   [x] Task 4.1: Unified Pipeline Orchestrator.
    *   [x] Task 4.2: Real-time Dashboard UI.
    *   [x] Task 5.1: Demo Verdict Cache System.
    *   [x] Task 5.2: Code Polish, Testing, and Documentation.
    *   [x] Added Makefile for starting, stopping, cleaning up ports, and testing.
    *   [x] Task 6.1: Chrome Extension Scaffolding.
*   **Next Priority:** Task 6.2 (WebSocket Input Stream Integration).

---

## 3. Git & Branching Conventions
*   **Base Branch:** `master`
*   **Feature Branches:** Prefix branches with `feature/` as outlined in the issues list.
*   **Commit Format:** Use conventional commits, e.g., `feat(scope): description` or `test(scope): description`.

---

## 4. Traceability Matrix
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

## 5. Phased Task Checklist

### Milestone 1: Project Initialization & Ingestion (Must Have)
- [x] **[Task 1.1] Setup Environment & Architecture Structure**
  - **Issue Link:** #1
  - **Focus:** Backend / Environment Setup
  - **Verification:** Run `poetry run ruff check` or `pytest` to check layout.
- [x] **[Task 1.2] Cognee Schema Definition & Seed Dataset Creation**
  - **Issue Link:** #2
  - **Focus:** Cognee / Schema Definition
  - **Verification:** Run `pytest tests/test_schemas.py` to verify Pydantic structure.
- [x] **[Task 1.3] Historical Data Ingestion Pipeline**
  - **Issue Link:** #3
  - **Focus:** Data Ingestion
  - **Verification:** Run `python ingest_historical_data.py` and inspect SQLite file.

### Milestone 2: Simulated Stream & Claim Extraction (Must Have)
- [x] **[Task 2.1] WebSocket Live-Feed Simulator**
  - **Issue Link:** #4
  - **Focus:** API / WebSockets
  - **Verification:** Run `python -m pytest tests/test_websocket_stream.py`.
- [x] **[Task 2.2] Structured LLM Claim Extractor**
  - **Issue Link:** #5
  - **Focus:** NLP / Claim Extraction
  - **Verification:** Run `python -m pytest tests/test_claim_extractor.py`.

### Milestone 3: Temporal Retrieval & Hybrid Comparison Engine (Must Have)
- [x] **[Task 3.1] Cognee Temporal Search Implementation**
  - **Issue Link:** #6
  - **Focus:** Cognee / Retrieval
  - **Verification:** Run `python -m pytest tests/test_temporal_search.py`.
- [x] **[Task 3.2] Deterministic Numeric Diff Logic**
  - **Issue Link:** #7
  - **Focus:** Core Engine / Mathematics
  - **Verification:** Run `python -m pytest tests/test_numeric_diff.py`.
- [x] **[Task 3.3] Qualitative LLM NLI Contradiction Classifier**
  - **Issue Link:** #8
  - **Focus:** Core Engine / NLI
  - **Verification:** Run `python -m pytest tests/test_nli_classifier.py`.

### Milestone 4: Core Pipeline Integration & Web Dashboard (Should Have)
- [x] **[Task 4.1] Unified Pipeline Orchestrator**
  - **Issue Link:** #9
  - **Focus:** System Integration
  - **Verification:** Run `python run_pipeline.py --input speech_sample.txt`.
- [x] **[Task 4.2] Real-time Dashboard UI**
  - **Issue Link:** #10
  - **Focus:** Frontend / Dashboard
  - **Verification:** Open dashboard UI in browser and monitor visual cards.

### Milestone 5: Verification, Caching & Polish (Should Have)
- [x] **[Task 5.1] Demo Verdict Cache System**
  - **Issue Link:** #11
  - **Focus:** Performance / Caching
  - **Verification:** Run integration tests and check console for cache hits.
- [x] **[Task 5.2] Code Polish, Testing, and Documentation**
  - **Issue Link:** #12
  - **Focus:** QA / Documentation
  - **Verification:** Run `poetry run pytest --cov=app` to confirm 80%+ coverage.

### Milestone 6: Browser Extension & Live Streaming Integration (Could Have)
- [x] **[Task 6.1] Chrome Extension Scaffolding**
  - **Focus:** Extension / Scaffolding
  - **Description:** Initialize `app/extension/` directory with a standard `manifest.json` (v3) specifying permissions for activeTab and sidePanel. Create a glassmorphic connection popup (`popup.html`/`popup.js`) and background worker skeleton.
- [ ] **[Task 6.2] WebSocket Input Stream Integration**
  - **Focus:** Backend / API
  - **Description:** Refactor the WebSocket route `/ws/live-speech` in `app/api/websocket.py` to allow incoming message payload payloads from client streams. Pass received sentences to the unified orchestrator to perform live comparison checks and broadcast resulting verdicts.
- [ ] **[Task 6.3] Live DOM Caption Scraper & Web Audio Capturer**
  - **Focus:** Extension / DOM Scripting
  - **Description:** Implement script in extension content scripts to listen to DOM mutations on YouTube's live caption containers (or use Web Speech API loopback tab audio). Compile parsed words into sentences and forward them via WebSocket.
- [ ] **[Task 6.4] Injected UI Alert Overlay / Sidebar panel**
  - **Focus:** Extension / UX
  - **Description:** Implement a browser sidebar panel (using Side Panel API) or injected DOM overlay to list live verification badges (showing consistency vs contradiction alerts) directly beside the broadcast player.
- [ ] **[Task 6.5] Neobrutalism UI Redesign**
  - **Focus:** Frontend / Styling
  - **Description:** Redesign the entire Web Dashboard UI and the browser extension interface in a Neobrutalism design language (e.g., using heavy solid borders, sharp offset box-shadows, bold retro typography, high contrast primaries, and asymmetric structures).
