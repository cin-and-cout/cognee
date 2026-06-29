# ADR 003: Simulated Live-Feed via WebSockets and Pre-Transcribed Audio

## Status
Proposed

## Context
The project goals require the demonstration of real-time consistency tracking during a speech. Doing true live audio ingestion and live transcription (e.g., using Whisper API or AssemblyAI) introduces several challenges within a 4-day timeline:
1.  **Latency:** Real-time audio streaming and chunking over the network introduces a 2-5 second transcription delay, causing the comparison UI to lag behind the speaker.
2.  **Transcription Noise:** Live acoustic transcription frequently mishears numbers (e.g., "four percent" vs. "4%") or entity names, causing downstream parsing and matching to fail.
3.  **Demo Risk:** Microphone failures, background noise, and API rate limits are high risks during live presentations.

## Decision
We will build a **Simulated Live-Feed Pipeline**:
1.  Take a pre-transcribed speech transcript.
2.  Segment the text into sentence-level chunks.
3.  Use a FastAPI backend WebSocket endpoint to stream these sentence chunks one-by-one to the frontend with a configurable delay (e.g., 2–3 seconds per sentence).
4.  As each sentence is received on the backend/frontend, it triggers the real-time claim extraction and temporal graph retrieval workflow.

## Consequences
*   **Pros:**
    *   Zero risk of live transcription API errors or hardware/mic failure during the demo.
    *   Highly reproducible demo flow; allows pre-verifying and caching exact standout contradiction examples.
    *   Simulates the real-time processing flow of a live feed.
*   **Cons:**
    *   Does not process live microphone audio, which must be framed as a post-MVP stretch goal.

## Confidence Score: 5 / 5
Simulating the stream keeps the UI interactive and dynamic while isolating the core logic from external audio transcription variables.
