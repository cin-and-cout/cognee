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
*   **Current Branch:** `feature/12.2-verdict-ui`
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
    *   [x] Task 6.2: Remove Simulator Mocking & Refactor WebSocket Route.
    *   [x] Task 6.3: Chrome Side Panel UI & Neobrutalist Alerts.
    *   [x] Task 6.4: Live DOM Caption Scraper & Web Audio Capturer Integration.
    *   [x] Task 6.5: Decommission Old Web Dashboard & Auto-Open Scripting.
*   **Next Priority:** Task 11.1 (Transcript Availability Detection) — Milestone 12 complete.

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

### Milestone 6: Browser Side Panel & Live Streaming Integration (Could Have)
- [x] **[Task 6.1] Chrome Extension Scaffolding**
  - **Focus:** Extension / Scaffolding
  - **Description:** Initialize `app/extension/` directory with a standard `manifest.json` (v3) specifying permissions for activeTab and sidePanel. Create a connection popup (`popup.html`/`popup.js`) and background worker skeleton.
- [x] **[Task 6.2] Remove Simulator Mocking & Refactor WebSocket Route**
  - **Focus:** Backend / API
  - **Description:** Decommission the mock speech simulator. Refactor `app/api/websocket.py` to wait for live input from the extension, pass received sentences to the claim comparison engine, and return structured JSON verdicts/alerts back to the extension client.
- [x] **[Task 6.3] Chrome Side Panel UI & Neobrutalist Alerts**
  - **Focus:** Extension / Side Panel
  - **Description:** Add `sidepanel.html` and `sidepanel.js` to `app/extension/` and register them in `manifest.json`. Implement a Neobrutalist UI showing live transcript bubbles and high-visibility alert cards when inconsistencies are detected.
- [x] **[Task 6.4] Live DOM Caption Scraper & Web Audio Capturer Integration**
  - **Focus:** Extension / DOM Scripting
  - **Description:** Hook up `content.js` to YouTube Live caption overlays, parse caption mutations, group words into sentences, and stream them to the background script.
- [x] **[Task 6.5] Decommission Old Web Dashboard & Auto-Open Scripting**
  - **Focus:** Cleanup
  - **Description:** Remove the old FastAPI HTML template serving, clean up `Makefile` commands to stop executing browser auto-opens, and ensure the backend serves exclusively as a headless WebSocket/HTTP API.

### Milestone 7: Multi-LLM Provider Support (Gemini & Groq)
- [ ] **[Task 7.1] Configure Gemini LLM & Embedding Settings**
  - **Focus:** Infrastructure / LLM
  - **Description:** Add support for Google Gemini LLM and Embedding models (`LLM_PROVIDER=gemini`, `LLM_MODEL=gemini/gemini-1.5-flash`, `EMBEDDING_PROVIDER=gemini`, `EMBEDDING_MODEL=gemini/text-embedding-004`). Update `.env.template` and verify structured output extraction.
- [ ] **[Task 7.2] Configure Groq LLM Settings**
  - **Focus:** Infrastructure / LLM
  - **Description:** Add support for Groq LLM model (`LLM_PROVIDER=groq`, `LLM_MODEL=groq/llama-3.3-70b-versatile`). Update `.env.template` and verify compatibility with structured output schemas.
- [ ] **[Task 7.3] Fallback Logic & Documentation**
  - **Focus:** Infrastructure / LLM
  - **Description:** Implement verification checks during startup, validate compatibility of JSON schema extractions across all configured providers, and update `README.md` with instructions on API key configuration.

### Milestone 8: Robust Sentence Extraction (Must Have)
- [x] **[Task 8.1] Content Script — Diff-Based Caption Stream Collector**
  - **Focus:** Extension / DOM Scripting
  - **Description:** Rewrite `content.js` to remove all sentence-detection logic (punctuation regex, 800ms timeout). Replace with a diff-based text extractor that uses suffix-matching to emit only *new words* from YouTube caption DOM mutations. Send raw `CAPTION_CHUNK` messages to the background script instead of `TRANSCRIPT_CAPTURED`. Track a rolling window of previously-seen segments to handle caption corrections and overlapping re-renders.
  - **Verification:** Load a fast-paced YouTube video with auto-captions; confirm console logs show clean, non-duplicated word chunks arriving in real-time without sentence-level grouping.
- [x] **[Task 8.2] Background Script — StreamBuffer & Sentence Segmenter**
  - **Focus:** Extension / Background Worker
  - **Description:** Add a `StreamBuffer` class to `background.js` that accumulates incoming `CAPTION_CHUNK` text and segments it into sentences using three strategies: (A) Rule-based fast path — split on `.` `!` `?` when preceded by ≥4 words, with abbreviation/acronym guards; (B) Adaptive timeout — dynamically compute flush delay from rolling words-per-second rate (clamped 400ms–2000ms); (C) Max-buffer safety valve — force-flush at 40 words. Retain last 3 words as carry-over for context continuity. Add hash-based deduplication before sending to WebSocket.
  - **Verification:** Test against both fast-paced (news debate) and slow-paced (lecture) YouTube videos. Confirm sentences are neither merged nor prematurely split. Verify adaptive timeout adjusts to speaking pace.
- [x] **[Task 8.3] Backend Defensive Filters & Deduplication**
  - **Focus:** Backend / API
  - **Description:** Update `app/api/websocket.py` to add a minimum sentence length filter (reject <4 words) and a server-side deduplication window (hash set of last 20 processed sentences). Prevents fragments and duplicate LLM processing from edge cases that slip past the extension-side logic.
  - **Verification:** Send intentional fragment and duplicate payloads via WebSocket client; confirm they are rejected and not forwarded to the orchestrator.

### Milestone 9: Global Word Ledger — Eliminate Sentence Repetition (Must Have)
- [x] **[Task 9.1] StreamBuffer — Global Word Ledger Integration**
  - **Focus:** Extension / Background Worker
  - **Description:** Add a `emittedWords` array (capped at 200) to the `StreamBuffer` class in `background.js`. Before flushing any sentence in `_flushSentence()`, tokenize it into words and find the longest prefix that matches a suffix of `emittedWords` using suffix-prefix overlap. Strip the overlapping prefix and emit only the non-overlapping tail. After emitting, append the new words to `emittedWords`. Remove the existing carry-over mechanism (`CARRY_OVER_WORDS`) as it actively re-introduces already-emitted words. Replace the `includes()`-based substring dedup with the ledger-based approach which is strictly more powerful.
  - **Verification:** Replay the GTA 4 caption stream that exhibited repetition; confirm zero duplicate words/phrases in emitted sentences while all original words are present.
- [x] **[Task 9.2] Heartbeat Flush — Drain Stale Buffer**
  - **Focus:** Extension / Background Worker
  - **Description:** Add a periodic 5-second heartbeat timer to `StreamBuffer` that flushes whatever remains in the buffer if no new chunks have arrived. This handles the edge case where the last words of a video/segment never get flushed because no new chunk arrives to trigger the adaptive timeout. The heartbeat should reset whenever a new chunk arrives.
  - **Verification:** Pause a YouTube video mid-sentence; confirm the partial buffer is flushed within 5 seconds rather than being lost.

---

### Milestone 10: Buffer-First Word Accumulation & Pause-Based Sentence Extraction (Must Have)

- [x] **[Task 10.1] Global Word Buffer in `content.js`**
  - **Focus:** Extension / DOM Scripting
  - **Branch:** `feature/milestone-10-buffer-first-extraction`
  - **Description:** Maintain a flat, append-only `globalWordBuffer: string[]` in `content.js` that is the canonical truth for every word ever seen from captions in a session. Attach a snapshot of the last 100 words to every `CAPTION_CHUNK` message so `background.js` can cross-reference during segmentation.
  - **Sub-tasks:**
    - [x] **10.1.a** Add a `globalWordBuffer: string[]` array at module-top scope in `content.js` (no cap — it is the full session log).
    - [x] **10.1.b** In `processCaptions()`, after computing `newWords` via `computeNewWords()`, **append** `newWords` to `globalWordBuffer` (accumulate only; never replace).
    - [x] **10.1.c** Change the `CAPTION_CHUNK` message payload to include `text` (the delta chunk) and `bufferSnapshot` (last 100 words of `globalWordBuffer` joined as a string) so `background.js` can cross-reference.
    - [x] **10.1.d** Add a `resetBuffer()` function that clears both `globalWordBuffer` and `previousWords`, called on YouTube's `yt-navigate-finish` document event (video navigation).
    - [x] **10.1.e** Write a unit-test script (in `tests/` or extension `__tests__/`) that replays a mock caption mutation sequence and verifies the buffer accumulates with zero duplicates across caption window transitions.
  - **Verification:** Open browser console on any YouTube video with auto-captions. Log `globalWordBuffer` every 10 seconds. Confirm it is a growing, deduplicated flat word list with zero repetition across caption window transitions.

- [x] **[Task 10.2] Pause-Aware Sentence Extraction from Buffer (No-Punctuation Path)**
  - **Focus:** Extension / Background Worker
  - **Branch:** `feature/milestone-10-buffer-first-extraction`
  - **Description:** Make `StreamBuffer`'s adaptive timeout semantically a *pause detector*. When it fires, cross-reference the `bufferSnapshot` from the last `CAPTION_CHUNK` to verify whether a clause boundary is plausible before flushing. Remove the redundant per-chunk dedup in `content.js` since the Global Word Ledger is strictly more powerful.
  - **Sub-tasks:**
    - [x] **10.2.a** Rename the existing `flushTimer` / "adaptive timeout" in `StreamBuffer` to `pauseDetectionTimer` throughout the class for semantic clarity. Keep the same clamped [800ms–3000ms] range.
    - [x] **10.2.b** Store the `bufferSnapshot` string from the latest `CAPTION_CHUNK` message in a `StreamBuffer.lastSnapshot` property. When `pauseDetectionTimer` fires, compare the snapshot's word count to the internal buffer's word count — if they match, treat it as a confirmed pause and flush immediately; otherwise allow one heartbeat deferral before force-flushing.
    - [x] **10.2.c** Add a `lastChunkArrival: number` timestamp to `StreamBuffer`. If the gap since `lastChunkArrival` exceeds 1.5× the computed `pauseDetectionTimer` value, treat it as a hard pause and force-flush regardless (no deferral).
    - [x] **10.2.d** Remove the redundant `isDuplicate()` / `recentChunks` rolling window in `content.js`. The `emittedWords` Global Word Ledger in `background.js` supersedes this dedup layer entirely.
    - [x] **10.2.e** Add a `StreamBuffer.stats()` method returning `{ bufferWords, emittedTotal, wps, lastFlushMethod }` for debugging from the `background.js` service-worker console.
  - **Verification:** Play a slow speaker (e.g., a lecture). Confirm sentences flush at natural speech pauses. Play a fast news debate; confirm no single sentence exceeds 40 words. Neither path should produce repeated words.

---

### Milestone 11: Pre-Created Transcript Extraction (Should Have)

- [x] **[Task 11.1] Transcript Availability Detection & Scraping in `content.js`**
  - **Focus:** Extension / DOM Scripting
  - **Branch:** `feature/11.1-transcript-detection`
  - **Description:** On page load (and on `yt-navigate-finish`), detect whether the video has a human-authored transcript by looking for YouTube's "Show transcript" button. If found, programmatically open the transcript panel, scrape all segments, and send them as a `FULL_TRANSCRIPT` message to `background.js`. Pause the live caption observer so captions and transcript are not double-processed.
  - **Sub-tasks:**
    - [x] **11.1.a** On page load and `yt-navigate-finish`, probe for the transcript trigger button via `document.querySelector('[aria-label="Show transcript"]')` (or nearest stable equivalent). Retry up to 3× with a 1-second delay to handle late DOM rendering.
    - [x] **11.1.b** If a transcript button is found, send a `TRANSCRIPT_AVAILABLE` message to `background.js` with `{ videoId }` extracted from `window.location.href`.
    - [x] **11.1.c** Implement `clickTranscriptAndScrape()`: programmatically click the button, wait up to 3 seconds for `ytd-transcript-segment-renderer` elements to appear (via `MutationObserver`), then collect all `{ text, startMs }` segments from the panel.
    - [x] **11.1.d** Send the collected data as `{ action: "FULL_TRANSCRIPT", segments: [{ text, startMs }], videoId }` to `background.js`.
    - [x] **11.1.e** After sending, post a `DISABLE_CAPTION_SCRAPER` message to `background.js` and also disconnect the local caption `MutationObserver` for this video to prevent parallel processing.
  - **Verification:** Open a TED Talk YouTube video (which always has a human transcript). Confirm `FULL_TRANSCRIPT` arrives in `background.js` console within 5 seconds of page load. Confirm the caption observer produces no `CAPTION_CHUNK` messages in parallel.

- [x] **[Task 11.2] Full Transcript Processing Pipeline in `background.js`**
  - **Focus:** Extension / Background Worker
  - **Branch:** `feature/11.2-transcript-pipeline`
  - **Description:** When a `FULL_TRANSCRIPT` message is received, split the transcript into sentences using the existing rule-based punctuation splitter (extracted as a shared utility), deduplicate via the Global Word Ledger, and send sentences to the backend. Add a `transcriptMode` flag and expose a UI badge in the side panel.
  - **Sub-tasks:**
    - [x] **11.2.a** Extract `StreamBuffer._tryRuleBasedSplit()` logic into a standalone top-level utility function `splitIntoSentences(text: string): string[]` in `background.js` to avoid duplication between transcript and live modes.
    - [x] **11.2.b** Add a `transcriptMode: boolean` flag to `chrome.storage.local`. Set to `true` on `TRANSCRIPT_AVAILABLE`; reset to `false` on `yt-navigate-finish` or `DISABLE_CAPTION_SCRAPER`.
    - [x] **11.2.c** Implement `processFullTranscript(segments)` in `background.js`:
      - Concatenate all segment texts with a single space.
      - Call `splitIntoSentences()` to produce an ordered array of sentences.
      - Run each sentence through the Global Word Ledger dedup (`streamBuffer._stripOverlapWithLedger()`).
      - Send each non-duplicate sentence via `handleSegmentedSentence()`.
    - [x] **11.2.d** Wire up `FULL_TRANSCRIPT` in the `chrome.runtime.onMessage.addListener` block to call `processFullTranscript()`.
    - [x] **11.2.e** Add a `TRANSCRIPT_MODE_STATUS` query message handler that `sidepanel.js` can poll on load to conditionally show a `📄 Using Pre-built Transcript` badge in the UI.
  - **Verification:** On a TED Talk, confirm all sentences are extracted with correct punctuation splits and sent to the backend in order. Confirm the side panel feed displays them correctly. Confirm `StreamBuffer` stays idle (no `CAPTION_CHUNK` handled) during transcript mode.

---

### Milestone 12: Extension UX Polish (Should Have)

- [x] **[Task 12.1] Clear Button for Live Transcript Feed**
  - **Focus:** Extension / Side Panel UI
  - **Branch:** `feature/12.1-clear-transcript-button`
  - **Description:** Add a "Clear Feed" button to `sidepanel.html` that wipes the display log, resets `StreamBuffer` state, and shows a brief undo snackbar — without disconnecting the WebSocket.
  - **Sub-tasks:**
    - [x] **12.1.a** Add `<button id="clear-btn" class="btn btn-secondary">Clear Feed</button>` to `sidepanel.html`, positioned between the Connect button and the feed container. Style it with a white background / black border neobrutalist theme (visually distinct from the red Connect button).
    - [x] **12.1.b** In `sidepanel.js`, add a click handler for `#clear-btn` that calls `chrome.storage.local.set({ logs: [] })` then immediately re-renders the feed to the empty state. The WebSocket connection and `StreamBuffer` processing must remain active.
    - [x] **12.1.c** Send a `CLEAR_BUFFER` message to `background.js` on clear. In `background.js`, handle it by calling `streamBuffer.reset()` so the Global Word Ledger and buffer state are wiped — prevents previously emitted words from blocking new sentences.
    - [x] **12.1.d** Show a 2-second "Feed cleared" undo snackbar (neobrutalist style: black box, white monospaced text, box-shadow) after clicking Clear. The undo action restores the previous `logs` from a pre-clear snapshot stored in memory.
    - [x] **12.1.e** Persist a `{ clearedAt: timestamp }` entry in `chrome.storage.local` on each clear for debugging / session analytics.
  - **Verification:** During an active session with 10+ feed items, click Clear. Confirm all items vanish and the empty state renders. Confirm the WebSocket stays connected and new sentences continue arriving and displaying correctly after the clear.

- [x] **[Task 12.2] Enhanced Verdict UI Per Claim**
  - **Focus:** Extension / Side Panel UI
  - **Branch:** `feature/12.2-verdict-ui`
  - **Description:** Redesign the per-claim verdict card in `sidepanel.html` / `sidepanel.js` to surface all available backend report fields clearly. Add 4 distinct verdict states, a loading/analyzing state, collapsible historical comparison, numeric diff badge, and a global stats bar.
  - **Sub-tasks:**
    - [x] **12.2.a** Define the full verdict card CSS in `sidepanel.html` with these visual components:
      - **Verdict badge** (top-right pill): `CONSISTENT` (green `#2ed573`) / `CONTRADICTION` (red `#ff5252`) / `NEUTRAL` (grey `#f1f2f6`) / `UNVERIFIED` (amber `#ffa502`).
      - **Claim text** (bold, full-width).
      - **Topic tag** (small uppercase pill beneath claim text).
      - **Historical comparison** (collapsible `<details>/<summary>` block): matched historical claim shown in a bordered quote.
      - **Diff badge** (only for numeric claims): `Δ +X.X%` or `Δ -X.X%` with directional color.
      - **Explanation** (italic text, below comparison).
      - **Timestamp** (bottom-right, small monospaced).
    - [x] **12.2.b** Rewrite `renderFeed()` in `sidepanel.js` to use the new card template, replacing the current flat `verdict-box` HTML.
    - [x] **12.2.c** Add a `⏳ Analyzing...` pulsing badge for log items where `log.report === null` (sentence captured but backend response not yet received).
    - [x] **12.2.d** Add `UNVERIFIED` as a distinct state for items where the backend returned an empty report array (no historical match found in graph memory).
    - [x] **12.2.e** Add a global stats bar pinned above the feed: `N sentences | X contradictions | Y consistent | Z unverified` — updated in real-time on every `NEW_LOG` message.
  - **Verification:** Inject mock log data covering all 4 verdict states into `chrome.storage.local`. Open the side panel and confirm each card renders with correct color, fields, and layout. Confirm the `⏳ Analyzing...` state appears immediately on sentence capture and transitions to a verdict when the backend responds.

---

### Milestone 13: Speaker Attribution — Layered Strategy (Could Have)

> **Strategy:** 4-layer fallback — Transcript Labels → LLM from Title/Description → Frame OCR → "Unknown Speaker"

---

#### Layer 1 — Transcript Speaker Label Scraping (free, DOM-only)

- [x] **[Task 13.1] Transcript Segment Speaker Label Parsing**
  - **Focus:** Extension / DOM Scripting
  - **Branch:** `feature/13.1-transcript-speaker-labels`
  - **Description:** When `clickTranscriptAndScrape()` collects transcript segments (Milestone 11.1), check each segment's text for a `[Speaker: Name]:` or `Speaker Name:` prefix regex. Attach the resolved speaker to the segment payload and propagate a `primarySpeaker` field up to `background.js`.
  - **Sub-tasks:**
    - [x] **13.1.a** In `content.js`, in `clickTranscriptAndScrape()`, run each segment's `.text` through a regex like `/^\[?([A-Z][a-z]+(?: [A-Z][a-z]+)+)\]?:\s*/` to detect an embedded speaker label. Strip the label from the text before storing.
    - [x] **13.1.b** Collect a `speakerMap: { startMs: speakerName }` alongside segments. Attach the resolved `speaker` string (or `null`) to each `{ text, startMs, speaker }` segment object.
    - [x] **13.1.c** Derive `primarySpeaker` as the first non-null speaker name seen in the segment list. Include it in the `FULL_TRANSCRIPT` message: `{ action: "FULL_TRANSCRIPT", segments, videoId, primarySpeaker }`.
    - [x] **13.1.d** In `background.js`, on `FULL_TRANSCRIPT`, read `primarySpeaker`. If non-null and `currentSpeaker` is still `"Unknown Speaker"`, set `currentSpeaker = primarySpeaker` (confidence: `"high"`). Log clearly: `[bg] 🏷️ Speaker from transcript labels: "${primarySpeaker}"`.
    - [x] **13.1.e** Write `docs/ADR-004-speaker-attribution.md` documenting all four layers, rejected alternatives (audio diarization — too slow for live streams), trade-offs, and fallback chain.
  - **Verification:** Open a YouTube video that has a human transcript with `[Speaker Name]:` markers (e.g., a White House press briefing with multiple speakers). Confirm `primarySpeaker` appears in the `FULL_TRANSCRIPT` message and `currentSpeaker` is updated in `background.js` console.

---

#### Layer 2 — LLM from Video Title + Description (cheap MVP, always works)

- [x] **[Task 13.2] LLM Speaker Resolver Service (Backend)**
  - **Focus:** Backend / Services
  - **Branch:** `feature/13.2-llm-speaker-resolver`
  - **Description:** Create a new backend service and REST endpoint that accepts a YouTube video title + description snippet and returns the primary speaker name (normalized), confidence level, and full speaker list for multi-speaker videos. Uses the existing `cognee` LLMGateway.
  - **Sub-tasks:**
    - [x] **13.2.a** Create `app/services/speaker_resolver.py`. Define `SpeakerResolution(BaseModel)` with fields: `name: str`, `confidence: Literal["high", "medium", "low"]`, `matched_politician: bool`, `all_speakers: list[str]`.
    - [x] **13.2.b** Implement `async def resolve_speaker_from_metadata(title, description, existing_politicians) -> SpeakerResolution`. Prompt the LLM: given title + description (first 500 chars), identify primary speaker and return structured JSON. Use `cognee`'s `LLMGateway.acomplete()`.
    - [x] **13.2.c** Add an in-memory cache keyed by `sha256(title + description)` so repeated calls for the same video are free (one LLM call per unique video).
    - [x] **13.2.d** Create `app/api/speaker.py` with `router = APIRouter()`. Add `POST /api/resolve-speaker` endpoint accepting `{ title: str, description: str }` and returning `SpeakerResolution`. Register this router in `app/main.py`.
    - [x] **13.2.e** Write `tests/test_speaker_resolver.py` with mocked LLMGateway responses covering: (i) solo speaker → `confidence: "high"`, (ii) debate video → `confidence: "medium"` + multiple `all_speakers`, (iii) unidentifiable title → `name: "Unknown Speaker"`.
  - **Verification:** `pytest tests/test_speaker_resolver.py` passes. `curl -X POST /api/resolve-speaker -d '{"title":"Joe Biden State of the Union 2024","description":"..."}' ` returns `{"name":"Joe Biden","confidence":"high",...}`.

- [x] **[Task 13.3] Video Metadata Scraper & Speaker Threading (Extension)**
  - **Focus:** Extension / content.js + background.js
  - **Branch:** `feature/13.3-video-metadata-speaker`
  - **Description:** On page load and `yt-navigate-finish`, scrape the video title and description from the YouTube DOM and send them to `background.js` as a `VIDEO_METADATA` message. `background.js` calls the new `/api/resolve-speaker` REST endpoint, stores the result as `currentSpeaker`, and attaches the speaker to every outgoing WebSocket payload.
  - **Sub-tasks:**
    - [x] **13.3.a** In `content.js`, add `scrapeVideoMetadata()`: read `document.title` and the first 500 chars of `#description yt-attributed-string` (or `ytd-expander`). Send `{ action: "VIDEO_METADATA", title, description, videoId }` to `background.js`. Call on page load and `yt-navigate-finish` (after the existing `resetBuffer()` call), with a 2-second delay for DOM hydration.
    - [x] **13.3.b** In `background.js`, add state: `let currentSpeaker = "Unknown Speaker"; let speakerConfidence = "low"; let allSpeakers = [];`. On `NAVIGATE_FINISH`, reset all three to defaults.
    - [x] **13.3.c** Add `VIDEO_METADATA` handler in `background.js`'s `chrome.runtime.onMessage.addListener`. Use `fetch()` to POST `{ title, description }` to `http://localhost:8000/api/resolve-speaker`. On success, set `currentSpeaker`, `speakerConfidence`, and `allSpeakers` from the response. Persist `currentSpeaker` to `chrome.storage.local`. Log: `[bg] 🧠 LLM resolved speaker: "${name}" (confidence: "${confidence}")`.
    - [x] **13.3.d** Modify `handleSegmentedSentence(text, speakerOverride = null)` in `background.js` to accept an optional override. Use `speakerOverride ?? currentSpeaker` as the final speaker. Include `speaker` and `speakerConfidence` in the WebSocket JSON payload: `{ sentence: cleanText, speaker, speakerConfidence }`.
    - [x] **13.3.e** In `background.js`, propagate `speaker` from the `CAPTION_CHUNK` message (if present) into the `streamBuffer.addChunk()` call and store the most-recent chunk's speaker so it is passed to `handleSegmentedSentence()` when the buffer flushes.
  - **Verification:** Open any YouTube video of a political speech. Within 3 seconds, `background.js` console shows `[bg] 🧠 LLM resolved speaker: "..."`. Confirm `speaker` field is present in the WebSocket payload observed in the backend logs.

- [x] **[Task 13.4] Backend Pipeline Speaker Wiring**
  - **Focus:** Backend / API + Services + Schemas
  - **Branch:** `feature/13.4-backend-speaker-wiring`
  - **Description:** Thread the `speaker` field from the WebSocket payload through the entire backend pipeline: WebSocket handler → orchestrator → `Claim` schema. Remove the hardcoded `"Governor Alexis Vance"`.
  - **Sub-tasks:**
    - [x] **13.4.a** Add `speaker: Optional[str] = None` and `speaker_confidence: Optional[Literal["high", "medium", "low"]] = None` to the `Claim` model in `app/schemas.py`. Update `metadata.index_fields` to include `"speaker"`. Run `pytest tests/test_schemas.py`.
    - [x] **13.4.b** In `app/api/websocket.py`, read `speaker = data.get("speaker", "Unknown Speaker")` and `speaker_confidence = data.get("speakerConfidence", "low")` from the incoming JSON. Only trust speaker as `politician_name` when `speaker_confidence` is `"medium"` or `"high"`; else use `"Unknown Speaker"`.
    - [x] **13.4.c** Remove the hardcoded `politician_name="Governor Alexis Vance"` on line 67 of `websocket.py`. Replace with the dynamic `speaker` value from the payload.
    - [x] **13.4.d** Update `process_incoming_sentence()` in `app/services/orchestrator.py` to accept and forward `politician_name: str = "Unknown Speaker"` (it already does; verify no implicit assumptions about the name value).
    - [x] **13.4.e** Include `speaker` and `speakerConfidence` in the WebSocket response payload sent back to the extension so the side panel can display attribution on verdict cards.
  - **Verification:** `pytest` passes with no regressions. Backend logs show the actual resolved speaker name (not `"Governor Alexis Vance"`) for every processed sentence. Side panel verdict cards display the speaker name.

---

#### Layer 3 — Video Frame OCR for Lower-Third Graphics (Broadcast News, Optional)

- [ ] **[Task 13.5] Frame OCR Lower-Third Scraper (Extension + Backend)**
  - **Focus:** Extension / content.js + Backend / OCR service
  - **Branch:** `feature/13.5-frame-ocr-lower-third`
  - **Description:** For broadcast news streams where lower-third chyrons identify the speaker, periodically capture the video player frame from the extension, crop the bottom 20%, send it to a new vision-LLM backend endpoint, and use the returned speaker to override `currentSpeaker` in real-time.
  - **Sub-tasks:**
    - [ ] **13.5.a** In `background.js`, add `startLowerThirdPoller(videoId)` that fires `chrome.tabs.captureVisibleTab()` every 3 seconds. Crop the bottom 20% of the player element's bounding box from the captured screenshot (canvas crop). Rate-limit: skip if a request is already in-flight.
    - [ ] **13.5.b** POST the cropped image (base64 PNG) to `POST /api/ocr-lower-third` with `{ image: base64str, videoId }`. On success, if `result.speaker` is non-null and differs from `currentSpeaker`, update `currentSpeaker` and log: `[bg] 📺 Lower-third updated speaker → "${result.speaker}"`.
    - [ ] **13.5.c** Create `app/api/ocr.py` with `POST /api/ocr-lower-third`. Accept `{ image: str, videoId: str }`. Decode base64, send to vision LLM (Gemini Vision or GPT-4o) with prompt: "Read any lower-third text in this image. Return the speaker's name on the first line if present, or null." Regex-post-process to normalize `FIRSTNAME LASTNAME`. Return `{ speaker: str | null, confidence: str }`.
    - [ ] **13.5.d** Add deduplication in `ocr.py`: if the same speaker was returned for the last 3 consecutive frames, skip sending updates to avoid redundant state churn in the extension.
    - [ ] **13.5.e** Add `OCR_ENABLED: bool` env flag (default `false`) so this feature is opt-in. Register `app/api/ocr.py` router in `app/main.py` only when `OCR_ENABLED=true`.
  - **Verification:** With `OCR_ENABLED=true`, open a CNN YouTube live stream with visible lower-third name graphics. Confirm `currentSpeaker` updates in `background.js` console within 3–6 seconds of a new speaker appearing. Confirm the updated speaker name propagates to the WebSocket payload and appears on the next verdict card.

---

### Milestone 14: Multi-API Key Rotation with Rate-Limit Fallback (Should Have)

> **Goal:** Eliminate pipeline freezes caused by a single API key hitting its rate limit. Replace the current single-key retry loop with a key pool that immediately falls over to a healthy key on HTTP 429, with per-key cooldown tracking.

- [ ] **[Task 14.1] LLM Key Pool**
  - **Focus:** Infrastructure / LLM
  - **Branch:** `feature/14.1-llm-key-pool`
  - **Description:** Create `app/services/key_pool.py` with an `LLMKeyPool` class. The pool reads comma-separated API keys from env vars (e.g., `GEMINI_API_KEYS=key1,key2,key3`). `next_key()` round-robins across all keys, skipping any that are currently in a cooldown window. `mark_rate_limited(key)` stamps a key with the current timestamp and evicts it from rotation for `cooldown_duration` seconds (default 60s). `available_count()` returns the number of non-cooling keys. The class must be async-safe (use `asyncio.Lock` for concurrent calls).
  - **Sub-tasks:**
    - [ ] **14.1.a** Create `app/services/key_pool.py`. Implement `LLMKeyPool(keys: list[str], cooldown_duration: int = 60)` with internal `_cooldowns: dict[str, float]` tracking. `next_key()` iterates the list in round-robin order, skips keys whose `time.time() - _cooldowns[key] < cooldown_duration`, and raises `AllKeysExhaustedError` if none are available.
    - [ ] **14.1.b** Define `AllKeysExhaustedError(Exception)` in the same file. This is raised when every key in the pool is currently on cooldown — the caller should surface this as a pipeline stall with a clear log message rather than a silent retry.
    - [ ] **14.1.c** Add `available_count() -> int` and `cooldown_status() -> dict[str, float]` methods for observability (used in health-check endpoint and logs).
    - [ ] **14.1.d** Update `app/env_init.py` to parse `GEMINI_API_KEYS`, `OPENAI_API_KEYS`, and `GROQ_API_KEYS` env vars as comma-separated lists. Update `.env.template` to document the multi-key format with a comment explaining the rotation behaviour.
    - [ ] **14.1.e** Write `tests/test_key_pool.py` covering: (i) round-robin ordering across N keys, (ii) rate-limited key is skipped and next is returned, (iii) all keys rate-limited raises `AllKeysExhaustedError`, (iv) key recovers after `cooldown_duration` elapses (mock `time.time`).
  - **Verification:** `pytest tests/test_key_pool.py` passes. Manually set `GEMINI_API_KEYS=bad_key,real_key` — confirm the pool skips `bad_key` after its first 429 and uses `real_key` for all subsequent calls without any pipeline stall.

- [ ] **[Task 14.2] LLM Gateway Wrapper with Key Rotation**
  - **Focus:** Infrastructure / LLM
  - **Branch:** `feature/14.2-gateway-key-wrapper`
  - **Description:** Create a thin wrapper around `LLMGateway.acreate_structured_output()` that pulls the next available key from the pool before each call, injects it, catches `RateLimitError` / HTTP 429 exceptions, marks the key as cooling, and immediately retries with the next available key — without any sleep on the same key. Existing callers (`claim_extractor.py`, `speaker_resolver.py`) route through the wrapper with no interface change.
  - **Sub-tasks:**
    - [ ] **14.2.a** Audit how `LLMGateway.acreate_structured_output()` resolves its API key (env var vs constructor arg). If it supports a per-call `api_key` kwarg (via `litellm` underneath), use that. If not, use `litellm.acompletion()` directly with `api_key=key` for the rotating calls and keep `LLMGateway` only for non-key-sensitive operations.
    - [ ] **14.2.b** Create `app/services/llm_caller.py`. Implement `async def acreate_structured_output_with_rotation(text_input, system_prompt, response_model) -> T`. Loop: get `key = pool.next_key()` → call LLM with that key → on `RateLimitError` call `pool.mark_rate_limited(key)` and continue loop → on `AllKeysExhaustedError` log a clear error and re-raise → on success return result.
    - [ ] **14.2.c** Update `app/services/claim_extractor.py` to import and call `acreate_structured_output_with_rotation` instead of `LLMGateway.acreate_structured_output` directly. No other interface changes.
    - [ ] **14.2.d** Update `app/services/speaker_resolver.py` with the same substitution as 14.2.c.
    - [ ] **14.2.e** Add structured log lines: on key switch log `[llm] ⚡ Key rotated: key_xxx rate-limited, switching to key_yyy (N keys remaining)`. On `AllKeysExhaustedError` log `[llm] ❌ All API keys exhausted. Pipeline stalled — add more keys or wait for cooldown.`
  - **Verification:** Mock the LLM client to return HTTP 429 for key1 and a valid response for key2. Confirm `llm_caller.py` completes the call successfully using key2 with zero sleep delay. Confirm the correct log lines appear. Run `pytest` with no regressions on existing tests.

---

### Milestone 15: Cross-Sentence Coreference Resolution (Must Have)

> **Goal:** Ensure every stored `Claim.statement` is a fully self-contained sentence where all pronouns and indirect references are resolved to their concrete antecedents. Uses a 3-phase gate to avoid wasting tokens on sentences that need no context.
>
> **Strategy:** Phase 1 — cheap regex gates out self-contained sentences (zero LLM cost). Phase 2 — a compact rolling `SpeechContext` entity state (updated every sentence, covers the whole session) is injected only when references are detected. Phase 3 — fallback to last 2 raw sentences for rare ambiguous cases.

- [ ] **[Task 15.1] Reference Detector & SpeechContext Tracker**
  - **Focus:** Backend / Services
  - **Branch:** `feature/15.1-reference-detector`
  - **Description:** Create `app/services/coreference.py` containing two components: (A) a `has_references(sentence)` function that uses regex to detect pronouns, demonstratives, and anaphoric phrases without any LLM call; and (B) a `SpeechContext` dataclass that maintains a compact, rolling entity state across an entire speech session.
  - **Sub-tasks:**
    - [ ] **15.1.a** Create `app/services/coreference.py`. Implement `has_references(sentence: str) -> bool` using a compiled regex pattern covering: personal pronouns (`he, she, they, it, his, her, their, its, him, them`), demonstratives (`this, that, these, those`), and anaphoric phrases (`that figure`, `the plan`, `the initiative`, `the policy`, `as mentioned`, `as I said`, `the same`, `the former`, `the latter`). Return `True` only if a match is found as a whole word (word-boundary anchored). This function must have zero external dependencies and run in < 1ms.
    - [ ] **15.1.b** Implement `SpeechContext` dataclass with fields: `entities: list[Entity]` (where `Entity` has `name: str`, `type: Literal["person", "policy", "metric", "organization"]`, `gender: Optional[Literal["male", "female", "neutral"]]`, `last_seen_idx: int`) and `session_sentence_count: int`. Cap `entities` at 20 most-recently-seen entries (evict by `last_seen_idx`).
    - [ ] **15.1.c** Implement `SpeechContext.update(sentence: str, sentence_idx: int)` — a lightweight heuristic that scans the sentence for: capitalized named entities (regex: `[A-Z][a-z]+ (?:[A-Z][a-z]+ )*` for people/orgs), numeric claims (regex: `\d+\.?\d*\s*(?:%|billion|million|thousand|units)`), and policy keywords (`initiative`, `plan`, `policy`, `bill`, `act`, `program`). Upserts to `entities` list with the correct type. Does NOT call an LLM.
    - [ ] **15.1.d** Implement `SpeechContext.to_context_string() -> str` — renders the entity list as a compact one-line string: `"[Context: {name} ({type}{, gender}), ...]"`. Target: ≤ 80 tokens for a 20-entity state. This is what gets injected into the LLM prompt.
    - [ ] **15.1.e** Write `tests/test_coreference.py` covering: (i) `has_references` returns `True` for sentences with "he", "this plan", "that figure", and `False` for self-contained factual claims; (ii) `SpeechContext.update()` correctly extracts named persons, numeric metrics, and policy keywords; (iii) `to_context_string()` output is under 80 tokens for a 20-entity state.
  - **Verification:** `pytest tests/test_coreference.py` passes. Feed 20 speech sentences to `SpeechContext.update()` and log the entity state. Confirm named politicians, policies, and numeric metrics all appear in `to_context_string()` output.

- [ ] **[Task 15.2] 3-Phase Context Injection in Claim Extractor**
  - **Focus:** Backend / Services + API
  - **Branch:** `feature/15.2-context-injection`
  - **Description:** Wire the 3-phase gate into the claim extraction pipeline. Phase 1 gates on `has_references()`. Phase 2 injects `SpeechContext.to_context_string()`. Phase 3 falls back to the last 2 raw sentences from the `sentence_history` buffer. Update the LLM system prompt to instruct full pronoun resolution before extraction.
  - **Sub-tasks:**
    - [ ] **15.2.a** Update `app/api/websocket.py` to maintain a per-connection `sentence_history: deque[str]` (maxlen=5) that appends each accepted sentence after it passes the dedup/length filters. Pass `sentence_history` to `process_incoming_sentence()`. Also instantiate a per-connection `SpeechContext` object and pass it along.
    - [ ] **15.2.b** Update `process_incoming_sentence()` in `app/services/orchestrator.py` to accept `sentence_history: deque[str]` and `speech_context: SpeechContext`. Forward both to `extract_claim_from_text()`. After `extract_claim_from_text()` returns, call `speech_context.update(text, sentence_idx)` to keep the entity state current regardless of whether a claim was found.
    - [ ] **15.2.c** Update `extract_claim_from_text()` in `app/services/claim_extractor.py` to implement the 3-phase gate:
      - **Phase 1:** Call `has_references(text)`. If `False`, set `context_prefix = ""` (skip phases 2 and 3 entirely).
      - **Phase 2:** If `True`, call `speech_context.to_context_string()`. If entity state is non-empty, set `context_prefix = context_string`.
      - **Phase 3:** If entity state is empty (early in session), set `context_prefix = " ".join(list(sentence_history)[-2:])`.
    - [ ] **15.2.d** Update `SYSTEM_PROMPT` in `claim_extractor.py` to add a coreference resolution instruction block: *"If the sentence contains unresolved pronouns or indirect references (e.g., 'he', 'this plan', 'that figure'), use the provided context to substitute the concrete referent before extracting the statement. The extracted `statement` field MUST be a fully self-contained sentence that can be understood without any prior context."*
    - [ ] **15.2.e** Add an optional `raw_sentence: Optional[str] = None` field to the `Claim` schema in `app/schemas.py` to preserve the original unresolved sentence alongside the resolved `statement` for debugging. Populate it in `extract_claim_from_text()` when `context_prefix != ""`.
  - **Verification:** Feed the pipeline a 3-sentence speech sequence where sentence 3 uses "she" referring to a politician named in sentence 1. Confirm: `has_references()` returns `True` for sentence 3, entity state contains the politician, the stored `Claim.statement` contains the politician's name (not "she"), and `Claim.raw_sentence` contains the original "she" sentence. Confirm sentence 1 (self-contained) has empty `context_prefix` and `raw_sentence=None`.

