document.addEventListener("DOMContentLoaded", () => {
  const wsUrlInput   = document.getElementById("ws-url");
  const statusBadge  = document.getElementById("status-badge");
  const toggleBtn    = document.getElementById("toggle-btn");
  const clearBtn     = document.getElementById("clear-btn");
  const feedList     = document.getElementById("feed-list");
  const statsBar     = document.getElementById("stats-bar");
  const snackbar     = document.getElementById("snackbar");
  const snackbarUndo = document.getElementById("snackbar-undo");

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
    } else if (Array.isArray(log.report) && log.report.length === 0) {
      // 12.2.d — unverified (no historical match)
      badgeHtml = `<span class="verdict-badge unverified">◈ Unverified</span>`;
    } else if (Array.isArray(log.report) && log.report.length > 0) {
      // Pick the most severe verdict to show at the top level
      const hasContradiction = log.report.some(
        (r) => (r.classification || "").toUpperCase() === "CONTRADICTION"
      );
      const hasConsistent = log.report.some(
        (r) => (r.classification || "").toUpperCase() === "CONSISTENT"
      );

      if (hasContradiction) {
        badgeHtml = `<span class="verdict-badge contradiction">🚨 Contradiction</span>`;
      } else if (hasConsistent) {
        badgeHtml = `<span class="verdict-badge consistent">✓ Consistent</span>`;
      } else {
        badgeHtml = `<span class="verdict-badge neutral">— Neutral</span>`;
      }
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

    wrapper.appendChild(header);
    wrapper.appendChild(sentence);

    // --- Per-report blocks ---
    if (Array.isArray(log.report) && log.report.length > 0) {
      log.report.forEach((rep) => {
        wrapper.appendChild(buildReportBlock(rep));
      });
    }

    return wrapper;
  }

  // ============================================================================
  // Build a single per-report verdict block
  // ============================================================================

  function buildReportBlock(rep) {
    const classification = (rep.classification || "NEUTRAL").toUpperCase();

    // Map classification → badge CSS class + label
    const BADGE_MAP = {
      CONTRADICTION: { cls: "contradiction", label: "🚨 Contradiction" },
      CONSISTENT:    { cls: "consistent",    label: "✓ Consistent" },
      NEUTRAL:       { cls: "neutral",        label: "— Neutral" },
      UNVERIFIED:    { cls: "unverified",     label: "◈ Unverified" },
    };
    const badgeDef = BADGE_MAP[classification] || BADGE_MAP.NEUTRAL;

    const block = document.createElement("div");
    block.className = "verdict-report";

    // Topic tag
    if (rep.topic) {
      const tag = document.createElement("span");
      tag.className = "topic-tag";
      tag.textContent = rep.topic.toUpperCase();
      block.appendChild(tag);
    }

    // Claim text + per-claim verdict badge — side-by-side in a flex row
    if (rep.claim) {
      const claimRow = document.createElement("div");
      claimRow.className = "claim-row";

      const claimText = document.createElement("div");
      claimText.className = "claim-text";
      claimText.textContent = rep.claim;

      const claimBadge = document.createElement("span");
      claimBadge.className = `claim-verdict-badge ${badgeDef.cls}`;
      claimBadge.textContent = badgeDef.label;

      claimRow.appendChild(claimText);
      claimRow.appendChild(claimBadge);
      block.appendChild(claimRow);
    }

    // Collapsible historical comparison (12.2.a)
    if (rep.historical_claim) {
      const details = document.createElement("details");
      details.className = "historical-block";

      const summary = document.createElement("summary");
      summary.textContent = "Historical match";
      details.appendChild(summary);

      const quote = document.createElement("blockquote");
      quote.className = "historical-quote";
      quote.textContent = rep.historical_claim;
      details.appendChild(quote);

      block.appendChild(details);
    }

    // Numeric diff badge (12.2.a — only for numeric claims)
    if (rep.numerical_diff) {
      const absVal = rep.numerical_diff.absolute_diff;
      const percentVal = rep.numerical_diff.percentage_diff;
      const isPositive = typeof absVal === "number" ? absVal > 0 : null;

      let diffClass = "neutral-diff";
      let diffSign  = "";
      if (isPositive === true)  { diffClass = "positive"; diffSign = "+"; }
      if (isPositive === false) { diffClass = "negative"; diffSign = "−"; }

      const diffBadge = document.createElement("div");
      diffBadge.className = `diff-badge ${diffClass}`;

      let diffText = `Δ ${diffSign}${absVal}`;
      if (percentVal !== undefined && percentVal !== null) {
        diffText += ` (${diffSign}${Math.abs(percentVal).toFixed(1)}%)`;
      }
      diffBadge.textContent = diffText;
      block.appendChild(diffBadge);
    }

    // Explanation (12.2.a)
    if (rep.explanation) {
      const explain = document.createElement("div");
      explain.className = "log-explanation";
      explain.textContent = rep.explanation;
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
      } else if (Array.isArray(log.report) && log.report.length === 0) {
        unverified++;
      } else if (Array.isArray(log.report)) {
        const hasContradiction = log.report.some(
          (r) => (r.classification || "").toUpperCase() === "CONTRADICTION"
        );
        const hasConsistent = log.report.some(
          (r) => (r.classification || "").toUpperCase() === "CONSISTENT"
        );
        if (hasContradiction) contradictions++;
        else if (hasConsistent) consistent++;
        else unverified++;
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
