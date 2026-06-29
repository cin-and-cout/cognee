# Research Notes & Environment Scan: Claim Consistency Tracker

This document outlines the findings from scanning the workspace, establishing basic coding standards, and conducting research on temporal knowledge graphs and fact-checking implementations.

---

## 1. Repository Discovery & Environment Scan

An initial inspection of the workspace root (`/home/ani/cognee`) reveals a completely empty git repository, save for a couple of planning documents:
*   `init-research.pdf` (and its converted text equivalent)
*   `prompt.md`

No project manifests (`package.json`, `Cargo.toml`, `go.mod`, `requirements.txt`, `pyproject.toml`) or build orchestration files (`Makefile`, `Dockerfile`, `docker-compose.yml`) are present. 

### Proposed Action
Since the core dependency, **cognee**, is a Python library, we will bootstrap this project as a Python application. The directory structure and environment files (e.g., `pyproject.toml` or `requirements.txt`, `main.py`, etc.) will be initialized in subsequent phases.

---

## 2. Coding Conventions & Styles

Because the repository is empty, no prior configuration files for linters or formatters (`.editorconfig`, `.eslintrc`, `.flake8`, `pyproject.toml` configurations) exist.

### Standardized Conventions
We will enforce the following Python conventions for all generated code:
1.  **Formatters & Linters:** We will use standard PEP 8 styling. When the repository is bootstrapped, we will add configurations for `black` (for formatting) and `ruff` (for linting and imports sorting).
2.  **Naming Patterns:** 
    *   Variables and functions: `snake_case`
    *   Classes: `PascalCase`
    *   Constants: `UPPER_SNAKE_CASE`
3.  **Typing:** Use explicit Python type hints (`typing` module) to maintain code clarity and enable static checking.

---

## 3. Existing Artifact Preservation

We identified the following files during the initial scan:
*   `init-research.pdf` (and the temporary `init-research.txt`)
*   `prompt.md`

These files contain critical project guidelines and product goals. They will remain untouched.

---

## 4. Existing Architectural Decisions (Baseline)

Since no code exists in the repository, the baseline architecture is defined entirely by the requirements in the project report:
*   **Graph/Memory Layer:** `cognee` (Python package) serving as the temporal knowledge graph backend.
*   **Querying Paradigm:** Native `cognee` temporal search (`SearchType.TEMPORAL`) and `temporal_cognify=True` during data ingestion.
*   **Comparison Logic:** A custom-built engine parsing statements into atomic claims, comparing them using exact numeric diffing and a lightweight LLM contradiction classifier.
*   **Data Input:** Curated historical corpus (50–150 statements for one politician) and simulated live streaming feed (sentence-by-sentence).
*   **Presentation Layer:** A simple, lightweight web dashboard (e.g., FastAPI + HTML/JS).

---

## 5. Fact-Checked Web Research

To ground our architectural design, we researched similar open-source implementations and patterns in temporal knowledge graph reasoning and claim verification:

### Reference Implementations & Systems

1.  **TemporalFC (Temporal Fact-Checking over Knowledge Graphs):**
    *   *Concept:* An open-source framework designed specifically to verify facts over time-bound knowledge bases.
    *   *Key Takeaway:* It highlights that fact-checking is not a simple binary classification. Truth value shifts based on the time interval. For our system, when checking a politician's claim, we must ensure we retrieve prior claims that were valid *before* or *at* the time of the statement to avoid retroactive evaluation.
2.  **Graphiti (Temporal Context Graphs):**
    *   *Concept:* An active framework developed by Zep AI that constructs episodic memory graphs. It automatically handles entity/relation updates over time, maintaining a timeline of how facts change.
    *   *Key Takeaway:* Graphiti shows how to represent entity changes sequentially. In Cognee, we will model this by linking claims to a specific politician node, tagged with temporal edges.
3.  **FactKG (Fact Verification over KGs):**
    *   *Concept:* A benchmark and system for verifying claims by reasoning over graph structures.
    *   *Key Takeaway:* Validating claims requires structured, logic-based query traversals (e.g., retrieving facts within the same topic ontology) rather than relying on unstructured vector similarity search, which often introduces noise and loses logical relationships.

---

## 6. Research Confidence Score

**Confidence Score: 5 / 5**

### Rationale
*   The `cognee` API details for `temporal_cognify` and `SearchType.TEMPORAL` are well-documented.
*   The architecture boundaries (separating the deterministic numeric diff from the qualitative NLI contradiction check) are standard in production NLP pipelines.
*   The scope of using 1 politician, a pre-compiled dataset, and a simulated live stream fits perfectly within the proposed hackathon timeline.

---

## 7. Recommended Libraries & License Tiers

To ensure compliance, we categorized all potential third-party packages. No BSL 1.1 or copyleft licenses (like GPL v3) are recommended.

| Library | Purpose | License | Tier |
| :--- | :--- | :--- | :--- |
| **cognee** | Knowledge graph memory | Apache 2.0 | `[Verified]` |
| **pydantic** | Schema validation & DataPoint modeling | MIT | `[Verified]` |
| **fastapi** | Web API backend for dashboard and simulation | MIT | `[Verified]` |
| **uvicorn** | ASGI server for running FastAPI | BSD-3-Clause | `[Verified]` |
| **openai / httpx** | LLM API client | Apache 2.0 / BSD-3-Clause | `[Verified]` |
| **jinja2** | HTML template rendering for dashboard | BSD-3-Clause | `[Verified]` |
| **Graphiti** | Reference design (no code copy) | Apache 2.0 | `[Verified]` |
| **TemporalFC** | Reference design (no code copy) | MIT | `[Inferred]` |
