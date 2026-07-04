console.log("Live Claim Consistency Tracker content script initialized.");

/**
 * Word-level YouTube caption stream collector — Milestone 10.1
 *
 * Changes from Milestone 9:
 *   - Maintains a `globalWordBuffer` (append-only, no cap) as the canonical
 *     session-level truth of every word ever seen from captions.
 *   - Attaches a `bufferSnapshot` (last 100 words joined as a string) to every
 *     CAPTION_CHUNK message so background.js can cross-reference during
 *     pause-based sentence segmentation.
 *   - Adds `resetBuffer()` hooked to YouTube's `yt-navigate-finish` event to
 *     clear state cleanly on video navigation.
 *   - Removes the redundant `isDuplicate()` / `recentChunks` rolling window —
 *     the Global Word Ledger in background.js is strictly more powerful and
 *     supersedes it entirely.
 *
 * The 150ms debounce prevents capturing mid-render partial words (e.g. "SECURIT"
 * instead of "SECURITY") that YouTube writes character-by-character.
 *
 * Sentence segmentation is handled by the StreamBuffer in background.js.
 */

// --- State ---

/**
 * Append-only session log of every word seen from captions.
 * No cap — this is the canonical truth for the current video session.
 * Attached as a `bufferSnapshot` (last 100 words) on every CAPTION_CHUNK.
 */
let globalWordBuffer = [];

let previousWords = [];   // flat word array from last caption observation
let debounceTimer = null; // MutationObserver debounce timer
let captionObserver = null; // MutationObserver instance (kept for reset)

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

// --- Debounced caption processing ---

/**
 * Read the current caption DOM state, diff against previous, and emit new words.
 * Called 150ms after the last MutationObserver event (debounced).
 *
 * New in Milestone 10.1:
 *   - Appends new words to `globalWordBuffer` (accumulate only; never replace).
 *   - Sends `bufferSnapshot` (last 100 words of globalWordBuffer) alongside the
 *     delta chunk so background.js can confirm pause boundaries.
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

  if (newWords.length === 0) return;

  // 10.1.b — Accumulate into the global word buffer (never replace)
  globalWordBuffer.push(...newWords);

  const newText = newWords.join(" ").trim();
  if (!newText) return;

  // 10.1.c — Build bufferSnapshot from last 100 words of globalWordBuffer
  const bufferSnapshot = globalWordBuffer.slice(-100).join(" ");

  // Emit raw word chunk + snapshot to background worker
  console.log("Caption chunk:", newText);
  chrome.runtime.sendMessage({
    action: "CAPTION_CHUNK",
    text: newText,
    bufferSnapshot,
  });
}

// --- Buffer reset (on video navigation) ---

/**
 * Reset all session state when the user navigates to a new video.
 * Hooked to YouTube's yt-navigate-finish document event.
 */
function resetBuffer() {
  console.log("Content script: resetting globalWordBuffer and previousWords on navigation.");
  globalWordBuffer = [];
  previousWords = [];
}

document.addEventListener("yt-navigate-finish", resetBuffer);

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

captionObserver = observer;

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
