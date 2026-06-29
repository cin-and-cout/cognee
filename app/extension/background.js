let socket = null;
let reconnectTimer = null;

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
      // Handle any real-time verdicts pushed down by backend if needed
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
    // Wrap as a JSON payload or string representing the speech sentence
    const payload = JSON.stringify({ sentence: cleanText });
    socket.send(payload);
    console.log("Sent sentence to backend:", cleanText);
  } else {
    console.log("Cannot send sentence: WebSocket is not open.");
  }

  // Record log locally
  chrome.storage.local.get("logs", (data) => {
    const logs = data.logs || [];
    logs.push({
      timestamp: Date.now(),
      text: cleanText
    });
    // Limit logs list length to 50
    if (logs.length > 50) {
      logs.shift();
    }
    chrome.storage.local.set({ logs }, () => {
      // Notify popup to refresh logs view
      chrome.runtime.sendMessage({ action: "NEW_LOG" });
    });
  });
}
