/**
 * test_global_word_buffer.js
 *
 * Unit test for Milestone 10.1: globalWordBuffer accumulation logic from content.js.
 *
 * This script is self-contained (no framework, no DOM). It re-implements the
 * key functions from content.js in isolation and verifies:
 *
 *   1. `computeNewWords()` correctly strips caption window overlap.
 *   2. `globalWordBuffer` grows monotonically (append-only).
 *   3. Zero duplicates appear in the buffer across multiple caption window
 *      transitions (the scenario that was broken before Milestone 9/10).
 *   4. `bufferSnapshot` is the last 100 words (or fewer) of the buffer,
 *      joined as a space-delimited string.
 *   5. `resetBuffer()` clears both `globalWordBuffer` and `previousWords`.
 *
 * Run with:
 *   node tests/extension/__tests__/test_global_word_buffer.js
 */

// ============================================================================
// Inline implementation of content.js logic under test
// ============================================================================

let globalWordBuffer = [];
let previousWords = [];

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
  return curr;
}

function processCaptionMutation(captionText) {
  const currentWords = captionText.trim() ? captionText.trim().split(" ") : [];
  const newWords = computeNewWords(previousWords, currentWords);
  previousWords = [...currentWords];

  if (newWords.length === 0) return null;

  globalWordBuffer.push(...newWords);

  const newText = newWords.join(" ");
  const bufferSnapshot = globalWordBuffer.slice(-100).join(" ");

  return { text: newText, bufferSnapshot };
}

function resetBuffer() {
  globalWordBuffer = [];
  previousWords = [];
}

// ============================================================================
// Test harness
// ============================================================================

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ✅  PASS: ${label}`);
    passed++;
  } else {
    console.error(`  ❌  FAIL: ${label}`);
    failed++;
  }
}

function assertEqual(actual, expected, label) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    console.log(`  ✅  PASS: ${label}`);
    passed++;
  } else {
    console.error(`  ❌  FAIL: ${label}`);
    console.error(`         expected: ${JSON.stringify(expected)}`);
    console.error(`         actual:   ${JSON.stringify(actual)}`);
    failed++;
  }
}

// ============================================================================
// Test Suite
// ============================================================================

console.log("\n=== Milestone 10.1 — globalWordBuffer unit tests ===\n");

// ---------------------------------------------------------------------------
// Test 1: computeNewWords — basic extension case
// ---------------------------------------------------------------------------
console.log("Test 1: computeNewWords — caption window extension");
{
  const prev = ["THE", "ECONOMY", "HAS", "BEEN", "GROWING"];
  const curr = ["BEEN", "GROWING", "AT", "A", "RATE", "OF"];
  assertEqual(computeNewWords(prev, curr), ["AT", "A", "RATE", "OF"],
    "suffix overlap strips already-seen words");
}

// ---------------------------------------------------------------------------
// Test 2: computeNewWords — full caption window replacement (no overlap)
// ---------------------------------------------------------------------------
console.log("\nTest 2: computeNewWords — full caption window replacement");
{
  const prev = ["HELLO", "WORLD"];
  const curr = ["COMPLETELY", "NEW", "WORDS"];
  assertEqual(computeNewWords(prev, curr), ["COMPLETELY", "NEW", "WORDS"],
    "no overlap returns full curr array");
}

// ---------------------------------------------------------------------------
// Test 3: computeNewWords — empty previous (first chunk)
// ---------------------------------------------------------------------------
console.log("\nTest 3: computeNewWords — empty previous (first chunk)");
{
  const prev = [];
  const curr = ["WELCOME", "TO", "THE", "SHOW"];
  assertEqual(computeNewWords(prev, curr), ["WELCOME", "TO", "THE", "SHOW"],
    "empty prev returns all of curr");
}

// ---------------------------------------------------------------------------
// Test 4: globalWordBuffer grows monotonically across window transitions
// ---------------------------------------------------------------------------
console.log("\nTest 4: globalWordBuffer grows monotonically");
resetBuffer();
{
  // Simulate 3 caption windows:
  // Window 1: "THE ECONOMY HAS"
  // Window 2: "HAS BEEN GROWING AT" (extension — overlaps "HAS")
  // Window 3: "QUICKLY" (replacement)

  processCaptionMutation("THE ECONOMY HAS");
  assertEqual(globalWordBuffer, ["THE", "ECONOMY", "HAS"],
    "after window 1: buffer = [THE, ECONOMY, HAS]");

  processCaptionMutation("HAS BEEN GROWING AT");
  assertEqual(globalWordBuffer, ["THE", "ECONOMY", "HAS", "BEEN", "GROWING", "AT"],
    "after window 2: new words [BEEN, GROWING, AT] appended");

  processCaptionMutation("QUICKLY");
  assertEqual(globalWordBuffer, ["THE", "ECONOMY", "HAS", "BEEN", "GROWING", "AT", "QUICKLY"],
    "after window 3: [QUICKLY] appended without duplication");
}

// ---------------------------------------------------------------------------
// Test 5: caption window overlap stripping prevents cross-window re-emission
// ---------------------------------------------------------------------------
console.log("\nTest 5: caption window overlap stripping — no cross-window re-emission");
resetBuffer();
{
  // Each caption extends the previous one in-place (YouTube's normal behaviour).
  // The word at the junction ("SAID", "ECONOMY", "GROWING", "PERCENT") must
  // appear exactly once in globalWordBuffer — it must NOT be re-emitted by the
  // next window mutation.
  const captions = [
    "THE PRESIDENT SAID",         // emits: THE PRESIDENT SAID
    "PRESIDENT SAID THAT",        // emits: THAT           (overlap: PRESIDENT SAID)
    "SAID THAT THE ECONOMY",      // emits: THE ECONOMY    (overlap: SAID THAT)
    "THAT THE ECONOMY IS GROWING",// emits: IS GROWING     (overlap: THAT THE ECONOMY)
    "ECONOMY IS GROWING AT THREE",// emits: AT THREE       (overlap: ECONOMY IS GROWING)
  ];

  const emittedPerChunk = [];
  captions.forEach((c) => {
    const result = processCaptionMutation(c);
    if (result) emittedPerChunk.push(result.text.split(" "));
  });

  // Words at the overlap boundaries should appear in exactly one chunk
  const junctionWords = ["SAID", "ECONOMY", "GROWING"];
  let overlapFree = true;
  for (const jw of junctionWords) {
    const chunksContaining = emittedPerChunk.filter((chunk) => chunk.includes(jw));
    if (chunksContaining.length > 1) {
      overlapFree = false;
      console.error(`     Junction word "${jw}" was emitted by ${chunksContaining.length} chunks (expected 1)`);
    }
  }
  assert(overlapFree,
    "junction words at caption window boundaries are emitted exactly once");

  // The full buffer must contain all content words (none should be skipped)
  const flatBuffer = globalWordBuffer.join(" ");
  assert(flatBuffer.includes("PRESIDENT"), "buffer contains PRESIDENT");
  assert(flatBuffer.includes("ECONOMY"), "buffer contains ECONOMY");
  assert(flatBuffer.includes("THREE"), "buffer contains THREE");
}

// ---------------------------------------------------------------------------
// Test 6: bufferSnapshot is the last ≤100 words joined as a string
// ---------------------------------------------------------------------------
console.log("\nTest 6: bufferSnapshot content");
resetBuffer();
{
  // Add 50 words
  const words50 = Array.from({ length: 50 }, (_, i) => `WORD${i}`).join(" ");
  const result1 = processCaptionMutation(words50);
  assert(
    result1.bufferSnapshot === globalWordBuffer.slice(-100).join(" "),
    "snapshot equals last 100 words joined for 50-word buffer"
  );

  // Add 60 more words (total 110) — snapshot should cap at last 100
  const words60 = Array.from({ length: 60 }, (_, i) => `EXTRA${i}`).join(" ");
  const result2 = processCaptionMutation(words60);
  const snapshotWords = result2.bufferSnapshot.split(" ");
  assert(
    snapshotWords.length === 100,
    "snapshot is exactly 100 words when buffer exceeds 100"
  );
  assert(
    result2.bufferSnapshot === globalWordBuffer.slice(-100).join(" "),
    "snapshot equals last 100 words of globalWordBuffer"
  );
}

// ---------------------------------------------------------------------------
// Test 7: resetBuffer clears both globalWordBuffer and previousWords
// ---------------------------------------------------------------------------
console.log("\nTest 7: resetBuffer()");
{
  processCaptionMutation("SOME WORDS HERE");
  assert(globalWordBuffer.length > 0, "buffer has words before reset");
  resetBuffer();
  assertEqual(globalWordBuffer, [], "globalWordBuffer is empty after reset");
  assertEqual(previousWords, [], "previousWords is empty after reset");

  // After reset, next caption should be treated as entirely new
  const result = processCaptionMutation("FRESH START");
  assertEqual(result.text, "FRESH START",
    "first chunk after reset emits all words (no overlap with cleared previousWords)");
}

// ---------------------------------------------------------------------------
// Test 8: same text in consecutive mutations emits nothing (idempotent)
// ---------------------------------------------------------------------------
console.log("\nTest 8: identical consecutive mutations emit no words");
resetBuffer();
{
  processCaptionMutation("HELLO WORLD");
  const result = processCaptionMutation("HELLO WORLD"); // same text, no new words
  assert(result === null, "identical consecutive mutation returns null (no new words)");
  assertEqual(globalWordBuffer, ["HELLO", "WORLD"],
    "globalWordBuffer unchanged on identical mutation");
}

// ============================================================================
// Results
// ============================================================================

console.log(`\n${"=".repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
} else {
  console.log("All tests passed! ✅");
}
