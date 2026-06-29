document.addEventListener("DOMContentLoaded", () => {
  const wsUrlInput = document.getElementById("ws-url");
  const statusBadge = document.getElementById("status-badge");
  const toggleBtn = document.getElementById("toggle-btn");
  const logFeed = document.getElementById("log-feed");

  // Load initial settings
  chrome.storage.local.get(["wsUrl", "isRunning", "logs"], (data) => {
    if (data.wsUrl) {
      wsUrlInput.value = data.wsUrl;
    }
    updateUI(data.isRunning || false);
    if (data.logs && data.logs.length > 0) {
      renderLogs(data.logs);
    }
  });

  // Handle button clicks
  toggleBtn.addEventListener("click", () => {
    chrome.storage.local.get("isRunning", (data) => {
      const nextState = !data.isRunning;
      const wsUrl = wsUrlInput.value.trim();

      // Save URL and target state
      chrome.storage.local.set({ wsUrl, isRunning: nextState }, () => {
        updateUI(nextState);

        // Send state change instruction to background script
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
        const logs = data.logs || [];
        renderLogs(logs);
      });
    }
  });

  function updateUI(isRunning) {
    if (isRunning) {
      statusBadge.textContent = "Connected";
      statusBadge.className = "badge connected";
      toggleBtn.textContent = "Disconnect";
      toggleBtn.className = "btn active";
    } else {
      statusBadge.textContent = "Disconnected";
      statusBadge.className = "badge disconnected";
      toggleBtn.textContent = "Connect & Listen";
      toggleBtn.className = "btn";
    }
  }

  function renderLogs(logs) {
    logFeed.innerHTML = "";
    if (logs.length === 0) {
      logFeed.innerHTML = '<li style="color: #777; font-style: italic;">No statements captured yet. Start listening...</li>';
      return;
    }

    logs.forEach((log) => {
      const li = document.createElement("li");
      li.className = "log-item";
      
      // Print time + text
      const timeStr = new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      li.innerHTML = `<strong>[${timeStr}]</strong> ${log.text}`;
      
      logFeed.appendChild(li);
    });

    // Auto-scroll to bottom of the feed
    logFeed.scrollTop = logFeed.scrollHeight;
  }
});
