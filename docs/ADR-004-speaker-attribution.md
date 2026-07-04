# ADR 004: Speaker Attribution Strategy

## Context

The system processes real-time captions from YouTube videos to extract political claims. Currently, the `Claim` schema hardcodes the politician's name (e.g., `"Governor Alexis Vance"`). To support arbitrary videos and debates, we need a reliable way to identify who is speaking at any given time.

YouTube does not reliably provide speaker metadata. Auto-generated captions have none. Human-authored transcripts occasionally include speaker prefixes (e.g., `[Joe Biden]:`), but these are rare.

We evaluated several approaches:
1. **Audio Diarization (e.g., pyannote)**: Highly accurate for VODs, but too slow for live streams and requires downloading the audio file out-of-band.
2. **Video Frame OCR**: Capturing the video player frame to read lower-third chyrons. Works well for broadcast news but adds latency and API costs.
3. **LLM with Video Metadata**: Querying an LLM at page load with the video title and description. Cheap and effective for solo speeches, but cannot detect mid-video speaker changes in debates.
4. **Transcript Label Scraping**: Free and fast, but only works on a small subset of videos with manual transcripts.

## Decision

We will implement a **4-layer fallback strategy** that attempts cheap, deterministic methods first before falling back to heuristics and expensive methods.

1. **Layer 1: Transcript Labels (DOM)**. If the video has a human transcript, we regex parse segment text for `[Speaker Name]:`. This provides per-sentence attribution with high confidence for free.
2. **Layer 2: LLM from Title + Description (Heuristic)**. We scrape the video title and description on load, and ask a fast LLM (via our backend) to identify the primary speaker. This sets a video-wide `currentSpeaker` with medium/high confidence.
3. **Layer 3: Video Frame OCR (Vision)**. *(Optional/Future)* For broadcast news, we can periodically poll the video frame, crop the bottom 20%, and run a vision LLM to read the chyron text. This provides real-time mid-video updates.
4. **Layer 4: Fallback**. If all else fails, we use `"Unknown Speaker"`.

## Consequences

- **Pros**: Cost-effective for the majority of use cases (solo speeches). Graceful degradation.
- **Cons**: Layer 2 assumes a single primary speaker. For debates without a manual transcript or OCR enabled, all sentences will be attributed to the most prominent speaker identified in the title.
- **Data Model**: The `Claim` schema now includes `speaker` and `speaker_confidence` to reflect the probabilistic nature of the attribution.
