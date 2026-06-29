console.log("Live Claim Consistency Tracker content script initialized.");

let lastCapturedText = "";
let segmentTimeout = null;

// Observe DOM mutations to scrape live YouTube captions
const observer = new MutationObserver((mutations) => {
  // Select YouTube caption segment container
  const captionSegments = document.querySelectorAll(".ytp-caption-segment");
  if (!captionSegments || captionSegments.length === 0) return;

  // Reconstruct full text currently visible in the caption box
  const fullText = Array.from(captionSegments)
    .map((el) => el.textContent.trim())
    .join(" ")
    .replace(/\s+/g, " ");

  if (!fullText || fullText === lastCapturedText) return;

  // Reset timeout on text change (debounce until speaker pauses or finishes sentence)
  if (segmentTimeout) clearTimeout(segmentTimeout);

  // If sentence ends with punctuation, send it immediately
  if (/[.!?]$/.test(fullText)) {
    sendSentence(fullText);
  } else {
    // Otherwise, wait 2 seconds of silence before sending the segment as a sentence
    segmentTimeout = setTimeout(() => {
      sendSentence(fullText);
    }, 2000);
  }
});

// Start observing target element once it is loaded
function startObserving() {
  const targetNode = document.querySelector(".ytp-caption-window-container") || document.body;
  observer.observe(targetNode, {
    childList: true,
    subtree: true,
    characterData: true
  });
  console.log("Observing caption container:", targetNode);
}

function sendSentence(text) {
  if (!text || text === lastCapturedText) return;
  lastCapturedText = text;

  console.log("Captured statement: " + text);

  // Send to background service worker
  chrome.runtime.sendMessage({
    action: "TRANSCRIPT_CAPTURED",
    text: text
  });
}

// Initialize observer
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startObserving);
} else {
  startObserving();
}
