document.addEventListener("DOMContentLoaded", () => {
  const wsUrlInput        = document.getElementById("ws-url");
  const statusBadge       = document.getElementById("status-badge");
  const toggleBtn         = document.getElementById("toggle-btn");
  const clearBtn          = document.getElementById("clear-btn");
  const feedList          = document.getElementById("feed-list");
  const statsBar          = document.getElementById("stats-bar");
  const snackbar          = document.getElementById("snackbar");
  const snackbarUndo      = document.getElementById("snackbar-undo");
  const transcriptBadge   = document.getElementById("transcript-mode-badge");

  // In-memory snapshot used by the Undo action (task 12.1.d)
  let _preClearSnapshot = null;
  let _snackbarTimeout  = null;

  // ============================================================================
  // Initialise
  // ============================================================================

  chrome.storage.local.get(["wsUrl", "isRunning", "logs"], (data) => {
    if (data.wsUrl) wsUrlInput.value = data.wsUrl;
    renderFeed(data.logs || []);
    // Query active state from background on load
    chrome.runtime.sendMessage({ action: "GET_CONNECTION_STATE" }, (resp) => {
      const state = (resp && resp.state) || (data.isRunning ? "connected" : "disconnected");
      updateUI(state);
    });
  });

  // 11.2.e — Query transcript mode status on load
  chrome.runtime.sendMessage({ action: "TRANSCRIPT_MODE_STATUS" }, (resp) => {
    if (resp && resp.transcriptMode) {
      setTranscriptBadge(true);
    }
  });

  // ============================================================================
  // Connect / Disconnect toggle
  // ============================================================================

  toggleBtn.addEventListener("click", () => {
    const isConnected = (statusBadge.textContent === "Active");
    if (isConnected) {
      chrome.storage.local.set({ isRunning: false }, () => {
        updateUI("disconnected");
        chrome.runtime.sendMessage({ action: "DISCONNECT" });
      });
    } else {
      const wsUrl = wsUrlInput.value.trim();
      chrome.storage.local.set({ wsUrl }, () => {
        updateUI("connecting");
        chrome.runtime.sendMessage({ action: "CONNECT", url: wsUrl });
      });
    }
  });

  // ============================================================================
  // Task 12.1 — Clear Feed button
  // ============================================================================

  clearBtn.addEventListener("click", () => {
    chrome.storage.local.get("logs", (data) => {
      const currentLogs = data.logs || [];

      // 12.1.d — save a snapshot for potential undo
      _preClearSnapshot = [...currentLogs];

      // 12.1.b — wipe logs, re-render
      chrome.storage.local.set({ logs: [], clearedAt: Date.now() }, () => {
        renderFeed([]);
      });

      // 12.1.c — reset StreamBuffer in background (already handles CLEAR_BUFFER)
      chrome.runtime.sendMessage({ action: "CLEAR_BUFFER" });

      // 12.1.d — show snackbar
      showSnackbar();
    });
  });

  snackbarUndo.addEventListener("click", () => {
    if (!_preClearSnapshot) return;
    chrome.storage.local.set({ logs: _preClearSnapshot }, () => {
      renderFeed(_preClearSnapshot);
      _preClearSnapshot = null;
    });
    hideSnackbar();
  });

  // ============================================================================
  // Live messages from background
  // ============================================================================

  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === "STATUS_UPDATE") {
      updateUI(message.state);
    } else if (message.action === "NEW_LOG") {
      chrome.storage.local.get("logs", (data) => {
        renderFeed(data.logs || []);
      });
    } else if (message.action === "TRANSCRIPT_MODE_CHANGED") {
      // 11.2.e — real-time badge update
      setTranscriptBadge(message.transcriptMode);
    }
  });

  // ============================================================================
  // UI helpers
  // ============================================================================

  function updateUI(state) {
    if (state === "connected") {
      statusBadge.textContent = "Active";
      statusBadge.className   = "badge connected";
      toggleBtn.textContent   = "Disconnect";
      toggleBtn.className     = "btn active";
      toggleBtn.disabled      = false;
      chrome.storage.local.set({ isRunning: true });
    } else if (state === "connecting") {
      statusBadge.textContent = "Connecting...";
      statusBadge.className   = "badge rate-limit"; // orange-yellow badge style
      toggleBtn.textContent   = "Connecting...";
      toggleBtn.className     = "btn";
      toggleBtn.disabled      = true;
    } else {
      statusBadge.textContent = "Inactive";
      statusBadge.className   = "badge disconnected";
      toggleBtn.textContent   = "Connect & Listen";
      toggleBtn.className     = "btn";
      toggleBtn.disabled      = false;
      chrome.storage.local.set({ isRunning: false });
    }
  }

  // 11.2.e — Show / hide the transcript mode badge
  function setTranscriptBadge(active) {
    if (active) {
      transcriptBadge.classList.remove("hidden");
    } else {
      transcriptBadge.classList.add("hidden");
    }
  }

  // ============================================================================
  // Task 12.2.b — renderFeed: new card template
  // ============================================================================

  function renderFeed(logs) {
    feedList.innerHTML = "";

    if (logs.length === 0) {
      statsBar.classList.add("hidden");
      feedList.innerHTML = `
        <div class="empty-state">
          No statements parsed yet. Connect the WebSocket and start playing a broadcast.
        </div>
      `;
      return;
    }

    // 12.2.e — update stats bar
    updateStatsBar(logs);
    statsBar.classList.remove("hidden");

    // Newest first
    const sorted = [...logs].sort((a, b) => b.timestamp - a.timestamp);

    sorted.forEach((log) => {
      feedList.appendChild(buildLogCard(log));
    });
  }

  // ============================================================================
  // Task 12.2 — Build a single verdict card
  // ============================================================================

  function buildLogCard(log) {
    const timeStr = new Date(log.timestamp).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

    const wrapper = document.createElement("div");
    wrapper.className = "log-item";

    // --- Determine overall verdict state for this log item ---
    // null  → still waiting for backend response  → ANALYZING
    // []    → backend responded, no match found   → UNVERIFIED
    // [...]  → at least one report                → use classification

    let badgeHtml = "";

    if (log.report === null) {
      // Still waiting for backend response
      badgeHtml = `<span class="verdict-badge analyzing">⏳ Analysing…</span>`;
    } else if (log.report.pipeline_status === "rate_limited") {
      const cooldownSec = log.report.cooldown_remaining || 60;
      badgeHtml = `<span class="verdict-badge rate-limit">🔁 Rate Limited (${cooldownSec}s cooldown)</span>`;
    } else if (log.report.pipeline_status === "timeout") {
      badgeHtml = `<span class="verdict-badge error">⌛ Timed Out</span>`;
    } else if (log.report.pipeline_status === "no_claim") {
      badgeHtml = `<span class="verdict-badge no-claim">✕ Not a Valid Claim</span>`;
    } else if (log.report.pipeline_status === "added_unverified") {
      badgeHtml = `<span class="verdict-badge added">📥 Added to DB</span>`;
    } else if (log.report.pipeline_status === "skipped_unverified") {
      badgeHtml = `<span class="verdict-badge skipped">⚠ Skipped — Low Confidence</span>`;
    } else if (log.report.pipeline_status === "error") {
      badgeHtml = `<span class="verdict-badge error">⚠️ Processing Error</span>`;
    } else if (log.report.pipeline_status === "ingest_error") {
      badgeHtml = `<span class="verdict-badge error">⚠️ Saved — DB Error</span>`;
    } else if (log.report.pipeline_status === "disconnected") {
      badgeHtml = "";
    } else if (
      log.report.pipeline_status === "compared_added" ||
      log.report.pipeline_status === "compared_skipped"
    ) {
      const saved = log.report.pipeline_status === "compared_added";
      const label = (log.report.verdict?.label || "").toUpperCase();
      const isContradiction = label.includes("CONTRADICT");
      const isConsistent    = label.includes("CONSISTENT");
      const savedSuffix     = saved ? "" : " (Not Saved)";

      if (isContradiction) {
        badgeHtml = `<span class="verdict-badge contradiction">🚨 Claim Inconsistent${savedSuffix}</span>`;
      } else if (isConsistent) {
        badgeHtml = `<span class="verdict-badge consistent">✓ Consistent${savedSuffix}</span>`;
      } else {
        badgeHtml = `<span class="verdict-badge neutral">— No Prior Record${savedSuffix}</span>`;
      }
    } else {
      badgeHtml = `<span class="verdict-badge neutral">— Unknown</span>`;
    }

    // --- Header row: badge (left) + timestamp (right) ---
    const header = document.createElement("div");
    header.className = "log-header";
    header.innerHTML = `
      ${badgeHtml}
      <span class="log-timestamp">${timeStr}</span>
    `;

    // --- Sentence text ---
    const sentence = document.createElement("div");
    sentence.className = "log-sentence";
    sentence.textContent = `"${log.text}"`;

    // --- Speaker Badge ---
    const speaker = log.speaker || "Unknown Speaker";
    const confidence = (log.speakerConfidence || "low").toLowerCase();
    const speakerBadge = document.createElement("span");
    speakerBadge.className = `speaker-badge speaker-${confidence}`;
    speakerBadge.textContent = `🗣️ ${speaker}`;

    wrapper.appendChild(header);
    wrapper.appendChild(sentence);
    wrapper.appendChild(speakerBadge);

    // --- Per-report blocks ---
    if (log.report && log.report.pipeline_status !== "no_claim" && log.report.pipeline_status !== "disconnected") {
      if (log.report.pipeline_status === "error" || log.report.pipeline_status === "rate_limited") {
        const errorDiv = document.createElement("div");
        errorDiv.className = "error-message";
        errorDiv.style.fontSize = "11px";
        errorDiv.style.color = "#ff5252";
        errorDiv.style.fontWeight = "bold";
        errorDiv.style.marginTop = "8px";
        errorDiv.style.padding = "6px";
        errorDiv.style.border = "1px solid #ff5252";
        errorDiv.style.backgroundColor = "#ffe6e6";
        errorDiv.textContent = log.report.error || "An unknown error occurred.";
        wrapper.appendChild(errorDiv);
      } else {
        wrapper.appendChild(buildReportBlock(log.report));
      }
    }

    return wrapper;
  }

  // ============================================================================
  // Build a single per-report verdict block
  // ============================================================================

  function buildReportBlock(rep) {
    const label = (rep.verdict?.label || "").toUpperCase();
    const isContradiction = label.includes("CONTRADICT");
    const isConsistent    = label.includes("CONSISTENT");
    const isNoPrior       = !rep.historical_claim?.statement;

    let badgeDef = { cls: "neutral", label: "— No Prior Record" };
    if (isContradiction) {
      badgeDef = { cls: "contradiction", label: "🚨 Inconsistent" };
    } else if (isConsistent) {
      badgeDef = { cls: "consistent", label: "✓ Consistent" };
    } else if (
      rep.pipeline_status === "added_unverified" ||
      rep.pipeline_status === "skipped_unverified"
    ) {
      badgeDef = { cls: "added", label: "📥 First Record" };
    }

    const block = document.createElement("div");
    block.className = "verdict-report";

    // Topic tag
    if (rep.new_claim?.topic) {
      const tag = document.createElement("span");
      tag.className = "topic-tag";
      tag.textContent = rep.new_claim.topic.toUpperCase();
      block.appendChild(tag);
    }

    // Claim text + per-claim verdict badge — side-by-side in a flex row
    if (rep.new_claim?.statement) {
      const claimRow = document.createElement("div");
      claimRow.className = "claim-row";

      const claimText = document.createElement("div");
      claimText.className = "claim-text";
      claimText.textContent = rep.new_claim.statement;

      const claimBadge = document.createElement("span");
      claimBadge.className = `claim-verdict-badge ${badgeDef.cls}`;
      claimBadge.textContent = badgeDef.label;

      claimRow.appendChild(claimText);
      claimRow.appendChild(claimBadge);
      block.appendChild(claimRow);
    }

    // Inconsistency reason — shown prominently when it's a contradiction
    if (isContradiction && rep.verdict?.explanation) {
      const reasonBox = document.createElement("div");
      reasonBox.className = "inconsistency-reason";
      reasonBox.innerHTML = `<span class="inconsistency-label">Why inconsistent:</span> ${_escapeHtml(rep.verdict.explanation)}`;
      block.appendChild(reasonBox);
    }

    // Collapsible historical comparison — auto-open for contradictions
    if (rep.historical_claim?.statement) {
      const details = document.createElement("details");
      details.className = "historical-block";
      if (isContradiction) details.open = true; // auto-expand on contradiction

      const summary = document.createElement("summary");
      const historicalDate = rep.historical_claim.claim_date
        ? ` (${rep.historical_claim.claim_date})`
        : "";
      summary.textContent = `Previous claim${historicalDate}`;
      details.appendChild(summary);

      const quote = document.createElement("blockquote");
      quote.className = "historical-quote";
      quote.textContent = rep.historical_claim.statement;
      details.appendChild(quote);

      block.appendChild(details);
    } else if (!isContradiction && !isConsistent && rep.pipeline_status !== "added_unverified" && rep.pipeline_status !== "skipped_unverified") {
      // No prior record note
      const noPrior = document.createElement("div");
      noPrior.className = "no-prior-note";
      noPrior.textContent = "📢 No prior historical claims found for this topic.";
      block.appendChild(noPrior);
    }

    // "Added to DB" note
    if (rep.pipeline_status === "added_unverified") {
      const addedNote = document.createElement("div");
      addedNote.className = "added-note";
      addedNote.textContent = "📥 First claim on this topic — added to the knowledge base.";
      block.appendChild(addedNote);
    }

    // Numeric diff badge
    if (rep.verdict?.type === "numeric" && rep.verdict.absolute_drift !== undefined) {
      const absVal = rep.verdict.absolute_drift;
      const percentVal = rep.verdict.percentage_variance;
      const isPositive = absVal > 0;

      let diffClass = "neutral-diff";
      let diffSign  = "";
      if (isPositive)  { diffClass = "positive"; diffSign = "+"; }
      if (!isPositive && absVal !== 0) { diffClass = "negative"; diffSign = "−"; }

      const diffBadge = document.createElement("div");
      diffBadge.className = `diff-badge ${diffClass}`;

      let diffText = `Δ ${diffSign}${Math.abs(absVal).toFixed(1)}`;
      if (percentVal !== undefined && percentVal !== null) {
        diffText += ` (${diffSign}${Math.abs(percentVal).toFixed(1)}%)`;
      }
      diffBadge.textContent = diffText;
      block.appendChild(diffBadge);
    }

    // Explanation — shown for consistent / numeric / no-prior cases (not contradiction, which gets the reason box)
    if (rep.verdict?.explanation && !isContradiction) {
      const explain = document.createElement("div");
      explain.className = "log-explanation";
      explain.textContent = rep.verdict.explanation;
      block.appendChild(explain);
    }

    return block;
  }

  // ============================================================================
  // HTML escape helper
  // ============================================================================
  function _escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // ============================================================================
  // Task 12.2.e — Global Stats Bar
  // ============================================================================

  function updateStatsBar(logs) {
    let contradictions = 0;
    let consistent = 0;
    let addedToDB = 0;
    let analyzing = 0;

    logs.forEach((log) => {
      if (log.report === null) {
        analyzing++;
      } else if (
        log.report.pipeline_status === "no_claim" ||
        log.report.pipeline_status === "skipped_unverified" ||
        log.report.pipeline_status === "rate_limited" ||
        log.report.pipeline_status === "timeout" ||
        log.report.pipeline_status === "error" ||
        log.report.pipeline_status === "ingest_error"
      ) {
        // not counted in the main stats
      } else if (log.report.pipeline_status === "added_unverified") {
        addedToDB++;
      } else {
        const label = (log.report.verdict?.label || "").toUpperCase();
        if (label.includes("CONTRADICT")) {
          contradictions++;
        } else if (label.includes("CONSISTENT")) {
          consistent++;
        } else {
          addedToDB++; // "No prior record" counts as a new addition
        }
      }
    });

    document.getElementById("stat-sentences").textContent =
      `${logs.length} sentence${logs.length !== 1 ? "s" : ""}`;
    document.getElementById("stat-contradictions").textContent =
      `${contradictions} inconsistent`;
    document.getElementById("stat-consistent").textContent =
      `${consistent} consistent`;
    document.getElementById("stat-unverified").textContent =
      `${addedToDB} added to db`;
  }

  // ============================================================================
  // Task 12.1.d — Snackbar helpers
  // ============================================================================

  function showSnackbar() {
    if (_snackbarTimeout) clearTimeout(_snackbarTimeout);
    snackbar.classList.add("visible");
    _snackbarTimeout = setTimeout(() => hideSnackbar(), 2000);
  }

  function hideSnackbar() {
    snackbar.classList.remove("visible");
    if (_snackbarTimeout) {
      clearTimeout(_snackbarTimeout);
      _snackbarTimeout = null;
    }
  }
});
