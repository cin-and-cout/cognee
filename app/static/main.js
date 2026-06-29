let socket = null;
let totalSentences = 0;
let totalClaims = 0;
let totalContradictions = 0;

// UI Elements
const btnStart = document.getElementById('btn-start');
const btnStop = document.getElementById('btn-stop');
const btnClear = document.getElementById('btn-clear');
const delaySlider = document.getElementById('delay-slider');
const delayVal = document.getElementById('delay-val');
const statusBadge = document.getElementById('status-badge');
const transcriptFeed = document.getElementById('transcript-feed');
const verdictFeed = document.getElementById('verdict-feed');

const statSentences = document.getElementById('stat-sentences');
const statClaims = document.getElementById('stat-claims');
const statContradictions = document.getElementById('stat-contradictions');

// Sync slider value
delaySlider.addEventListener('input', (e) => {
    delayVal.textContent = e.target.value;
});

// Clear feeds and reset stats
function clearDashboard() {
    transcriptFeed.innerHTML = '<div class="placeholder-text">Waiting to start the stream...</div>';
    verdictFeed.innerHTML = '<div class="placeholder-text">Reports and alerts will appear here in real-time.</div>';
    totalSentences = 0;
    totalClaims = 0;
    totalContradictions = 0;
    statSentences.textContent = '0';
    statClaims.textContent = '0';
    statContradictions.textContent = '0';
}

btnClear.addEventListener('click', clearDashboard);

// Connect and start stream
btnStart.addEventListener('click', () => {
    const delay = delaySlider.value;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/live-speech?delay=${delay}`;

    // Reset placeholders if starting fresh
    if (totalSentences === 0) {
        transcriptFeed.innerHTML = '';
        verdictFeed.innerHTML = '';
    }

    socket = new WebSocket(wsUrl);

    statusBadge.textContent = 'Connected';
    statusBadge.className = 'badge badge-connected';
    btnStart.disabled = true;
    btnStop.disabled = false;
    delaySlider.disabled = true;

    socket.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.status === 'completed') {
            stopStream();
            return;
        }

        if (data.error) {
            appendError(data.error);
            stopStream();
            return;
        }

        // Process Sentence
        totalSentences++;
        statSentences.textContent = totalSentences;
        appendTranscript(data.text, data.timestamp);

        // Process Report
        if (data.report) {
            totalClaims++;
            statClaims.textContent = totalClaims;
            appendVerdict(data.report);
        }
    };

    socket.onclose = () => {
        stopStream();
    };

    socket.onerror = () => {
        appendError('WebSocket connection error.');
        stopStream();
    };
});

btnStop.addEventListener('click', () => {
    if (socket) {
        socket.close();
    }
    stopStream();
});

function stopStream() {
    statusBadge.textContent = 'Disconnected';
    statusBadge.className = 'badge badge-disconnected';
    btnStart.disabled = false;
    btnStop.disabled = true;
    delaySlider.disabled = false;
}

function appendTranscript(text, timestamp) {
    const date = new Date(timestamp);
    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    const bubble = document.createElement('div');
    bubble.className = 'transcript-bubble';
    bubble.innerHTML = `
        <div class="transcript-time">${timeStr}</div>
        <div class="transcript-text">${text}</div>
    `;
    transcriptFeed.appendChild(bubble);
    transcriptFeed.scrollTop = transcriptFeed.scrollHeight;
}

function appendVerdict(report) {
    const newClaim = report.new_claim;
    const histClaim = report.historical_claim;
    const verdict = report.verdict;

    let verdictClass = 'verdict-card-none';
    let badgeClass = 'verdict-badge-none';
    let label = verdict.label;

    if (label.toLowerCase().includes('contradict')) {
        verdictClass = 'verdict-card-contradict';
        badgeClass = 'verdict-badge-contradict';
        totalContradictions++;
        statContradictions.textContent = totalContradictions;
    } else if (label.toLowerCase().includes('consistent')) {
        verdictClass = 'verdict-card-consistent';
        badgeClass = 'verdict-badge-consistent';
    }

    const card = document.createElement('div');
    card.className = `verdict-card ${verdictClass}`;

    let comparisonBoxHTML = '';
    if (histClaim) {
        comparisonBoxHTML = `
            <div class="claim-comparison-box">
                <div class="compare-row">
                    <span class="label">Historical Statement (${histClaim.claim_date})</span>
                    <p>"${histClaim.statement}"</p>
                </div>
                <div class="compare-row">
                    <span class="label">New Statement (Today)</span>
                    <p>"${new_claim.statement}"</p>
                </div>
            </div>
        `;
    } else {
        comparisonBoxHTML = `
            <div class="claim-comparison-box">
                <div class="compare-row">
                    <span class="label">New Statement (Today)</span>
                    <p>"${new_claim.statement}"</p>
                </div>
            </div>
        `;
    }

    card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center;">
            <div class="verdict-topic">${newClaim.topic}</div>
            <span class="verdict-badge ${badgeClass}">${label}</span>
        </div>
        ${comparisonBoxHTML}
        <div class="verdict-explanation-box">
            <h4>Verdict Explanation</h4>
            <p>${verdict.explanation}</p>
        </div>
    `;

    verdictFeed.appendChild(card);
    verdictFeed.scrollTop = verdictFeed.scrollHeight;
}

function appendError(message) {
    const errorBubble = document.createElement('div');
    errorBubble.className = 'transcript-bubble';
    errorBubble.style.borderColor = 'rgba(239, 68, 68, 0.4)';
    errorBubble.style.background = 'rgba(239, 68, 68, 0.05)';
    errorBubble.innerHTML = `<div class="transcript-text" style="color: #ef4444;">Error: ${message}</div>`;
    transcriptFeed.appendChild(errorBubble);
    transcriptFeed.scrollTop = transcriptFeed.scrollHeight;
}
