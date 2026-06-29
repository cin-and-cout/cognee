# Politician Claim Consistency Tracker

This application tracks, monitors, and flags inconsistencies in public statements made by politicians in real-time. Built on top of **FastAPI** and the **Cognee** temporal graph memory framework, it compares incoming speech sentences with a historical record of statements to detect factual or logical drift.

---

## Key Capabilities

1. **Real-time Pipeline**: Streams speech lines via WebSockets, extracts structured claims, searches temporal graph memory, and classifies contradiction levels.
2. **Cognee Graph Ingestion**: Dynamically indexes politicians, topics, and claim details in a temporal knowledge graph.
3. **Hybrid Verdict Engine**: Evaluates numerical differences deterministically and processes qualitative drift using an LLM-based Natural Language Inference (NLI) classifier.
4. **Interactive Glassmorphic Dashboard**: A premium dark-mode web console showing live speech bubbles, real-time consistency statuses, and historical comparison overlays.
5. **Stability Cache**: Integrates a write-through and read-through demo cache to run full end-to-end runs without requiring active LLM API keys.

---

## Installation & Setup

Ensure Python 3.10+ is installed on your system.

1. **Initialize Virtual Environment**:
   ```bash
   python -m venv .venv
   source .venv/bin/activate
   ```

2. **Install Dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

3. **Configure Environment Variables (Optional)**:
   To run live LLM Extractions or NLI classifiers without the demo cache, create a `.env` file in the root directory:
   ```env
   OPENAI_API_KEY=your-api-key-here
   ```

---

## Running the Application

### 1. Ingest Historical Data
Before tracking statements, populate the temporal graph database with the politician's historical claims (e.g. from 2024 to early 2026):
```bash
python ingest_historical_data.py
```
This loads 59 pre-defined historical statements across various topics like inflation, tax rates, infrastructure, and housing.

### 2. Run Command-Line Pipeline
You can process a static text file containing speech lines using the pipeline CLI:
```bash
python run_pipeline.py --input speech_sample.txt
```

### 3. Run FastAPI Web Server
To launch the real-time websocket and template endpoints:
```bash
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```
Then, open your web browser and navigate to:
```
http://localhost:8000
```
Click **Start Live Stream** to see the system simulate incoming speech, process each claim, search historical records, and flag contradictions instantly on the dashboard.

---

## Testing

To run the full test suite verifying graph schemas, extraction logic, classifiers, and cache performance:
```bash
python -m pytest
```

To run tests with code coverage:
```bash
python -m pytest --cov=app
```
