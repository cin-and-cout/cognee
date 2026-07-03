let socket = null;
let reconnectTimer = null;

// ============================================================================
// StreamBuffer — Sentence segmenter for raw caption chunks
// ============================================================================

/**
 * Accumulates raw word chunks from content.js and segments them into
 * complete sentences using three strategies:
 *
 *   A) Rule-based punctuation splitting (fast path)
 *   B) Adaptive timeout based on rolling words-per-second
 *   C) Max-buffer safety valve (40 words)
 *
 * Deduplication uses a Global Word Ledger — an append-only list of every
 * word ever emitted (capped at 200). Before emitting a sentence, its prefix
 * is aligned against the ledger's suffix to strip already-emitted words.
 * This eliminates all repetition without heuristic thresholds.
 *
 * A 5-second heartbeat timer ensures the buffer is drained even when no
 * new chunks arrive (e.g., video paused or segment ended).
 */
class StreamBuffer {
  constructor(onSentenceReady) {
    this.onSentenceReady = onSentenceReady; // callback(sentenceText)

    // Buffer state
    this.buffer = "";
    this.flushTimer = null;

    // Adaptive timeout state — tracks speaking rate
    this.wordTimestamps = [];        // array of { count, time } for rolling WPS
    this.WPS_WINDOW_MS = 10000;      // 10-second rolling window
    this.AVG_WORDS_PER_SENTENCE = 12;

    // Timeout bounds (ms)
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
   */
  addChunk(text) {
    if (!text || !text.trim()) return;

    const cleaned = text.trim();

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

    // Strategy B: Reset adaptive timeout
    this._resetAdaptiveTimeout();

    // Reset heartbeat — we just received data, so push back the drain timer
    this._resetHeartbeat();
  }

  /**
   * Strategy A — Rule-based punctuation splitting.
   *
   * Looks for sentence-ending punctuation (. ! ?) in the buffer.
   * Only splits when:
   *   - The punctuation is followed by a space + uppercase letter, OR is at the end of the buffer
   *   - At least 4 words precede the punctuation (avoids abbreviation false positives)
   *   - The word before the punctuation is NOT a known abbreviation
   */
  _tryRuleBasedSplit() {
    // Pattern: sentence-ending punctuation followed by space+uppercase or end-of-string
    // We use a loop to extract multiple sentences if the buffer contains several.
    let didFlush = true;

    while (didFlush) {
      didFlush = false;

      // Find a split point: ". X" or "! X" or "? X" where X is uppercase,
      // or punctuation at end of buffer.
      const match = this.buffer.match(/[.!?](\s+[A-Z]|\s*$)/);
      if (!match) break;

      const splitIndex = match.index + 1; // include the punctuation mark
      const candidate = this.buffer.substring(0, splitIndex).trim();
      const words = candidate.split(/\s+/);

      // Must have at least 4 words to be a plausible sentence
      if (words.length < 4) break;

      // Check if the last "word" before punctuation is an abbreviation
      // e.g., "U.S." — strip the trailing punctuation to check
      const lastWord = words[words.length - 1]
        .replace(/[.!?]+$/, "")
        .toLowerCase();
      if (this.ABBREVIATIONS.has(lastWord)) break;

      // Also check for numeric patterns like "3.5" or "$2.1" — don't split on decimal points
      if (/\d\.\d/.test(candidate.slice(-6))) break;

      // Valid split — flush the sentence
      this._flushSentence(candidate);
      this.buffer = this.buffer.substring(splitIndex).trim();
      didFlush = true;
    }
  }

  /**
   * Strategy B — Adaptive timeout.
   *
   * Computes timeout from the current speaking rate (words per second).
   * Slower speakers get longer timeouts, faster speakers get shorter ones.
   */
  _resetAdaptiveTimeout() {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    // Don't set a timer if buffer is empty
    if (!this.buffer.trim()) return;

    const timeout = this._computeAdaptiveTimeout();

    this.flushTimer = setTimeout(() => {
      if (this.buffer.trim()) {
        this._flushSentence(this.buffer.trim());
        this.buffer = "";
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
      // No data yet — use a reasonable default
      return 1200;
    }

    // Time for one "average sentence" to be spoken, in ms
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
      // Try to find the best split point near the middle
      const midpoint = Math.floor(words.length / 2);
      let bestSplit = midpoint;

      // Look for a natural break (comma, semicolon, conjunction) near the midpoint
      for (let i = midpoint - 5; i <= midpoint + 5 && i < words.length; i++) {
        if (i < 0) continue;
        const word = words[i];
        if (/[,;]$/.test(word) || ["and", "but", "or", "so", "yet", "because", "while", "when", "then"].includes(word.toLowerCase())) {
          bestSplit = i + 1;
          break;
        }
      }

      const sentence = words.slice(0, bestSplit).join(" ");
      this.buffer = words.slice(bestSplit).join(" ");
      this._flushSentence(sentence);
    }
  }

  /**
   * Calculate rolling words-per-second from recent chunk arrivals.
   */
  _getWordsPerSecond() {
    this._pruneWordTimestamps();

    if (this.wordTimestamps.length < 2) return 0;

    const totalWords = this.wordTimestamps.reduce((sum, entry) => sum + entry.count, 0);
    const timeSpan = this.wordTimestamps[this.wordTimestamps.length - 1].time - this.wordTimestamps[0].time;

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
   *
   * Example:
   *   emittedWords = [..., "holder", "of", "the", "time", "Spider-Man", "3's", "60", "million"]
   *   sentenceWords = ["of", "the", "time", "Spider-Man", "3's", "60", "million", "dollars", "in", "sales"]
   *   → overlap length: 7 ("of the time Spider-Man 3's 60 million")
   *   → returns: ["dollars", "in", "sales"]
   */
  _stripOverlapWithLedger(sentenceWords) {
    if (this.emittedWords.length === 0 || sentenceWords.length === 0) {
      return sentenceWords;
    }

    // Find the longest prefix of sentenceWords that matches a suffix of emittedWords.
    // Require at least 2 matching words to avoid false positives on common words
    // like "the", "a", "is" that could coincidentally appear at both boundaries.
    const MIN_OVERLAP_WORDS = 2;
    const maxOverlap = Math.min(this.emittedWords.length, sentenceWords.length);

    for (let overlapLen = maxOverlap; overlapLen >= MIN_OVERLAP_WORDS; overlapLen--) {
      let matches = true;
      for (let i = 0; i < overlapLen; i++) {
        const ledgerWord = this.emittedWords[this.emittedWords.length - overlapLen + i];
        const sentenceWord = sentenceWords[i];
        // Case-insensitive comparison for robustness
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

    // No overlap found
    return sentenceWords;
  }

  /**
   * Flush a complete sentence. Uses the Global Word Ledger to strip any
   * overlapping prefix (words already emitted), then appends the new words
   * to the ledger.
   */
  _flushSentence(sentence) {
    const trimmed = sentence.trim();
    if (!trimmed) return;

    // Cancel any pending adaptive timeout
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    // Tokenize and strip overlap with the Global Word Ledger
    const sentenceWords = trimmed.split(/\s+/);
    const newWords = this._stripOverlapWithLedger(sentenceWords);

    // If all words were already emitted, suppress entirely
    if (newWords.length === 0) {
      console.log("StreamBuffer: Fully overlapping sentence suppressed:", trimmed);
      return;
    }

    const dedupedSentence = newWords.join(" ");

    // Append new words to the ledger
    this.emittedWords.push(...newWords);

    // Cap ledger size to prevent unbounded memory growth
    if (this.emittedWords.length > this.MAX_LEDGER_WORDS) {
      this.emittedWords = this.emittedWords.slice(
        this.emittedWords.length - this.MAX_LEDGER_WORDS
      );
    }

    console.log("StreamBuffer: Sentence ready:", dedupedSentence);
    this.onSentenceReady(dedupedSentence);
  }

  /**
   * Heartbeat timer — flushes stale buffer content when no new chunks
   * arrive within HEARTBEAT_MS. Handles edge cases like video pausing
   * mid-sentence or a segment ending without triggering the adaptive timeout.
   */
  _resetHeartbeat() {
    if (this.heartbeatTimer) {
      clearTimeout(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    this.heartbeatTimer = setTimeout(() => {
      if (this.buffer.trim()) {
        console.log("StreamBuffer: Heartbeat flush — draining stale buffer");
        this._flushSentence(this.buffer.trim());
        this.buffer = "";
      }
    }, this.HEARTBEAT_MS);
  }

  /**
   * Reset all state (e.g., when disconnecting).
   */
  reset() {
    this.buffer = "";
    this.wordTimestamps = [];
    this.emittedWords = [];
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
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
  // This callback is invoked when the buffer produces a complete sentence.
  // It mirrors the old handleCapturedTranscript() behavior.
  handleSegmentedSentence(sentence);
});

// ============================================================================
// Chrome Extension Lifecycle
// ============================================================================

// Ensure side panel opens when the extension icon is clicked
chrome.runtime.onInstalled.addListener(() => {
  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
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
    // New: raw word chunks from content.js feed into the StreamBuffer
    streamBuffer.addChunk(message.text);
  } else if (message.action === "TRANSCRIPT_CAPTURED") {
    // Legacy: still accept pre-formed sentences (e.g., from other sources)
    handleSegmentedSentence(message.text);
  }
});

// ============================================================================
// WebSocket Management (unchanged)
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
            // Find existing log entry to attach the verdict/report
            const existingLog = logs.find((l) => l.text === data.text);
            if (existingLog) {
              existingLog.report = data.report;
            } else {
              logs.push({
                timestamp: Date.now(),
                text: data.text,
                report: data.report
              });
            }
            // Cap history to 50 items
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
  // Reset stream buffer on disconnect to clear stale state
  streamBuffer.reset();
  chrome.storage.local.set({ isRunning: false });
}

// ============================================================================
// Sentence Handling (replaces old handleCapturedTranscript)
// ============================================================================

/**
 * Handle a fully segmented sentence — send it to the backend and log it.
 * This is called by the StreamBuffer when it produces a complete sentence,
 * or directly via the legacy TRANSCRIPT_CAPTURED action.
 */
function handleSegmentedSentence(text) {
  if (!text || !text.trim()) return;

  const cleanText = text.trim();

  // NOTE: No minimum word-count filter here. The Global Word Ledger in
  // StreamBuffer may produce short fragments (1-3 words) after stripping
  // overlap, and these are legitimate new content that must not be dropped.
  // The server-side filter in websocket.py handles junk rejection.

  // Send to backend via WebSocket if connected
  if (socket && socket.readyState === WebSocket.OPEN) {
    const payload = JSON.stringify({ sentence: cleanText });
    socket.send(payload);
    console.log("Sent sentence to backend:", cleanText);
  } else {
    console.log("Cannot send sentence: WebSocket is not open.");
  }

  // Record log locally
  chrome.storage.local.get("logs", (data) => {
    const logs = data.logs || [];
    // Only add if not already present
    if (!logs.some((l) => l.text === cleanText)) {
      logs.push({
        timestamp: Date.now(),
        text: cleanText,
        report: null
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
