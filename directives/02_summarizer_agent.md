# Agent 2: The CMO Summarizer (JSON -> Markdown)

## Goal
Write an easily understandable summary of the medical report based ONLY on the Extractor Agent's JSON output.

## Inputs
- Strict JSON structure containing extracted medical data from Agent 1.

## Execution Details
- Read the JSON.
- Synthesize an 8th-grade reading level summary.
- The summary must be plain Markdown.
- Ensure no hallucinations; use ONLY the provided JSON.

## Outputs
- Markdown summary of the medical report.
