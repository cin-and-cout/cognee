# Fix: Robust Sentence Extraction v2

## Diagnosis from Live Output

The live feed reveals **three distinct bugs**, all traceable to specific code paths:

### Bug 1: Overlapping/growing fragments
```
"MANAGEMENT METHOD, IT IS OPEN AND"
"MANAGEMENT METHOD, IT IS OPEN AND MARITIME LAWS ARE CLEAR ON"
```
**Root cause**: The diff algorithm in `content.js` compares segments as **whole strings**. YouTube doesn't append new segments — it **extends existing segments in-place** by adding words to the end. When `"IT IS OPEN AND"` becomes `"IT IS OPEN AND MARITIME LAWS ARE CLEAR ON"`, these are different strings, so the segment-level diff sees zero overlap and emits the entire updated segment as "new" text. The StreamBuffer then accumulates both the old partial and the new extended version.

**Fix**: Switch from segment-level to **word-level diffing**. Flatten all segments into a single word array, then find new words by comparing against the previous word array.

---

### Bug 2: Truncated mid-word captures
```
"SECURIT"  (should be "SECURITY")
"PHASE O"  (should be "PHASE OF")
"AN"       (should be "AND")
"EFFORTS AR" (should be "EFFORTS ARE")
```
**Root cause**: The MutationObserver fires on **every DOM mutation**, including mid-render updates where YouTube has written only part of a word. There is no debounce — the observer immediately reads `textContent` while YouTube is still rendering.

**Fix**: Add a **150ms debounce** to the MutationObserver callback. This gives YouTube time to finish rendering the current word/phrase before we snapshot the caption state.

---

### Bug 3: Overlapping sentences in feed
```
"ISSUE WILL MOVE FORWARD."
"ISSUE WILL MOVE FORWARD. TRAFFIC DOES INCREASE IN THE"
```
and single-word fragments:
```
"STRAIT."
"NEGOTIATIONS."
"FACE-TO-FACE."
```
**Root cause**: Two issues compound here:
1. The StreamBuffer receives overlapping text (Bug 1) and its dedup uses exact hash matching — a sentence and that same sentence with more words appended have different hashes.
2. Single-word fragments are logged locally in `handleSegmentedSentence` before the backend's 4-word filter can reject them. The local logging has no minimum length gate.

**Fix**:
- Add **substring/overlap-aware deduplication** in the StreamBuffer: before flushing, check if the new sentence is a prefix of the buffer or if a recently flushed sentence is a prefix of the new one.
- Add **minimum 4-word gate** in `handleSegmentedSentence` to match the backend filter.
- Increase the adaptive timeout minimum to **800ms** — the current 400ms floor is too aggressive for fast-updating captions.

---

## Proposed Changes

### [MODIFY] [content.js](file:///home/krish/Dev/cognee/app/extension/content.js)

1. **Word-level diffing**: Replace `computeNewText(prevSegments, currSegments)` (segment array comparison) with `computeNewWords(prevWords, currWords)` (flat word array comparison). The algorithm:
   - Flatten all `.ytp-caption-segment` text into a single word array: `["OUR", "POSITION", "HAS", "BEEN", ...]`
   - Find the longest prefix of `currWords` that matches a suffix of `prevWords`
   - Emit only the words after the overlap
   - This correctly handles YouTube extending segments in-place

2. **150ms debounce**: Wrap the observer callback in a debounce. Each mutation resets a 150ms timer; only when no mutations arrive for 150ms do we snapshot and diff. This eliminates mid-render captures like `"SECURIT"`.

3. **Track `previousWords`** (flat word array) instead of `previousSegments` (segment string array).

---

### [MODIFY] [background.js](file:///home/krish/Dev/cognee/app/extension/background.js)

1. **Overlap-aware deduplication in StreamBuffer**: Before flushing a sentence, check:
   - Is the new sentence contained within a recently flushed sentence? → suppress
   - Does a recently flushed sentence start with the new sentence? → suppress
   - Does the new sentence start with a recently flushed sentence? → the new one supersedes — allow it but don't re-process the overlapping prefix

2. **Minimum length gate in `handleSegmentedSentence`**: Reject sentences < 4 words before logging locally. Currently these get logged even though the backend would reject them.

3. **Tune adaptive timeout bounds**: Raise `MIN_TIMEOUT` from 400ms → **800ms** and `MAX_TIMEOUT` from 2000ms → **3000ms**. The current 400ms floor causes premature flushes on fast-updating captions where chunks arrive every 200-300ms.

---

### No changes to [websocket.py](file:///home/krish/Dev/cognee/app/api/websocket.py)

The server-side filters are working correctly — the bugs are all upstream in the extension.

---

## Verification Plan

### Manual Verification
1. Same YouTube video that produced the bad output above — verify:
   - No truncated words (no `"SECURIT"`, `"PHASE O"`, etc.)
   - No overlapping growing fragments
   - No single-word sentences in the feed
   - Clean, complete sentences appearing ~every 3-5 seconds
