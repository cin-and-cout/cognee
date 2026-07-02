console.log("Live Claim Consistency Tracker content script initialized.");

/**
 * Diff-based YouTube caption stream collector.
 *
 * Instead of trying to detect sentence boundaries (which is unreliable on
 * auto-generated captions), this script acts as a dumb text stream:
 *   1. Observe .ytp-caption-segment DOM mutations.
 *   2. Diff the current segment array against the previous one.
 *   3. Emit only the *new* text as a CAPTION_CHUNK to the background worker.
 *
 * Sentence segmentation is handled entirely by the StreamBuffer in background.js.
 */

// --- State ---
let previousSegments = [];   // text content of each .ytp-caption-segment last observation
let recentChunks = [];       // rolling window for dedup (last N emitted chunks)
const DEDUP_WINDOW = 10;

// --- Core diff algorithm ---

/**
 * Compute text that is genuinely new between two arrays of caption segment strings.
 *
 * YouTube's caption renderer works in one of three modes:
 *   (a) Append: keeps existing segments, adds new ones at the end.
 *   (b) Replace: clears all segments, shows a completely new set.
 *   (c) Correct: modifies an existing segment (auto-caption correction).
 *
 * The algorithm finds the longest suffix of `prev` that matches a prefix of `curr`,
 * then returns only the segments in `curr` after that matched region.
 *
 * Example:
 *   prev = ["the economy has", "been growing"]
 *   curr = ["been growing", "at a rate of"]
 *   → matched suffix/prefix: ["been growing"]
 *   → new segments: ["at a rate of"]
 *   → returns "at a rate of"
 */
function computeNewText(prev, curr) {
  if (prev.length === 0) {
    // First observation — everything is new
    return curr.join(" ");
  }

  if (curr.length === 0) {
    return "";
  }

  // Find the longest suffix of prev that matches a prefix of curr.
  // Start with the longest possible overlap and shrink.
  const maxOverlap = Math.min(prev.length, curr.length);
  let bestOverlap = 0;

  for (let overlapLen = maxOverlap; overlapLen >= 1; overlapLen--) {
    const prevSuffix = prev.slice(prev.length - overlapLen);
    const currPrefix = curr.slice(0, overlapLen);

    let matches = true;
    for (let i = 0; i < overlapLen; i++) {
      if (prevSuffix[i] !== currPrefix[i]) {
        matches = false;
        break;
      }
    }

    if (matches) {
      bestOverlap = overlapLen;
      break;
    }
  }

  if (bestOverlap > 0) {
    // Return only the segments after the overlapping prefix
    const newSegments = curr.slice(bestOverlap);
    return newSegments.join(" ");
  }

  // No overlap found — YouTube did a full caption window replacement.
  // Treat all of curr as new text.
  return curr.join(" ");
}

// --- Deduplication ---

/**
 * Check if this chunk was recently emitted (within the rolling window).
 * Returns true if it's a duplicate.
 */
function isDuplicate(text) {
  const normalized = text.toLowerCase().trim();
  if (recentChunks.includes(normalized)) {
    return true;
  }
  recentChunks.push(normalized);
  if (recentChunks.length > DEDUP_WINDOW) {
    recentChunks.shift();
  }
  return false;
}

// --- DOM Observer ---

const observer = new MutationObserver(() => {
  const captionElements = document.querySelectorAll(".ytp-caption-segment");
  if (!captionElements || captionElements.length === 0) {
    // Caption window was cleared — reset state so the next render is treated as new
    if (previousSegments.length > 0) {
      previousSegments = [];
    }
    return;
  }

  // Snapshot current caption segments
  const currentSegments = Array.from(captionElements)
    .map((el) => el.textContent.trim())
    .filter((t) => t.length > 0);

  // Compute diff
  const newText = computeNewText(previousSegments, currentSegments);
  previousSegments = [...currentSegments];

  // Clean and validate
  const cleaned = newText.replace(/\s+/g, " ").trim();
  if (!cleaned) return;

  // Deduplicate
  if (isDuplicate(cleaned)) {
    return;
  }

  // Emit raw chunk to background worker
  console.log("Caption chunk:", cleaned);
  chrome.runtime.sendMessage({
    action: "CAPTION_CHUNK",
    text: cleaned,
  });
});

// --- Initialization ---

function startObserving() {
  const targetNode =
    document.querySelector(".ytp-caption-window-container") || document.body;
  observer.observe(targetNode, {
    childList: true,
    subtree: true,
    characterData: true,
  });
  console.log("Observing caption container:", targetNode);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startObserving);
} else {
  startObserving();
}
