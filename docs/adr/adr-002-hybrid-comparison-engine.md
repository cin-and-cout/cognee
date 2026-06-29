# ADR 002: Implementation of a Hybrid Comparison Engine

## Status
Proposed

## Context
A key requirement of the Claim Consistency Tracker is identifying contradictions and discrepancies between a newly streamed claim and historical statements. 

Using an LLM to compare two statements in a single prompt is simple to implement but carries risks:
1.  **Hallucination & Indeterminism:** LLMs frequently fail to compute mathematical or percentage differences reliably (e.g., claiming 4.2% and 4.8% are identical, or misunderstanding that a drop in inflation rate is not a drop in price level).
2.  **Explainability:** End-users and judges need to see exactly *why* a claim is flagged (e.g., "The unemployment figure cited changed by +0.6%"). A purely qualitative LLM response lacks structured, reproducible logic.

## Decision
We will implement a **Hybrid Comparison Engine** comprising two distinct processing paths:
1.  **Deterministic Numeric Diff Path:**
    *   Extract numeric quantities, metrics (e.g., inflation rate, budget deficit), units (%, $, people), and dates from the claim.
    *   If a historical claim matches the same metric and unit, compute the exact mathematical drift (absolute and percentage difference).
    *   Generate a structured verdict based on pure calculation (e.g., "Stated figure differs from earlier figure by X%").
2.  **Qualitative LLM Contradiction Path:**
    *   For qualitative assertions (e.g., "We did not raise taxes on the middle class"), use a highly focused LLM prompt act as a Natural Language Inference (NLI) classifier.
    *   Output labels are restricted to a defined schema: `Consistent with prior statements`, `Contradicts statement from [date, source]`, or `No prior record on this topic`.

## Consequences
*   **Pros:**
    *   Highly defensible, explainable outputs for numeric drift.
    *   Reduced non-determinism where mathematical accuracy matters most.
    *   Structured evidence cards for UI displaying the numeric diff.
*   **Cons:**
    *   Requires detailed structured schema extraction using LLMs to populate the numeric values during claim ingestion.

## Confidence Score: 5 / 5
This split-path architecture provides a reliable, explainable foundation for the system's core value proposition (accountability based on hard data).
