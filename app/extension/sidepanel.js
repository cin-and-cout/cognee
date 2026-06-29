document.addEventListener("DOMContentLoaded", () => {
  const wsUrlInput = document.getElementById("ws-url");
  const statusBadge = document.getElementById("status-badge");
  const toggleBtn = document.getElementById("toggle-btn");
  const feedList = document.getElementById("feed-list");

  // Load initial settings
  chrome.storage.local.get(["wsUrl", "isRunning", "logs"], (data) => {
    if (data.wsUrl) {
      wsUrlInput.value = data.wsUrl;
    }
    updateUI(data.isRunning || false);
    renderFeed(data.logs || []);
  });

  // Handle button clicks
  toggleBtn.addEventListener("click", () => {
    chrome.storage.local.get("isRunning", (data) => {
      const nextState = !data.isRunning;
      const wsUrl = wsUrlInput.value.trim();

      chrome.storage.local.set({ wsUrl, isRunning: nextState }, () => {
        updateUI(nextState);
        chrome.runtime.sendMessage({
          action: nextState ? "CONNECT" : "DISCONNECT",
          url: wsUrl
        });
      });
    });
  });

  // Listen for logs or status updates from background
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === "STATUS_UPDATE") {
      updateUI(message.isRunning);
    } else if (message.action === "NEW_LOG") {
      chrome.storage.local.get("logs", (data) => {
        renderFeed(data.logs || []);
      });
    }
  });

  function updateUI(isRunning) {
    if (isRunning) {
      statusBadge.textContent = "Active";
      statusBadge.className = "badge connected";
      toggleBtn.textContent = "Disconnect";
      toggleBtn.className = "btn active";
    } else {
      statusBadge.textContent = "Inactive";
      statusBadge.className = "badge disconnected";
      toggleBtn.textContent = "Connect & Listen";
      toggleBtn.className = "btn";
    }
  }

  function renderFeed(logs) {
    feedList.innerHTML = "";
    if (logs.length === 0) {
      feedList.innerHTML = `
        <div class="empty-state">
          No statements parsed yet. Connect the WebSocket and start playing a broadcast.
        </div>
      `;
      return;
    }

    // Render newest logs at the top
    const sortedLogs = [...logs].sort((a, b) => b.timestamp - a.timestamp);

    sortedLogs.forEach((log) => {
      const itemDiv = document.createElement("div");
      itemDiv.className = "log-item";

      const timeStr = new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      
      let headerHTML = `<div class="log-header"><span>TIME: ${timeStr}</span></div>`;
      let textHTML = `<div class="log-text">"${escapeHtml(log.text)}"</div>`;
      let verdictsHTML = "";

      if (log.report && Array.isArray(log.report) && log.report.length > 0) {
        log.report.forEach((rep) => {
          const classification = (rep.classification || "NEUTRAL").toUpperCase();
          let boxClass = "neutral";
          let icon = "ℹ️";
          
          if (classification === "CONTRADICTION") {
            boxClass = "contradiction";
            icon = "🚨 CONTRADICTION";
          } else if (classification === "CONSISTENT") {
            boxClass = "consistent";
            icon = "✓ CONSISTENT";
          }

          let diffHTML = "";
          if (rep.numerical_diff) {
            const absDiff = rep.numerical_diff.absolute_diff;
            diffHTML = `<div><strong>Diff:</strong> Absolute deviation of ${absDiff}</div>`;
          }

          verdictsHTML += `
            <div class="verdict-box ${boxClass}">
              <div class="verdict-title">${icon} [Topic: ${escapeHtml(rep.topic || "General")}]</div>
              <div class="verdict-details">
                <div><strong>Current:</strong> "${escapeHtml(rep.claim)}"</div>
                <div><strong>Historical:</strong> "${escapeHtml(rep.historical_claim)}"</div>
                ${diffHTML}
              </div>
              <div class="verdict-explanation">
                ${escapeHtml(rep.explanation)}
              </div>
            </div>
          `;
        });
      } else if (log.report !== null) {
        // Report checked but no entries returned
        verdictsHTML = `
          <div class="verdict-box consistent">
            <div class="verdict-title">✓ VERIFIED</div>
            <div class="verdict-details" style="font-size: 10px;">
              No inconsistencies detected against previous claims in graph memory.
            </div>
          </div>
        `;
      }

      itemDiv.innerHTML = headerHTML + textHTML + verdictsHTML;
      feedList.appendChild(itemDiv);
    });
  }

  function escapeHtml(unsafe) {
    if (!unsafe) return "";
    return unsafe
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
});
