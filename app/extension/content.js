console.log(
  "[content.js] Live Claim Consistency Tracker content script initialized.",
);

/**
 * Word-level YouTube caption stream collector — Milestone 10.1 / 11.1
 *
 * Milestone 11.1 additions:
 *   - `probeForTranscript()` — on page load and yt-navigate-finish, tries to
 *     find YouTube's "Show transcript" button (via the overflow `...` menu,
 *     Option A), scrape all segments, and send them as FULL_TRANSCRIPT to
 *     background.js. Falls back to live captions if no transcript is found.
 *   - `clickTranscriptAndScrape()` — clicks the button, waits for segment
 *     elements via MutationObserver, collects { text, startMs }.
 *   - `transcriptMode` flag — when true, the caption MutationObserver is
 *     disconnected and processCaptions() is a no-op.
 *   - Structured debug prints on every code path so caption vs. transcript
 *     mode is immediately visible in the browser console.
 *
 * Milestone 10.1 (unchanged):
 *   - Maintains `globalWordBuffer` (append-only) as the canonical session log.
 *   - Attaches `bufferSnapshot` (last 100 words) to every CAPTION_CHUNK.
 *   - `resetBuffer()` hooked to `yt-navigate-finish`.
 *
 * The 150ms debounce prevents capturing mid-render partial words.
 */

// =============================================================================
// State
// =============================================================================

/**
 * Append-only session log of every word seen from captions.
 * No cap — canonical truth for the current video session.
 */
let globalWordBuffer = [];

let previousWords = []; // flat word array from last caption observation
let debounceTimer = null; // MutationObserver debounce timer
let captionObserver = null; // MutationObserver instance (kept for reset)

/**
 * true once a human-authored transcript has been found and scraped.
 * When true, processCaptions() is a no-op and the caption observer is
 * disconnected so no CAPTION_CHUNK messages are emitted in parallel.
 */
let transcriptMode = false;
let liveTranscriptWords = [];

// Video playback tracking state for real-time transcript processing
let transcriptSegments = [];
let nextSegmentIndex = 0;
let playbackIntervalId = null;

// =============================================================================
// Core diff algorithm (word-level) — unchanged from Milestone 10.1
// =============================================================================

/**
 * Find genuinely new words by suffix/prefix overlap between two word arrays.
 *
 * YouTube extends captions in-place — a segment like "THE ECONOMY HAS" becomes
 * "THE ECONOMY HAS BEEN GROWING". Word-level comparison finds the overlap and
 * emits only ["BEEN", "GROWING"].
 *
 * Algorithm: find the longest suffix of `prev` that matches a prefix of `curr`,
 * then return only the words after that overlap.
 */
function computeNewWords(prev, curr) {
  if (prev.length === 0) return curr;
  if (curr.length === 0) return [];

  const maxOverlap = Math.min(prev.length, curr.length);

  for (let overlapLen = maxOverlap; overlapLen >= 1; overlapLen--) {
    let matches = true;
    for (let i = 0; i < overlapLen; i++) {
      if (prev[prev.length - overlapLen + i] !== curr[i]) {
        matches = false;
        break;
      }
    }
    if (matches) return curr.slice(overlapLen);
  }

  // No overlap — YouTube did a full caption window replacement
  return curr;
}

// =============================================================================
// Debounced caption processing (Milestone 10.1 / 11.1 guard)
// =============================================================================

/**
 * Read the current caption DOM state, diff against previous, and emit new words.
 * Called 150ms after the last MutationObserver event (debounced).
 *
 * 11.1: If `transcriptMode` is true this function is a no-op — the transcript
 * has already been sent to background.js and the observer is being disconnected.
 */
function processCaptions() {
  // 11.1 — do nothing if the transcript path has taken over
  if (transcriptMode) return;

  const captionElements = document.querySelectorAll(".ytp-caption-segment");
  if (!captionElements || captionElements.length === 0) {
    if (previousWords.length > 0) previousWords = [];
    return;
  }

  const fullText = Array.from(captionElements)
    .map((el) => el.textContent.trim())
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  const currentWords = fullText ? fullText.split(" ") : [];
  const newWords = computeNewWords(previousWords, currentWords);
  previousWords = [...currentWords];

  if (newWords.length === 0) return;

  // 10.1.b — accumulate into the global word buffer
  globalWordBuffer.push(...newWords);

  const newText = newWords.join(" ").trim();
  if (!newText) return;

  liveTranscriptWords.push(...newWords);
  emitLiveTranscriptUpdate();

  // 10.1.c — build bufferSnapshot from last 100 words
  const bufferSnapshot = globalWordBuffer.slice(-100).join(" ");

  console.log(`[content.js] 🔊 Caption chunk: "${newText}"`);
  chrome.runtime.sendMessage({
    action: "CAPTION_CHUNK",
    text: newText,
    bufferSnapshot,
  });
}

function emitLiveTranscriptUpdate(forceText = null, sourceOverride = null) {
  const text = forceText ?? liveTranscriptWords.slice(-180).join(" ");
  if (!text || !text.trim()) return;
  chrome.runtime.sendMessage({
    action: "LIVE_TRANSCRIPT_UPDATE",
    text: text.trim(),
    source: sourceOverride || (transcriptMode ? "transcript" : "captions"),
  });
}

// =============================================================================
// Transcript Playback Tracking (Real-time Streaming)
// =============================================================================

let sentSegmentIndexes = new Set();
let videoElement = null;

function setupTranscriptPlayback(segments) {
  transcriptSegments = segments;
  sentSegmentIndexes.clear();

  videoElement = document.querySelector('video');
  if (!videoElement) {
    console.warn("[content.js] ⚠️ Video element not found, retrying setup in 1s.");
    setTimeout(() => setupTranscriptPlayback(segments), 1000);
    return;
  }

  videoElement.removeEventListener("timeupdate", onVideoTimeUpdate);
  videoElement.removeEventListener("seeked", onVideoSeeked);

  videoElement.addEventListener("timeupdate", onVideoTimeUpdate);
  videoElement.addEventListener("seeked", onVideoSeeked);

  console.log("[content.js] 🎬 Transcript playback tracking initialized for video:", videoElement);

  // Run once immediately to capture any segment at the current start time
  onVideoTimeUpdate();
}

function onVideoTimeUpdate() {
  if (!videoElement || transcriptSegments.length === 0) return;

  const currentMs = videoElement.currentTime * 1000;

  // Process segments that have been reached by playback
  for (let i = 0; i < transcriptSegments.length; i++) {
    const seg = transcriptSegments[i];
    if (currentMs >= seg.startMs && !sentSegmentIndexes.has(i)) {
      // Check if it's the active segment (starts before currentMs, and next starts after currentMs)
      const isLast = (i === transcriptSegments.length - 1);
      const nextSeg = isLast ? null : transcriptSegments[i + 1];
      const isActive = isLast ? (currentMs >= seg.startMs) : (currentMs >= seg.startMs && currentMs < nextSeg.startMs);

      // Or if it's within a 3s window of playback start (to catch segments if timeupdate was delayed)
      const isWithinWindow = (currentMs - 3000 <= seg.startMs && seg.startMs <= currentMs);

      if (isActive || isWithinWindow) {
        sendTranscriptSegment(seg, i);
      }
    }
  }
}

function onVideoSeeked() {
  if (!videoElement || transcriptSegments.length === 0) return;

  const currentMs = videoElement.currentTime * 1000;
  console.log(`[content.js] 🔍 Video seeked to ${videoElement.currentTime}s (${currentMs}ms). Updating sent segment marks.`);

  // Reset StreamBuffer in background on seek to prevent word blending
  chrome.runtime.sendMessage({ action: "CLEAR_BUFFER" });

  // Mark all past segments as sent, and future segments as unsent
  for (let i = 0; i < transcriptSegments.length; i++) {
    const seg = transcriptSegments[i];
    if (seg.startMs < currentMs) {
      sentSegmentIndexes.add(i);
    } else {
      sentSegmentIndexes.delete(i);
    }
  }
}

function sendTranscriptSegment(seg, index) {
  sentSegmentIndexes.add(index);
  console.log(`[content.js] 🔊 Sending transcript segment [${index}]: "${seg.text}" at ${seg.startMs}ms`);

  const newWords = seg.text ? seg.text.split(/\s+/) : [];
  globalWordBuffer.push(...newWords);
  const bufferSnapshot = globalWordBuffer.slice(-100).join(" ");

  chrome.runtime.sendMessage({
    action: "CAPTION_CHUNK",
    text: seg.text,
    bufferSnapshot,
    speaker: seg.speaker,
  });
}

// =============================================================================
// Buffer / session reset (on video navigation)
// =============================================================================

/**
 * Reset all session state when the user navigates to a new video.
 * Hooked to YouTube's yt-navigate-finish document event.
 */
function resetBuffer() {
  console.log("[content.js] 🔄 Navigation detected — resetting session state.");
  globalWordBuffer = [];
  liveTranscriptWords = [];
  previousWords = [];
  transcriptMode = false;

  // Reset playback tracking
  sentSegmentIndexes.clear();
  transcriptSegments = [];
  if (videoElement) {
    videoElement.removeEventListener("timeupdate", onVideoTimeUpdate);
    videoElement.removeEventListener("seeked", onVideoSeeked);
    videoElement = null;
  }

  // Inform background.js so it can reset transcriptMode flag
  chrome.runtime.sendMessage({ action: "NAVIGATE_FINISH" });
  // Re-arm the transcript probe for the new video (with delay for DOM hydration)
  setTimeout(() => probeForTranscript(1), 2000);

  // Scrape video metadata for speaker attribution
  setTimeout(() => scrapeVideoMetadata(), 2000);
}

document.addEventListener("yt-navigate-finish", resetBuffer);

// =============================================================================
// Milestone 13.3 — Video Metadata Scraper (LLM Speaker Resolution)
// =============================================================================

function scrapeVideoMetadata() {
  const videoId = new URLSearchParams(window.location.search).get("v") || "";
  if (!videoId) return;

  const titleEl =
    document.querySelector("h1.ytd-watch-metadata yt-formatted-string") ||
    document.querySelector("title");
  const title = titleEl ? titleEl.textContent.trim() : "";

  // The description might be in #description yt-attributed-string or similar
  const descEl =
    document.querySelector("#description yt-attributed-string") ||
    document.querySelector("#description ytd-expander");
  const description = descEl ? descEl.textContent.trim().substring(0, 500) : "";

  console.log(`[content.js] 🎬 Scraped video metadata. Title: "${title}"`);
  chrome.runtime.sendMessage({
    action: "VIDEO_METADATA",
    title,
    description,
    videoId,
  });
}

// Initial scrape on page load
setTimeout(() => scrapeVideoMetadata(), 2000);

// =============================================================================
// Milestone 11.1 — Transcript Detection & Scraping
// =============================================================================

/**
 * Parse a YouTube transcript timestamp string ("M:SS" or "H:MM:SS") into
 * milliseconds.
 *
 * @param {string} ts — e.g. "1:23" or "1:02:45"
 * @returns {number} milliseconds
 */
function parseTimestampMs(ts) {
  if (!ts) return 0;
  const parts = ts.trim().split(":").map(Number);
  if (parts.length === 2) {
    // M:SS
    return (parts[0] * 60 + parts[1]) * 1000;
  }
  if (parts.length === 3) {
    // H:MM:SS
    return (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
  }
  return 0;
}

/**
 * Wait for at least one `ytd-transcript-segment-renderer` element to appear
 * inside `container`, up to `timeoutMs`. Uses a MutationObserver so it does
 * not busy-poll.
 *
 * @param {Element} container
 * @param {number}  timeoutMs
 * @returns {Promise<boolean>} — true if segments appeared, false on timeout
 */
function waitForTranscriptSegments(container, timeoutMs = 3000) {
  return new Promise((resolve) => {
    // Already present?
    if (container.querySelector("ytd-transcript-segment-renderer")) {
      return resolve(true);
    }

    let settled = false;
    const obs = new MutationObserver(() => {
      if (container.querySelector("ytd-transcript-segment-renderer")) {
        if (!settled) {
          settled = true;
          obs.disconnect();
          resolve(true);
        }
      }
    });

    obs.observe(container, { childList: true, subtree: true });

    setTimeout(() => {
      if (!settled) {
        settled = true;
        obs.disconnect();
        resolve(false);
      }
    }, timeoutMs);
  });
}

function scrapeTranscriptSegments() {
  const segmentEls = document.querySelectorAll(
    "ytd-transcript-segment-renderer",
  );
  const segments = [];
  let emptyCount = 0;

  // Regex to match speaker labels like "[Speaker Name]:" or "Speaker Name:"
  const speakerRegex =
    /^\[?([A-Z][a-z]+(?: [A-Z][a-z]+)+|[A-Z]+(?: [A-Z]+)+)\]?:\s*/;

  segmentEls.forEach((el) => {
    const textEl = el.querySelector(".segment-text");
    const timestampEl = el.querySelector(".segment-timestamp");

    let text = textEl ? textEl.textContent.trim() : "";
    const startMs = timestampEl ? parseTimestampMs(timestampEl.textContent) : 0;

    let speaker = null;

    if (text) {
      const match = text.match(speakerRegex);
      if (match) {
        speaker = match[1];
        text = text.replace(speakerRegex, "").trim();
      }
      segments.push({ text, startMs, speaker });
    } else {
      emptyCount++;
    }
  });

  console.log(
    `[content.js] 📊 Scraped ${segmentEls.length} segments. ${emptyCount} empty texts discarded.`,
  );
  if (segments.length > 0) {
    const totalChars = segments.reduce((sum, s) => sum + s.text.length, 0);
    console.log(`[content.js] 📊 Total scraped characters: ${totalChars}`);
    console.log(
      `[content.js] 📊 First 3:`,
      segments.slice(0, 3).map((s) => s.text),
    );
    console.log(
      `[content.js] 📊 Last 3:`,
      segments.slice(-3).map((s) => s.text),
    );
  }

  return segments;
}

/**
 * Click the "Show transcript" button (now known to be visible in the DOM),
 * wait for segment elements, scrape them, and return the array.
 *
 * @param {Element} transcriptBtn
 * @returns {Promise<{ text: string, startMs: number }[]>}
 */
async function clickTranscriptAndScrape(transcriptBtn) {
  console.log("[content.js] 🖱️  Clicking 'Show transcript'…");
  transcriptBtn.click();

  // YouTube renders the panel inside ytd-engagement-panel-section-list-renderer
  // or directly in document body — observe the whole document for safety.
  const appeared = await waitForTranscriptSegments(document.body, 3000);

  if (!appeared) {
    console.warn(
      "[content.js] ⚠️  Transcript segments did not appear within 3 s.",
    );
    return [];
  }

  const segments = scrapeTranscriptSegments();
  console.log(
    `[content.js] 📄 Scraped ${segments.length} transcript segments.`,
  );
  return segments;
}

/**
 * Attempt to find the "Show transcript" button using Option A:
 *  1. Check for a directly-visible button with aria-label "Show transcript".
 *  2. If not found, click the overflow `...` / "More" button to expand the
 *     secondary menu, wait 500 ms for the menu to open, then re-probe once.
 *
 * @returns {Promise<Element|null>} — the button element, or null if not found
 */
async function findTranscriptButton() {
  // Direct probe first (handles videos where the button is already visible)
  const direct =
    document.querySelector('[aria-label="Show transcript"]') ||
    findButtonByText("show transcript");
  if (direct) return direct;

  // Option A — try the overflow `...` / "More" button
  // YouTube places it in ytd-menu-renderer on the watch page
  const overflowBtn = document.querySelector(
    "ytd-menu-renderer button.yt-icon-button, " +
      "#top-level-buttons-computed ytd-button-renderer:last-child button, " +
      "[aria-label='More actions']",
  );

  if (!overflowBtn) return null;

  console.log(
    "[content.js] 🔍 Opening overflow menu to look for 'Show transcript'…",
  );
  overflowBtn.click();

  // Wait for the menu to render
  await new Promise((r) => setTimeout(r, 500));

  // Re-probe — YouTube's popup menu items use ytd-menu-service-item-renderer
  const menuItems = document.querySelectorAll(
    "ytd-menu-service-item-renderer, tp-yt-paper-item",
  );
  for (const item of menuItems) {
    if (
      item.textContent &&
      item.textContent.trim().toLowerCase().includes("show transcript")
    ) {
      return item;
    }
  }

  // Also check aria-label in the newly opened menu
  return document.querySelector('[aria-label="Show transcript"]');
}

function findButtonByText(needle) {
  const target = needle.toLowerCase();
  const candidates = document.querySelectorAll(
    "button, ytd-button-renderer, ytd-menu-service-item-renderer, tp-yt-paper-item",
  );
  for (const candidate of candidates) {
    const text = (candidate.textContent || candidate.getAttribute("aria-label") || "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
    if (text.includes(target)) {
      return candidate;
    }
  }
  return null;
}

/**
 * Main transcript probe — called on page load and after every navigation.
 *
 * Strategy:
 *   1. Try to find the transcript button (with overflow menu fallback).
 *   2. If found: scrape, send FULL_TRANSCRIPT, disable caption observer.
 *   3. If not found after `maxAttempts` tries: fall back to live captions.
 *
 * @param {number} attempt    — current attempt (1-indexed, max 3)
 * @param {number} maxAttempts — total allowed attempts (default 3)
 */
async function probeForTranscript(attempt = 1, maxAttempts = 3) {
  console.log(
    `[content.js] 🔍 Probing for transcript button (attempt ${attempt}/${maxAttempts})…`,
  );

  const btn = await findTranscriptButton();

  if (btn) {
    console.log("[content.js] ✅ Transcript button found — scraping…");

    // 11.1.b — notify background that a transcript is available
    const videoId = new URLSearchParams(window.location.search).get("v") || "";
    chrome.runtime.sendMessage({ action: "TRANSCRIPT_AVAILABLE", videoId });

    // 11.1.c — click & scrape
    const segments = await clickTranscriptAndScrape(btn);

    if (segments.length === 0) {
      console.warn(
        "[content.js] ⚠️  Scrape returned 0 segments — falling back to captions.",
      );
      return; // caption observer stays connected
    }

    // 13.1.c — derive primarySpeaker
    let primarySpeaker = null;
    for (const seg of segments) {
      if (seg.speaker) {
        primarySpeaker = seg.speaker;
        break;
      }
    }

    // Initialize real-time playback tracking for the transcript segments
    setupTranscriptPlayback(segments);

    // 11.1.d — send full transcript to background (background will just switch mode, not process bulk)
    console.log(
      `[content.js] 📄 FULL_TRANSCRIPT sent: ${segments.length} segments.`,
    );
    emitLiveTranscriptUpdate(segments.map((s) => s.text).join(" "), "transcript");
    chrome.runtime.sendMessage({
      action: "FULL_TRANSCRIPT",
      segments,
      videoId,
      primarySpeaker,
    });

    // 11.1.e — disable caption observer to prevent parallel processing
    transcriptMode = true;
    if (captionObserver) {
      captionObserver.disconnect();
      console.log(
        "[content.js] 🔇 Caption observer disconnected (transcript mode active).",
      );
    }
    chrome.runtime.sendMessage({ action: "DISABLE_CAPTION_SCRAPER" });
  } else if (attempt < maxAttempts) {
    // Retry after 1 second (handles late DOM rendering)
    console.log(
      `[content.js] ⏳ Transcript button not found yet — retrying in 1 s…`,
    );
    setTimeout(() => probeForTranscript(attempt + 1, maxAttempts), 1000);
  } else {
    // All attempts exhausted — use live captions
    console.log(
      `[content.js] ❌ No transcript button found after ${maxAttempts} attempts — using live captions.`,
    );
  }
}

// =============================================================================
// DOM Observer (debounced) — unchanged from Milestone 10.1
// =============================================================================

const observer = new MutationObserver(() => {
  // Debounce: wait 150ms after the last mutation before reading the DOM.
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(processCaptions, 150);
});

captionObserver = observer;

// =============================================================================
// Initialization
// =============================================================================

function startObserving() {
  const targetNode =
    document.querySelector(".ytp-caption-window-container") || document.body;
  observer.observe(targetNode, {
    childList: true,
    subtree: true,
    characterData: true,
  });
  console.log(
    "[content.js] 👁️  Observing caption container:",
    targetNode.nodeName,
  );

  // 11.1.a — probe for transcript on page load (with slight delay so the
  // watch page buttons have time to hydrate)
  setTimeout(() => probeForTranscript(1), 2000);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startObserving);
} else {
  startObserving();
}
