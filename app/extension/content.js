console.log("Live Claim Consistency Tracker content script initialized.");

/**
 * Word-level YouTube caption stream collector.
 *
 * Instead of trying to detect sentence boundaries, this script:
 *   1. Observes .ytp-caption-segment DOM mutations (debounced 150ms).
 *   2. Flattens all visible caption text into a flat word array.
 *   3. Diffs word-by-word against the previous snapshot.
 *   4. Emits only genuinely *new* words as a CAPTION_CHUNK to background.js.
 *
 * The 150ms debounce prevents capturing mid-render partial words (e.g. "SECURIT"
 * instead of "SECURITY") that YouTube writes character-by-character.
 *
 * Sentence segmentation is handled by the StreamBuffer in background.js.
 */

// --- State ---
let previousWords = [];      // flat word array from last observation
let recentChunks = [];       // rolling dedup window (last N emitted chunks)
const DEDUP_WINDOW = 10;
let debounceTimer = null;    // MutationObserver debounce timer

// --- Core diff algorithm (word-level) ---

/**
 * Find genuinely new words by suffix/prefix overlap between two word arrays.
 *
 * YouTube extends captions in-place — a segment like "THE ECONOMY HAS" becomes
 * "THE ECONOMY HAS BEEN GROWING". Segment-level comparison sees these as
 * completely different strings. Word-level comparison correctly finds the overlap
 * and emits only ["BEEN", "GROWING"].
 *
 * Algorithm: find the longest suffix of `prev` that matches a prefix of `curr`,
 * then return only the words after that overlap.
 *
 * Example:
 *   prev = ["THE", "ECONOMY", "HAS", "BEEN", "GROWING"]
 *   curr = ["BEEN", "GROWING", "AT", "A", "RATE", "OF"]
 *   → overlap: ["BEEN", "GROWING"]
 *   → returns: ["AT", "A", "RATE", "OF"]
 */
function computeNewWords(prev, curr) {
  if (prev.length === 0) {
    return curr;
  }
  if (curr.length === 0) {
    return [];
  }

  // Find the longest suffix of prev matching a prefix of curr
  const maxOverlap = Math.min(prev.length, curr.length);

  for (let overlapLen = maxOverlap; overlapLen >= 1; overlapLen--) {
    let matches = true;
    for (let i = 0; i < overlapLen; i++) {
      if (prev[prev.length - overlapLen + i] !== curr[i]) {
        matches = false;
        break;
      }
    }
    if (matches) {
      return curr.slice(overlapLen);
    }
  }

  // No overlap — YouTube did a full caption window replacement
  return curr;
}

// --- Deduplication ---

/**
 * Check if this chunk text was recently emitted.
 * Returns true if duplicate.
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

// --- Debounced caption processing ---

/**
 * Read the current caption DOM state, diff against previous, and emit new words.
 * Called 150ms after the last MutationObserver event (debounced).
 */
function processCaptions() {
  const captionElements = document.querySelectorAll(".ytp-caption-segment");
  if (!captionElements || captionElements.length === 0) {
    // Caption window cleared — reset so next render is treated as new
    if (previousWords.length > 0) {
      previousWords = [];
    }
    return;
  }

  // Flatten all segments into a single word array
  const fullText = Array.from(captionElements)
    .map((el) => el.textContent.trim())
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  const currentWords = fullText ? fullText.split(" ") : [];

  // Word-level diff
  const newWords = computeNewWords(previousWords, currentWords);
  previousWords = [...currentWords];

  const newText = newWords.join(" ").trim();
  if (!newText) return;

  // Deduplicate
  if (isDuplicate(newText)) {
    return;
  }

  // Emit raw word chunk to background worker
  console.log("Caption chunk:", newText);
  chrome.runtime.sendMessage({
    action: "CAPTION_CHUNK",
    text: newText,
  });
}

// --- DOM Observer (debounced) ---

const observer = new MutationObserver(() => {
  // Debounce: wait 150ms after the last mutation before reading the DOM.
  // YouTube renders words character-by-character; this ensures we capture
  // complete words rather than partial renders like "SECURIT".
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }
  debounceTimer = setTimeout(processCaptions, 150);
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
