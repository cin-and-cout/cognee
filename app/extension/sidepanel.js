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
    updateUI(data.isRunning || false);
    renderFeed(data.logs || []);
  });

  // 11.2.e — Query transcript mode status on load
  chrome.runtime.sendMessage({ action: "TRANSCRIPT_MODE_STATUS" }, (resp) => {
    if (resp && resp.transcriptMode) {
      setTranscriptBadge(true);
    }
  });

  // ============================================================================
  // Connect / Disconnect toggle (unchanged from previous milestone)
  // ============================================================================

  toggleBtn.addEventListener("click", () => {
    chrome.storage.local.get("isRunning", (data) => {
      const nextState = !data.isRunning;
      const wsUrl = wsUrlInput.value.trim();

      chrome.storage.local.set({ wsUrl, isRunning: nextState }, () => {
        updateUI(nextState);
        chrome.runtime.sendMessage({
          action: nextState ? "CONNECT" : "DISCONNECT",
          url: wsUrl,
        });
      });
    });
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
      updateUI(message.isRunning);
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

  function updateUI(isRunning) {
    if (isRunning) {
      statusBadge.textContent = "Active";
      statusBadge.className   = "badge connected";
      toggleBtn.textContent   = "Disconnect";
      toggleBtn.className     = "btn active";
    } else {
      statusBadge.textContent = "Inactive";
      statusBadge.className   = "badge disconnected";
      toggleBtn.textContent   = "Connect & Listen";
      toggleBtn.className     = "btn";
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
      // 12.2.c — analyzing state
      badgeHtml = `<span class="verdict-badge analyzing">⏳ Analyzing…</span>`;
    } else if (log.report.pipeline_status === "no_claim") {
      badgeHtml = `<span class="verdict-badge neutral">⚪ No Claim</span>`;
    } else if (log.report.pipeline_status === "added_unverified") {
      badgeHtml = `<span class="verdict-badge unverified">◈ Added to DB</span>`;
    } else if (log.report.pipeline_status === "skipped_unverified") {
      badgeHtml = `<span class="verdict-badge unverified">◈ Skipped (Low Conf)</span>`;
    } else if (log.report.pipeline_status === "compared_added" || log.report.pipeline_status === "compared_skipped") {
      const isConsistent = log.report.verdict?.is_consistent;
      const label = (log.report.verdict?.label || "").toUpperCase();
      if (isConsistent === false || label.includes("CONTRADICT")) {
        badgeHtml = `<span class="verdict-badge contradiction">🚨 Contradiction</span>`;
      } else if (isConsistent === true || label.includes("CONSISTENT")) {
        badgeHtml = `<span class="verdict-badge consistent">✓ Consistent</span>`;
      } else {
        badgeHtml = `<span class="verdict-badge neutral">— Neutral</span>`;
      }
    } else {
      badgeHtml = `<span class="verdict-badge neutral">— Unverified</span>`;
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
    if (log.report && log.report.pipeline_status !== "no_claim") {
      wrapper.appendChild(buildReportBlock(log.report));
    }

    return wrapper;
  }

  // ============================================================================
  // Build a single per-report verdict block
  // ============================================================================

  function buildReportBlock(rep) {
    const isConsistent = rep.verdict?.is_consistent;
    const label = (rep.verdict?.label || "").toUpperCase();
    
    let badgeDef = { cls: "neutral", label: "— Neutral" };
    if (isConsistent === false || label.includes("CONTRADICT")) {
      badgeDef = { cls: "contradiction", label: "🚨 Contradiction" };
    } else if (isConsistent === true || label.includes("CONSISTENT")) {
      badgeDef = { cls: "consistent", label: "✓ Consistent" };
    } else if (rep.pipeline_status && rep.pipeline_status.includes("unverified")) {
      badgeDef = { cls: "unverified", label: "◈ Unverified" };
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

    // Collapsible historical comparison (12.2.a)
    if (rep.historical_claim?.statement) {
      const details = document.createElement("details");
      details.className = "historical-block";

      const summary = document.createElement("summary");
      summary.textContent = "Historical match";
      details.appendChild(summary);

      const quote = document.createElement("blockquote");
      quote.className = "historical-quote";
      quote.textContent = rep.historical_claim.statement;
      details.appendChild(quote);

      block.appendChild(details);
    }

    // Numeric diff badge (12.2.a — only for numeric claims)
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

    // Explanation (12.2.a)
    if (rep.verdict?.explanation) {
      const explain = document.createElement("div");
      explain.className = "log-explanation";
      explain.textContent = rep.verdict.explanation;
      block.appendChild(explain);
    }

    return block;
  }

  // ============================================================================
  // Task 12.2.e — Global Stats Bar
  // ============================================================================

  function updateStatsBar(logs) {
    let contradictions = 0;
    let consistent = 0;
    let unverified = 0;
    let analyzing = 0;

    logs.forEach((log) => {
      if (log.report === null) {
        analyzing++;
      } else if (log.report.pipeline_status === "no_claim") {
        // ignore in stats
      } else if (log.report.pipeline_status && log.report.pipeline_status.includes("unverified")) {
        unverified++;
      } else {
        const isConsistent = log.report.verdict?.is_consistent;
        const label = (log.report.verdict?.label || "").toUpperCase();
        if (isConsistent === false || label.includes("CONTRADICT")) {
          contradictions++;
        } else if (isConsistent === true || label.includes("CONSISTENT")) {
          consistent++;
        } else {
          unverified++;
        }
      }
    });

    document.getElementById("stat-sentences").textContent =
      `${logs.length} sentence${logs.length !== 1 ? "s" : ""}`;
    document.getElementById("stat-contradictions").textContent =
      `${contradictions} contradiction${contradictions !== 1 ? "s" : ""}`;
    document.getElementById("stat-consistent").textContent =
      `${consistent} consistent`;
    document.getElementById("stat-unverified").textContent =
      `${unverified} unverified`;
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
