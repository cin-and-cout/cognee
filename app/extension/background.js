let socket = null;
let reconnectTimer = null;

// ============================================================================
// StreamBuffer — Sentence segmenter for raw caption chunks (Milestone 10.2)
// ============================================================================

/**
 * Accumulates raw word chunks from content.js and segments them into
 * complete sentences using three strategies:
 *
 *   A) Rule-based punctuation splitting (fast path)
 *   B) Pause detection — adaptive timeout cross-referenced against the
 *      bufferSnapshot from content.js to confirm a real speech pause
 *   C) Max-buffer safety valve (40 words)
 *
 * New in Milestone 10.2:
 *   - `flushTimer` renamed to `pauseDetectionTimer` for semantic clarity.
 *   - `lastSnapshot` — stores the bufferSnapshot from the most recent chunk.
 *     When pauseDetectionTimer fires, the snapshot's word count is compared
 *     to the internal buffer word count. If they match, the pause is confirmed
 *     and the buffer is flushed immediately; otherwise one heartbeat deferral
 *     is allowed before a force-flush.
 *   - `lastChunkArrival` — timestamp of the most recent chunk. If the gap
 *     since lastChunkArrival exceeds 1.5× the computed pauseDetectionTimeout,
 *     the buffer is force-flushed with no deferral (hard pause).
 *   - `stats()` method for live debugging from the service-worker console.
 *
 * Deduplication uses a Global Word Ledger — an append-only list of every
 * word ever emitted (capped at 200). Before emitting a sentence, its prefix
 * is aligned against the ledger's suffix to strip already-emitted words.
 *
 * A 5-second heartbeat timer ensures the buffer is drained even when no
 * new chunks arrive (e.g., video paused or segment ended).
 */
class StreamBuffer {
  constructor(onSentenceReady) {
    this.onSentenceReady = onSentenceReady; // callback(sentenceText)

    // Buffer state
    this.buffer = "";

    // --- Milestone 10.2.a: renamed from flushTimer ---
    this.pauseDetectionTimer = null;

    // --- Milestone 10.2.b: bufferSnapshot cross-reference ---
    this.lastSnapshot = ""; // snapshot from the most recent CAPTION_CHUNK

    // --- Milestone 10.2.c: hard-pause detection ---
    this.lastChunkArrival = 0;            // timestamp (ms) of most recent chunk
    this._pendingDeferral = false;        // true when we are in the one-deferral window

    // Adaptive timeout state — tracks speaking rate
    this.wordTimestamps = [];        // array of { count, time } for rolling WPS
    this.WPS_WINDOW_MS = 10000;      // 10-second rolling window
    this.AVG_WORDS_PER_SENTENCE = 12;

    // Timeout bounds (ms) — same clamped range [800ms–3000ms]
    this.MIN_TIMEOUT = 800;
    this.MAX_TIMEOUT = 3000;

    // Safety valve
    this.MAX_BUFFER_WORDS = 40;

    // Global Word Ledger — every word ever emitted, for overlap stripping
    this.emittedWords = [];
    this.MAX_LEDGER_WORDS = 200;

    // Heartbeat flush — drain stale buffer when no new chunks arrive
    this.heartbeatTimer = null;
    this.HEARTBEAT_MS = 5000;

    // For stats()
    this._lastFlushMethod = "none";
    this._emittedTotal = 0;

    // Common abbreviations that should NOT trigger a sentence split
    this.ABBREVIATIONS = new Set([
      "mr", "mrs", "ms", "dr", "prof", "sr", "jr", "st", "ave",
      "vs", "etc", "approx", "dept", "est", "inc", "ltd", "corp",
      "gen", "gov", "sgt", "capt", "col", "lt", "rep", "sen",
      "u.s", "u.k", "e.u", "u.n",
    ]);
  }

  /**
   * Feed a new chunk of raw text into the buffer.
   *
   * @param {string} text          — The delta word chunk from content.js.
   * @param {string} bufferSnapshot — The last 100 words of globalWordBuffer
   *                                  (joined as a string) from content.js.
   */
  addChunk(text, bufferSnapshot = "") {
    if (!text || !text.trim()) return;

    const cleaned = text.trim();

    // 10.2.b — store the latest snapshot for pause confirmation
    this.lastSnapshot = bufferSnapshot || "";

    // 10.2.c — record arrival timestamp for hard-pause detection
    this.lastChunkArrival = Date.now();
    this._pendingDeferral = false; // cancel any active deferral on new data

    // Append to buffer
    if (this.buffer.length > 0) {
      this.buffer += " " + cleaned;
    } else {
      this.buffer = cleaned;
    }

    // Track word arrival for WPS calculation
    const wordCount = cleaned.split(/\s+/).length;
    this.wordTimestamps.push({ count: wordCount, time: Date.now() });
    this._pruneWordTimestamps();

    // Strategy A: Try rule-based punctuation split
    this._tryRuleBasedSplit();

    // Strategy C: Check safety valve
    this._checkSafetyValve();

    // Strategy B: Reset pause detection timer
    this._resetPauseDetectionTimer();

    // Reset heartbeat — we just received data
    this._resetHeartbeat();
  }

  /**
   * Strategy A — Rule-based punctuation splitting.
   *
   * Looks for sentence-ending punctuation (. ! ?) in the buffer.
   * Only splits when:
   *   - The punctuation is followed by a space + uppercase letter, OR is at end of buffer
   *   - At least 4 words precede the punctuation (avoids abbreviation false positives)
   *   - The word before the punctuation is NOT a known abbreviation
   */
  _tryRuleBasedSplit() {
    let didFlush = true;

    while (didFlush) {
      didFlush = false;

      const match = this.buffer.match(/[.!?](\s+[A-Z]|\s*$)/);
      if (!match) break;

      const splitIndex = match.index + 1;
      const candidate = this.buffer.substring(0, splitIndex).trim();
      const words = candidate.split(/\s+/);

      if (words.length < 4) break;

      const lastWord = words[words.length - 1]
        .replace(/[.!?]+$/, "")
        .toLowerCase();
      if (this.ABBREVIATIONS.has(lastWord)) break;

      if (/\d\.\d/.test(candidate.slice(-6))) break;

      this._flushSentence(candidate, "punctuation");
      this.buffer = this.buffer.substring(splitIndex).trim();
      didFlush = true;
    }
  }

  /**
   * Strategy B — Pause detection timer.
   *
   * Renamed from `_resetAdaptiveTimeout` for semantic clarity (10.2.a).
   *
   * When the timer fires, cross-references the bufferSnapshot word count against
   * the internal buffer word count (10.2.b):
   *   - Match → confirmed pause → flush immediately.
   *   - Mismatch → allow one heartbeat deferral → then force-flush.
   *
   * Hard-pause shortcut (10.2.c): if the gap since lastChunkArrival exceeds
   * 1.5× the computed timeout, force-flush immediately with no deferral.
   */
  _resetPauseDetectionTimer() {
    if (this.pauseDetectionTimer) {
      clearTimeout(this.pauseDetectionTimer);
      this.pauseDetectionTimer = null;
    }

    if (!this.buffer.trim()) return;

    const timeout = this._computeAdaptiveTimeout();

    this.pauseDetectionTimer = setTimeout(() => {
      if (!this.buffer.trim()) return;

      // 10.2.c — Hard pause: gap since last chunk exceeds 1.5× timeout
      const gap = Date.now() - this.lastChunkArrival;
      if (gap >= timeout * 1.5) {
        console.log("StreamBuffer: Hard pause detected — force-flushing.");
        this._flushSentence(this.buffer.trim(), "hard_pause");
        this.buffer = "";
        return;
      }

      // 10.2.b — Confirm pause via bufferSnapshot word count
      const snapshotWords = this.lastSnapshot
        ? this.lastSnapshot.trim().split(/\s+/).filter(Boolean).length
        : 0;
      const bufferWords = this.buffer.trim().split(/\s+/).filter(Boolean).length;

      if (snapshotWords > 0 && snapshotWords === bufferWords) {
        // Snapshot and buffer agree — this is a real pause
        console.log("StreamBuffer: Pause confirmed via snapshot — flushing.");
        this._flushSentence(this.buffer.trim(), "pause_confirmed");
        this.buffer = "";
      } else {
        // Counts differ — data might still be in flight; defer one heartbeat
        if (!this._pendingDeferral) {
          console.log("StreamBuffer: Pause unconfirmed — deferring one heartbeat.");
          this._pendingDeferral = true;
          // Force-flush when the heartbeat fires (heartbeat is already running)
          // Re-arm a one-shot deferral flush after HEARTBEAT_MS
          setTimeout(() => {
            if (this.buffer.trim() && this._pendingDeferral) {
              console.log("StreamBuffer: Deferral elapsed — force-flushing.");
              this._flushSentence(this.buffer.trim(), "deferred_flush");
              this.buffer = "";
              this._pendingDeferral = false;
            }
          }, this.HEARTBEAT_MS);
        }
      }
    }, timeout);
  }

  /**
   * Compute the adaptive timeout in ms.
   *
   * Formula: timeout = (avgWordsPerSentence / wordsPerSecond) * 1000
   * Clamped to [MIN_TIMEOUT, MAX_TIMEOUT].
   */
  _computeAdaptiveTimeout() {
    const wps = this._getWordsPerSecond();

    if (wps <= 0) {
      return 1200;
    }

    const rawTimeout = (this.AVG_WORDS_PER_SENTENCE / wps) * 1000;
    return Math.max(this.MIN_TIMEOUT, Math.min(this.MAX_TIMEOUT, rawTimeout));
  }

  /**
   * Strategy C — Safety valve.
   *
   * Force-flush the buffer if it exceeds MAX_BUFFER_WORDS.
   */
  _checkSafetyValve() {
    const words = this.buffer.trim().split(/\s+/);
    if (words.length >= this.MAX_BUFFER_WORDS) {
      const midpoint = Math.floor(words.length / 2);
      let bestSplit = midpoint;

      for (let i = midpoint - 5; i <= midpoint + 5 && i < words.length; i++) {
        if (i < 0) continue;
        const word = words[i];
        if (
          /[,;]$/.test(word) ||
          ["and", "but", "or", "so", "yet", "because", "while", "when", "then"].includes(
            word.toLowerCase()
          )
        ) {
          bestSplit = i + 1;
          break;
        }
      }

      const sentence = words.slice(0, bestSplit).join(" ");
      this.buffer = words.slice(bestSplit).join(" ");
      this._flushSentence(sentence, "safety_valve");
    }
  }

  /**
   * Calculate rolling words-per-second from recent chunk arrivals.
   */
  _getWordsPerSecond() {
    this._pruneWordTimestamps();

    if (this.wordTimestamps.length < 2) return 0;

    const totalWords = this.wordTimestamps.reduce((sum, entry) => sum + entry.count, 0);
    const timeSpan =
      this.wordTimestamps[this.wordTimestamps.length - 1].time -
      this.wordTimestamps[0].time;

    if (timeSpan <= 0) return 0;

    return totalWords / (timeSpan / 1000);
  }

  /**
   * Prune word timestamps outside the rolling window.
   */
  _pruneWordTimestamps() {
    const cutoff = Date.now() - this.WPS_WINDOW_MS;
    this.wordTimestamps = this.wordTimestamps.filter((entry) => entry.time >= cutoff);
  }

  /**
   * Strip overlapping prefix from a sentence using the Global Word Ledger.
   *
   * Finds the longest prefix of `sentenceWords` that matches a suffix of
   * `this.emittedWords`, and returns only the non-overlapping tail.
   */
  _stripOverlapWithLedger(sentenceWords) {
    if (this.emittedWords.length === 0 || sentenceWords.length === 0) {
      return sentenceWords;
    }

    const MIN_OVERLAP_WORDS = 2;
    const maxOverlap = Math.min(this.emittedWords.length, sentenceWords.length);

    for (let overlapLen = maxOverlap; overlapLen >= MIN_OVERLAP_WORDS; overlapLen--) {
      let matches = true;
      for (let i = 0; i < overlapLen; i++) {
        const ledgerWord = this.emittedWords[this.emittedWords.length - overlapLen + i];
        const sentenceWord = sentenceWords[i];
        if (ledgerWord.toLowerCase() !== sentenceWord.toLowerCase()) {
          matches = false;
          break;
        }
      }
      if (matches) {
        console.log(
          `StreamBuffer: Stripped ${overlapLen} overlapping words from sentence prefix`
        );
        return sentenceWords.slice(overlapLen);
      }
    }

    return sentenceWords;
  }

  /**
   * Flush a complete sentence. Uses the Global Word Ledger to strip any
   * overlapping prefix (words already emitted), then appends the new words
   * to the ledger.
   *
   * @param {string} sentence      — The candidate sentence text.
   * @param {string} flushMethod   — Label for stats() (e.g. "punctuation").
   */
  _flushSentence(sentence, flushMethod = "unknown") {
    const trimmed = sentence.trim();
    if (!trimmed) return;

    // Cancel any pending pause detection timer
    if (this.pauseDetectionTimer) {
      clearTimeout(this.pauseDetectionTimer);
      this.pauseDetectionTimer = null;
    }

    // Tokenize and strip overlap with the Global Word Ledger
    const sentenceWords = trimmed.split(/\s+/);
    const newWords = this._stripOverlapWithLedger(sentenceWords);

    if (newWords.length === 0) {
      console.log("StreamBuffer: Fully overlapping sentence suppressed:", trimmed);
      return;
    }

    const dedupedSentence = newWords.join(" ");

    // Append new words to the ledger
    this.emittedWords.push(...newWords);
    this._emittedTotal += newWords.length;

    // Cap ledger size to prevent unbounded memory growth
    if (this.emittedWords.length > this.MAX_LEDGER_WORDS) {
      this.emittedWords = this.emittedWords.slice(
        this.emittedWords.length - this.MAX_LEDGER_WORDS
      );
    }

    this._lastFlushMethod = flushMethod;
    console.log(`StreamBuffer [${flushMethod}]: Sentence ready:`, dedupedSentence);
    this.onSentenceReady(dedupedSentence);
  }

  /**
   * Heartbeat timer — flushes stale buffer content when no new chunks
   * arrive within HEARTBEAT_MS. Handles edge cases like video pausing
   * mid-sentence or a segment ending without triggering the pause detector.
   */
  _resetHeartbeat() {
    if (this.heartbeatTimer) {
      clearTimeout(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    this.heartbeatTimer = setTimeout(() => {
      if (this.buffer.trim()) {
        console.log("StreamBuffer: Heartbeat flush — draining stale buffer");
        this._flushSentence(this.buffer.trim(), "heartbeat");
        this.buffer = "";
      }
    }, this.HEARTBEAT_MS);
  }

  /**
   * Milestone 10.2.e — Debug stats snapshot.
   *
   * @returns {{ bufferWords: number, emittedTotal: number, wps: number, lastFlushMethod: string }}
   */
  stats() {
    const bufferWords = this.buffer.trim()
      ? this.buffer.trim().split(/\s+/).length
      : 0;
    return {
      bufferWords,
      emittedTotal: this._emittedTotal,
      wps: Math.round(this._getWordsPerSecond() * 10) / 10,
      lastFlushMethod: this._lastFlushMethod,
    };
  }

  /**
   * Reset all state (e.g., when disconnecting or on CLEAR_BUFFER).
   */
  reset() {
    this.buffer = "";
    this.lastSnapshot = "";
    this.lastChunkArrival = 0;
    this._pendingDeferral = false;
    this.wordTimestamps = [];
    this.emittedWords = [];
    this._emittedTotal = 0;
    this._lastFlushMethod = "none";
    if (this.pauseDetectionTimer) {
      clearTimeout(this.pauseDetectionTimer);
      this.pauseDetectionTimer = null;
    }
    if (this.heartbeatTimer) {
      clearTimeout(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
}

// ============================================================================
// Instantiate the StreamBuffer
// ============================================================================

const streamBuffer = new StreamBuffer((sentence) => {
  handleSegmentedSentence(sentence);
});

// ============================================================================
// Chrome Extension Lifecycle
// ============================================================================

chrome.runtime.onInstalled.addListener(() => {
  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel
      .setPanelBehavior({ openPanelOnActionClick: true })
      .catch((error) => console.error("Error setting panel behavior:", error));
  }
});

// Listen for messages from popup or content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "CONNECT") {
    connectWebSocket(message.url);
  } else if (message.action === "DISCONNECT") {
    disconnectWebSocket();
  } else if (message.action === "CAPTION_CHUNK") {
    // 10.2.d — pass both text and bufferSnapshot into the StreamBuffer
    streamBuffer.addChunk(message.text, message.bufferSnapshot || "");
  } else if (message.action === "TRANSCRIPT_CAPTURED") {
    // Legacy: still accept pre-formed sentences (e.g., from other sources)
    handleSegmentedSentence(message.text);
  } else if (message.action === "CLEAR_BUFFER") {
    streamBuffer.reset();
    console.log("StreamBuffer: reset via CLEAR_BUFFER message.");
  }
});

// ============================================================================
// WebSocket Management
// ============================================================================

function connectWebSocket(url) {
  disconnectWebSocket();

  try {
    socket = new WebSocket(url);

    socket.onopen = () => {
      console.log("WebSocket connected to " + url);
      chrome.storage.local.set({ isRunning: true });
      chrome.runtime.sendMessage({ action: "STATUS_UPDATE", isRunning: true });
    };

    socket.onmessage = (event) => {
      console.log("Message from server: ", event.data);
      try {
        const data = JSON.parse(event.data);
        if (data.text) {
          chrome.storage.local.get("logs", (store) => {
            const logs = store.logs || [];
            const existingLog = logs.find((l) => l.text === data.text);
            if (existingLog) {
              existingLog.report = data.report;
            } else {
              logs.push({
                timestamp: Date.now(),
                text: data.text,
                report: data.report,
              });
            }
            if (logs.length > 50) {
              logs.shift();
            }
            chrome.storage.local.set({ logs }, () => {
              chrome.runtime.sendMessage({ action: "NEW_LOG" });
            });
          });
        }
      } catch (err) {
        console.error("Error parsing WebSocket message:", err);
      }
    };

    socket.onerror = (error) => {
      console.error("WebSocket error:", error);
    };

    socket.onclose = () => {
      console.log("WebSocket closed");
      chrome.storage.local.set({ isRunning: false });
      chrome.runtime.sendMessage({ action: "STATUS_UPDATE", isRunning: false });
    };
  } catch (err) {
    console.error("Connection failed:", err);
    chrome.storage.local.set({ isRunning: false });
    chrome.runtime.sendMessage({ action: "STATUS_UPDATE", isRunning: false });
  }
}

function disconnectWebSocket() {
  if (socket) {
    socket.close();
    socket = null;
  }
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  streamBuffer.reset();
  chrome.storage.local.set({ isRunning: false });
}

// ============================================================================
// Sentence Handling
// ============================================================================

/**
 * Handle a fully segmented sentence — send it to the backend and log it.
 */
function handleSegmentedSentence(text) {
  if (!text || !text.trim()) return;

  const cleanText = text.trim();

  if (socket && socket.readyState === WebSocket.OPEN) {
    const payload = JSON.stringify({ sentence: cleanText });
    socket.send(payload);
    console.log("Sent sentence to backend:", cleanText);
  } else {
    console.log("Cannot send sentence: WebSocket is not open.");
  }

  chrome.storage.local.get("logs", (data) => {
    const logs = data.logs || [];
    if (!logs.some((l) => l.text === cleanText)) {
      logs.push({
        timestamp: Date.now(),
        text: cleanText,
        report: null,
      });
      if (logs.length > 50) {
        logs.shift();
      }
      chrome.storage.local.set({ logs }, () => {
        chrome.runtime.sendMessage({ action: "NEW_LOG" });
      });
    }
  });
}
