let socket = null;
let reconnectTimer = null;

// Ensure side panel opens when the extension icon is clicked
chrome.runtime.onInstalled.addListener(() => {
  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
      .catch((error) => console.error("Error setting panel behavior:", error));
  }
});

// Listen for messages from popup or content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "CONNECT") {
    connectWebSocket(message.url);
  } else if (message.action === "DISCONNECT") {
    disconnectWebSocket();
  } else if (message.action === "TRANSCRIPT_CAPTURED") {
    handleCapturedTranscript(message.text);
  }
});

function connectWebSocket(url) {
  disconnectWebSocket();

  try {
    socket = new WebSocket(url);

    socket.onopen = () => {
      console.log("WebSocket connected to " + url);
      chrome.storage.local.set({ isRunning: true });
      chrome.runtime.sendMessage({ action: "STATUS_UPDATE", isRunning: true });
    };

    socket.onmessage = (event) => {
      console.log("Message from server: ", event.data);
      try {
        const data = JSON.parse(event.data);
        if (data.text) {
          chrome.storage.local.get("logs", (store) => {
            const logs = store.logs || [];
            // Find existing log entry to attach the verdict/report
            const existingLog = logs.find((l) => l.text === data.text);
            if (existingLog) {
              existingLog.report = data.report;
            } else {
              logs.push({
                timestamp: Date.now(),
                text: data.text,
                report: data.report
              });
            }
            // Cap history to 50 items
            if (logs.length > 50) {
              logs.shift();
            }
            chrome.storage.local.set({ logs }, () => {
              chrome.runtime.sendMessage({ action: "NEW_LOG" });
            });
          });
        }
      } catch (err) {
        console.error("Error parsing WebSocket message:", err);
      }
    };

    socket.onerror = (error) => {
      console.error("WebSocket error:", error);
    };

    socket.onclose = () => {
      console.log("WebSocket closed");
      chrome.storage.local.set({ isRunning: false });
      chrome.runtime.sendMessage({ action: "STATUS_UPDATE", isRunning: false });
    };
  } catch (err) {
    console.error("Connection failed:", err);
    chrome.storage.local.set({ isRunning: false });
    chrome.runtime.sendMessage({ action: "STATUS_UPDATE", isRunning: false });
  }
}

function disconnectWebSocket() {
  if (socket) {
    socket.close();
    socket = null;
  }
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  chrome.storage.local.set({ isRunning: false });
}

function handleCapturedTranscript(text) {
  if (!text || !text.trim()) return;

  const cleanText = text.trim();

  // Send to backend via WebSocket if connected
  if (socket && socket.readyState === WebSocket.OPEN) {
    const payload = JSON.stringify({ sentence: cleanText });
    socket.send(payload);
    console.log("Sent sentence to backend:", cleanText);
  } else {
    console.log("Cannot send sentence: WebSocket is not open.");
  }

  // Record log locally
  chrome.storage.local.get("logs", (data) => {
    const logs = data.logs || [];
    // Only add if not already present
    if (!logs.some((l) => l.text === cleanText)) {
      logs.push({
        timestamp: Date.now(),
        text: cleanText,
        report: null
      });
      if (logs.length > 50) {
        logs.shift();
      }
      chrome.storage.local.set({ logs }, () => {
        chrome.runtime.sendMessage({ action: "NEW_LOG" });
      });
    }
  });
}

