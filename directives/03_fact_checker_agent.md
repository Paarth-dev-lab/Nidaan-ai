# Agent 3: The Fact-Checker (The Hallucination Killer)

## Goal
Cross-reference the CMO Summarizer's output with the Extractor's JSON to ensure zero hallucinations.

## Inputs
- Strict JSON structure containing extracted data (Agent 1 target).
- Markdown summary (Agent 2 output).

## Execution Details
- Compare the Markdown summary against the exact JSON facts.
- Identify any discrepancies, inferred facts, or hallucinations.
- Trigger the self-annealing process to correct the summary if issues are found.

## Outputs
- A finalized, fact-checked, and hallucination-free Markdown summary, or an error log triggering the Orchestrator's self-annealing retry.
