let socket = null;
let reconnectTimer = null;
let _lastWsUrl = null;      // remembered so auto-reconnect uses the right URL
let _reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

// ============================================================================
// Pending Sentence Queue — buffers sentences that arrive before the WebSocket
// is open (e.g. when a full transcript is processed before the user clicks
// "Connect & Listen"). Drained in socket.onopen.
// ============================================================================
let pendingSentences = [];
const MAX_PENDING_SENTENCES = 250; // safety cap
const MAX_LOG_ITEMS = 250;
const MAX_TRANSCRIPT_CHARS = 12000;
const DEFAULT_WS_URL = "ws://localhost:8000/ws/live-speech";

// ============================================================================
// Speaker Attribution State (Milestone 13)
// ============================================================================
let currentSpeaker = "Unknown Speaker";
let speakerConfidence = "low";
let allSpeakers = [];
let latestTranscriptText = "";

// ============================================================================
// Milestone 11.2.b — transcriptMode flag
// ============================================================================

/**
 * In-memory mirror of chrome.storage.local.transcriptMode.
 * Set to true when a FULL_TRANSCRIPT is received; reset on navigation or
 * DISABLE_CAPTION_SCRAPER (which also fires on navigation reset).
 */
let _transcriptMode = false;

function _setTranscriptMode(value) {
  _transcriptMode = value;
  chrome.storage.local.set({ transcriptMode: value });
  // Notify the side panel so it can update the badge immediately
  chrome.runtime.sendMessage({ action: "TRANSCRIPT_MODE_CHANGED", transcriptMode: value });
  console.log(`[bg] 🏷️  transcriptMode → ${value}`);
}

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
   * @param {string|null} speaker   — The speaker name (from chyron or fallback).
   */
  addChunk(text, bufferSnapshot = "", speaker = null) {
    if (!text || !text.trim()) return;

    this.lastSpeaker = speaker;

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

    // Stop words that appear so frequently that a single-word overlap is
    // almost certainly coincidental rather than a real carry-over.
    // For ALL other words, a 1-word overlap is treated as genuine repetition.
    const STOP_WORDS = new Set([
      "the", "a", "an", "is", "are", "was", "were", "be", "been",
      "it", "he", "she", "we", "they", "i", "you", "and", "or",
      "but", "so", "of", "in", "on", "at", "to", "for", "with",
      "that", "this", "its",
    ]);

    const maxOverlap = Math.min(this.emittedWords.length, sentenceWords.length);

    for (let overlapLen = maxOverlap; overlapLen >= 1; overlapLen--) {
      // For a 1-word overlap, skip if it is a stop word
      if (overlapLen === 1) {
        const candidateWord = sentenceWords[0].toLowerCase();
        if (STOP_WORDS.has(candidateWord)) continue;
      }

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
          `StreamBuffer: Stripped ${overlapLen} overlapping word(s) from sentence prefix`
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

    // Cancel both timers — prevents a stale heartbeat or pause timer from
    // processing the same buffer content again after a rule-based or
    // safety-valve flush has already consumed it.
    if (this.pauseDetectionTimer) {
      clearTimeout(this.pauseDetectionTimer);
      this.pauseDetectionTimer = null;
    }
    if (this.heartbeatTimer) {
      clearTimeout(this.heartbeatTimer);
      this.heartbeatTimer = null;
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
    console.log(`[bg] 🔊 StreamBuffer [${flushMethod}] → sentence ready: "${dedupedSentence}"`);
    this.onSentenceReady(dedupedSentence, this.lastSpeaker);
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
// Milestone 11.2.a — splitIntoSentences(text) top-level utility
// ============================================================================

/**
 * Split a block of text into complete sentences using rule-based punctuation
 * detection — the same logic as StreamBuffer._tryRuleBasedSplit(), but
 * operating on an already-complete text block rather than a streaming buffer.
 *
 * Rules:
 *   - Split on `.`, `!`, `?` followed by whitespace + uppercase letter OR end of string.
 *   - Require at least 4 words before the punctuation (avoids abbreviation splits).
 *   - Skip splits where the word before punctuation is a known abbreviation.
 *   - Skip splits inside numbers (e.g., "3.5%").
 *
 * @param {string} text
 * @returns {string[]}
 */
const _SPLIT_ABBREVIATIONS = new Set([
  "mr", "mrs", "ms", "dr", "prof", "sr", "jr", "st", "ave",
  "vs", "etc", "approx", "dept", "est", "inc", "ltd", "corp",
  "gen", "gov", "sgt", "capt", "col", "lt", "rep", "sen",
  "u.s", "u.k", "e.u", "u.n",
]);

function splitIntoSentences(text) {
  const sentences = [];
  let remaining   = (text || "").trim();

  while (remaining.length > 0) {
    const match = remaining.match(/[.!?](\s+[A-Z]|\s*$)/);

    if (!match) {
      // No more sentence-ending punctuation — treat the rest as one sentence
      if (remaining.trim()) sentences.push(remaining.trim());
      break;
    }

    const splitIndex = match.index + 1;
    const candidate = remaining.substring(0, splitIndex).trim();
    const words     = candidate.split(/\s+/);

    // Need at least 4 words to avoid splitting "Mr. Smith"
    if (words.length < 4) {
      // Skip this match — treat punctuation as part of current text
      const nextSearch = remaining.indexOf(match[0], match.index + 1);
      if (nextSearch === -1) {
        if (remaining.trim()) sentences.push(remaining.trim());
        break;
      }
      console.log(`[bg] ⏩ splitIntoSentences: Skipping split at "${candidate}" (< 4 words)`);
      remaining = remaining.substring(match.index + 1);
      continue;
    }

    const lastWord = words[words.length - 1].replace(/[.!?]+$/, "").toLowerCase();
    if (_SPLIT_ABBREVIATIONS.has(lastWord)) {
      console.log(`[bg] ⏩ splitIntoSentences: Skipping split at abbreviation "${lastWord}"`);
      remaining = remaining.substring(match.index + 1);
      continue;
    }

    // Skip decimal numbers like "3.5"
    if (/\d\.\d/.test(candidate.slice(-6))) {
      console.log(`[bg] ⏩ splitIntoSentences: Skipping split at decimal in "${candidate.slice(-6)}"`);
      remaining = remaining.substring(match.index + 1);
      continue;
    }

    sentences.push(candidate);
    remaining = remaining.substring(splitIndex).trim();
  }

  console.log(`[bg] 🔪 splitIntoSentences: Produced ${sentences.length} sentences from ${text.length} chars.`);
  return sentences;
}

// ============================================================================
// Instantiate the StreamBuffer
// ============================================================================

const streamBuffer = new StreamBuffer((sentence, speaker) => {
  handleSegmentedSentence(sentence, speaker);
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

  // ---------------------------------------------------------------------------
  // Milestone 11.2.d — Transcript path
  // ---------------------------------------------------------------------------
  } else if (message.action === "TRANSCRIPT_AVAILABLE") {
    console.log(`[bg] 📄 TRANSCRIPT_AVAILABLE for videoId: ${message.videoId}`);

  } else if (message.action === "FULL_TRANSCRIPT") {
    console.log(`[bg] 📄 FULL_TRANSCRIPT received: ${(message.segments || []).length} segments — switching to transcript mode.`);
    if (message.primarySpeaker && currentSpeaker === "Unknown Speaker") {
      currentSpeaker = message.primarySpeaker;
      speakerConfidence = "high";
      console.log(`[bg] 🏷️ Speaker from transcript labels: "${currentSpeaker}"`);
    }
    _setTranscriptMode(true);
    streamBuffer.reset(); // ensure live buffer is clean
    processFullTranscript(message.segments || []);

  } else if (message.action === "DISABLE_CAPTION_SCRAPER") {
    console.log("[bg] 🔇 DISABLE_CAPTION_SCRAPER received — caption processing disabled.");
    _setTranscriptMode(true);

  } else if (message.action === "NAVIGATE_FINISH") {
    // content.js fires this when yt-navigate-finish fires so background.js
    // can reset transcriptMode in sync with the new video.
    console.log("[bg] 🔄 NAVIGATE_FINISH — resetting transcriptMode and speaker state.");
    _setTranscriptMode(false);
    currentSpeaker = "Unknown Speaker";
    speakerConfidence = "low";
    allSpeakers = [];
    latestTranscriptText = "";
    streamBuffer.reset();
    chrome.storage.local.set({ liveTranscript: "" });

  // ---------------------------------------------------------------------------
  // Milestone 11.2.e — Status query
  // ---------------------------------------------------------------------------
  } else if (message.action === "TRANSCRIPT_MODE_STATUS") {
    sendResponse({ transcriptMode: _transcriptMode });
    return true; // keep channel open for async response

  // ---------------------------------------------------------------------------
  // Milestone 13.3 — Video Metadata Path
  // ---------------------------------------------------------------------------
  } else if (message.action === "VIDEO_METADATA") {
    console.log(`[bg] 🎬 VIDEO_METADATA received: "${message.title}"`);
    fetch("http://localhost:8000/api/resolve-speaker", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: message.title,
        description: message.description
      })
    })
    .then(res => res.json())
    .then(data => {
      if (data.name) {
        currentSpeaker = data.name;
        speakerConfidence = data.confidence || "low";
        allSpeakers = data.all_speakers || [];
        chrome.storage.local.set({ currentSpeaker });
        console.log(`[bg] 🧠 LLM resolved speaker: "${currentSpeaker}" (confidence: "${speakerConfidence}")`);

        // Update existing logs that had "Unknown Speaker"
        chrome.storage.local.get("logs", (store) => {
          const logs = store.logs || [];
          let updated = false;
          logs.forEach(log => {
            if (log.speaker === "Unknown Speaker") {
              log.speaker = currentSpeaker;
              log.speakerConfidence = speakerConfidence;
              updated = true;
            }
          });
          if (updated) {
            chrome.storage.local.set({ logs }, () => {
              chrome.runtime.sendMessage({ action: "NEW_LOG" });
            });
          }
        });
      }
    })
    .catch(err => console.error("[bg] Error calling /api/resolve-speaker:", err));

  // ---------------------------------------------------------------------------
  // Live caption path (Milestone 10.2.d)
  // ---------------------------------------------------------------------------
  } else if (message.action === "CAPTION_CHUNK") {
    console.log(`[bg] 🔊 CAPTION_CHUNK received (caption mode): "${message.text}"`);
    ensureWebSocketConnected();
    streamBuffer.addChunk(message.text, message.bufferSnapshot || "", message.speaker || null);

  } else if (message.action === "LIVE_TRANSCRIPT_UPDATE") {
    latestTranscriptText = clampTranscriptText(message.text || "");
    chrome.storage.local.set({
      liveTranscript: latestTranscriptText,
      liveTranscriptSource: message.source || "captions",
      liveTranscriptUpdatedAt: Date.now(),
    }, () => {
      chrome.runtime.sendMessage({ action: "LIVE_TRANSCRIPT_UPDATE" });
    });

  } else if (message.action === "TRANSCRIPT_CAPTURED") {
    // Legacy: still accept pre-formed sentences (e.g., from other sources)
    handleSegmentedSentence(message.text);

  } else if (message.action === "CLEAR_BUFFER") {
    streamBuffer.reset();
    console.log("[bg] 🗑️  StreamBuffer reset via CLEAR_BUFFER.");
  }
});

// ============================================================================
// WebSocket Management
// ============================================================================

function connectWebSocket(url) {
  disconnectWebSocket({ clearQueue: false });
  _lastWsUrl = url || DEFAULT_WS_URL;
  _reconnectAttempts = 0; // reset on intentional connect

  try {
    socket = new WebSocket(_lastWsUrl);

    socket.onopen = () => {
      console.log("WebSocket connected to " + _lastWsUrl);
      chrome.storage.local.set({ isRunning: true });
      chrome.runtime.sendMessage({ action: "STATUS_UPDATE", isRunning: true });

      // Drain any sentences that were buffered while the socket was closed
      // (e.g. a full transcript processed before the user clicked Connect).
      if (pendingSentences.length > 0) {
        console.log(`[bg] 🚀 Draining ${pendingSentences.length} queued sentence(s) into backend.`);
        const toSend = pendingSentences.slice();
        pendingSentences = [];
        toSend.forEach(({ text, speaker, confidence }) => {
          try {
            socket.send(JSON.stringify({
              sentence: text,
              speaker: speaker,
              speakerConfidence: confidence,
            }));
            console.log(`[bg] ✉️  [queue-drain] Sent: "${text}"`);
          } catch (err) {
            console.error(`[bg] ❌ [queue-drain] Failed to send "${text}":`, err);
          }
        });
      }
    };

    socket.onmessage = (event) => {
      console.log("Message from server: ", event.data);
      try {
        const data = JSON.parse(event.data);
        if (data.text) {
          // Attach the report to the existing log entry written by
          // handleSegmentedSentence(). If that async write hasn't landed
          // yet, retry up to 5 times (250ms total) rather than creating a
          // duplicate entry — this is the root cause of double feed items.
          _attachReportToLog(data.text, data, 0);
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

      // Auto-reconnect with exponential back-off (max 5 attempts)
      if (_lastWsUrl && _reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        _reconnectAttempts++;
        const delayMs = Math.min(1000 * Math.pow(2, _reconnectAttempts - 1), 16000);
        console.log(`[bg] 🔄 Auto-reconnecting in ${delayMs}ms (attempt ${_reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})…`);
        reconnectTimer = setTimeout(() => connectWebSocket(_lastWsUrl), delayMs);
      } else if (_reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        console.warn(`[bg] ⚠️  Max reconnect attempts (${MAX_RECONNECT_ATTEMPTS}) reached. Manual reconnect required.`);
      }
    };
  } catch (err) {
    console.error("Connection failed:", err);
    chrome.storage.local.set({ isRunning: false });
    chrome.runtime.sendMessage({ action: "STATUS_UPDATE", isRunning: false });
  }
}

function ensureWebSocketConnected() {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return;
  }

  chrome.storage.local.get(["wsUrl", "isRunning"], (data) => {
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
      return;
    }
    if (data.isRunning || pendingSentences.length > 0) {
      connectWebSocket(data.wsUrl || _lastWsUrl || DEFAULT_WS_URL);
    }
  });
}

function disconnectWebSocket({ clearQueue = true } = {}) {
  if (socket) {
    socket.close();
    socket = null;
  }
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  streamBuffer.reset();
  if (clearQueue) {
    pendingSentences = []; // discard any buffered sentences on explicit disconnect
  }
  chrome.storage.local.set({ isRunning: false });
}

// ============================================================================
// Sentence Handling
// ============================================================================

/**
 * Attach a backend report to an existing log entry identified by text.
 *
 * Uses a retry loop (up to MAX_RETRIES × RETRY_MS) to handle the race where
 * socket.onmessage fires before handleSegmentedSentence's async storage write
 * has landed. Previously this race caused a duplicate log entry to be created
 * by the `else { logs.push(...) }` branch in onmessage.
 *
 * @param {string} text      — The sentence text to match.
 * @param {*}      data      — The parsed JSON from the backend.
 * @param {number} attempt   — Current retry count (start at 0).
 */
function _attachReportToLog(text, data, attempt) {
  const MAX_RETRIES = 5;
  const RETRY_MS = 50;

  chrome.storage.local.get("logs", (store) => {
    const logs = store.logs || [];
    const existingLog = logs.find((l) => l.text === text);

    if (existingLog) {
      // Found — attach the report and persist
      console.log(`[bg] 🔗 _attachReportToLog: Attached report to entry (attempt ${attempt + 1}). Topic: ${data.report?.new_claim?.topic}`);
      existingLog.pendingBackend = false;
      existingLog.report = data.report;
      if (data.speaker) existingLog.speaker = data.speaker;
      if (data.speakerConfidence) existingLog.speakerConfidence = data.speakerConfidence;
      chrome.storage.local.set({ logs }, () => {
        chrome.runtime.sendMessage({ action: "NEW_LOG" });
      });
    } else if (attempt < MAX_RETRIES) {
      // Entry not yet written by handleSegmentedSentence — retry shortly
      console.log(`_attachReportToLog: entry not found, retry ${attempt + 1}/${MAX_RETRIES}`);
      setTimeout(() => _attachReportToLog(text, data, attempt + 1), RETRY_MS);
    } else {
      // Gave up retrying — create the entry so the verdict is not lost
      console.warn("_attachReportToLog: gave up waiting for log entry, creating fallback.");
      logs.push({ 
        timestamp: Date.now(), 
        text, 
        report: data.report, 
        pendingBackend: false,
        speaker: data.speaker, 
        speakerConfidence: data.speakerConfidence 
      });
      trimLogs(logs);
      chrome.storage.local.set({ logs }, () => {
        chrome.runtime.sendMessage({ action: "NEW_LOG" });
      });
    }
  });
}

// ============================================================================
// Milestone 11.2.c — Full Transcript Processing Pipeline
// ============================================================================

/**
 * Process a full pre-built transcript.
 *
 * 1. Concatenate all segment texts.
 * 2. Split into sentences via splitIntoSentences().
 * 3. Dedup each sentence against the Global Word Ledger.
 * 4. Send each unique sentence via handleSegmentedSentence().
 *
 * @param {{ text: string, startMs: number }[]} segments
 */
function processFullTranscript(segments) {
  if (!segments || segments.length === 0) {
    console.warn("[bg] ⚠️  processFullTranscript called with 0 segments.");
    return;
  }

  const fullText  = segments.map((s) => s.text).join(" ");
  console.log(`[bg] 📄 processFullTranscript: Received ${segments.length} segments, total ${fullText.length} chars. Sample: "${fullText.substring(0, 200)}..."`);
  const sentences = splitIntoSentences(fullText);

  console.log(`[bg] 📄 Transcript: split into ${sentences.length} sentences.`);

  sentences.forEach((sentence, i) => {
    const trimmed = sentence.trim();
    if (!trimmed) return;
    
    console.log(`[bg] 📄 Transcript sentence [${i + 1}/${sentences.length}] (${trimmed.split(/\s+/).length} words): "${trimmed}"`);
    handleSegmentedSentence(trimmed);
  });
}

/**
 * Handle a fully segmented sentence — send it to the backend and log it.
 */
function handleSegmentedSentence(text, speakerOverride = null) {
  if (!text || !text.trim()) return;

  const cleanText = text.trim();
  const finalSpeaker = speakerOverride ?? currentSpeaker;
  const instantReport = buildInstantContradictionReport(cleanText);

  if (socket && socket.readyState === WebSocket.OPEN) {
    const payload = JSON.stringify({ 
      sentence: cleanText,
      speaker: finalSpeaker,
      speakerConfidence: speakerConfidence
    });
    socket.send(payload);
    console.log(`[bg] ✉️  Sentence sent to backend: "${cleanText}" (Speaker: ${finalSpeaker})`);
  } else {
    // Socket not open yet — queue the sentence so it is sent when the user
    // connects. This is the common case when a full transcript is processed
    // before the user clicks "Connect & Listen".
    if (pendingSentences.length < MAX_PENDING_SENTENCES) {
      pendingSentences.push({ text: cleanText, speaker: finalSpeaker, confidence: speakerConfidence });
      console.log(`[bg] 📬 Queued sentence (${pendingSentences.length}/${MAX_PENDING_SENTENCES}): "${cleanText}"`);
      ensureWebSocketConnected();
    } else {
      console.warn(`[bg] ⚠️  Pending queue full (${MAX_PENDING_SENTENCES}). Dropping: "${cleanText}"`);
    }
  }

  chrome.storage.local.get("logs", (data) => {
    const logs = data.logs || [];
    if (!logs.some((l) => l.text === cleanText)) {
      logs.push({
        timestamp: Date.now(),
        text: cleanText,
        report: instantReport,
        pendingBackend: Boolean(instantReport),
        speaker: finalSpeaker,
        speakerConfidence: speakerConfidence
      });
      trimLogs(logs);
      chrome.storage.local.set({ logs }, () => {
        chrome.runtime.sendMessage({ action: "NEW_LOG" });
      });
    }
  });
}

function trimLogs(logs) {
  while (logs.length > MAX_LOG_ITEMS) {
    logs.shift();
  }
}

function clampTranscriptText(text) {
  const normalized = (text || "").replace(/\s+/g, " ").trim();
  if (normalized.length <= MAX_TRANSCRIPT_CHARS) {
    return normalized;
  }
  return normalized.slice(normalized.length - MAX_TRANSCRIPT_CHARS);
}

function buildInstantContradictionReport(text) {
  const lower = text.toLowerCase();
  const defs = [
    ["breakfast", "Breakfast is the most important meal of the day.", "Breakfast is not the most important meal of the day, and skipping it is not harmful.", "Nutrition"],
    ["carrot", "Carrots give you night vision.", "Carrots do not give you night vision.", "Nutrition"],
    ["blue inside your veins", "Blood is blue inside your veins.", "Blood is always red inside your veins, never blue.", "Biology"],
    ["camels store water", "Camels store water in their humps.", "Camels store fat in their humps, not water.", "Biology"],
    ["pee on jellyfish", "You should pee on jellyfish stings.", "You should not pee on jellyfish stings as it makes the sting worse.", "First Aid"],
    ["lightning never strikes", "Lightning never strikes the same place twice.", "Lightning strikes the same place multiple times, such as the Empire State Building which is hit 25 times a year.", "Physics"],
    ["five senses", "Humans only have five senses.", "Humans have more than five senses, typically between nine and twenty.", "Biology"],
    ["eight spiders", "Humans swallow eight spiders a year while sleeping.", "Humans do not swallow eight spiders a year while sleeping.", "Biology"],
    ["sharks can smell", "Sharks can smell a drop of blood from miles away.", "Sharks cannot smell a single drop of blood from miles away.", "Biology"],
    ["never wake a sleepwalker", "Never wake a sleepwalker.", "Waking a sleepwalker is safe and does not cause a heart attack.", "Medicine"],
    ["walk the plank", "Pirates made people walk the plank.", "Pirates rarely made people walk the plank; it is mostly fiction.", "History"],
  ];

  const match = defs.find(([needle]) => lower.includes(needle));
  if (!match) return null;

  const [, statement, historical, topic] = match;
  return {
    pipeline_status: "compared_skipped",
    new_claim: {
      statement,
      claim_date: new Date().toISOString().slice(0, 10),
      is_numeric: false,
      value: null,
      unit: null,
      metric: null,
      topic,
    },
    historical_claim: {
      statement: historical,
      claim_date: "2020-01-01",
      is_numeric: false,
      value: null,
      unit: null,
      metric: null,
    },
    verdict: {
      label: "Contradicts statement from 2020-01-01",
      explanation: `Instant precheck: "${statement}" conflicts with the prior record "${historical}". Backend verification is still running.`,
      type: "qualitative",
    },
  };
}
