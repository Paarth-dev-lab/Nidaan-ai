# Agent 1: The Extractor (OCR -> JSON)

## Goal
Parse terrible handwriting utilizing the OCR Space API and convert the raw text into a strict, predefined JSON structure.

## Inputs
- Uploaded medical report image or PDF.

## Execution Details
- Call OCR Space API.
- Force `OCREngine=3` for handwriting extraction.
- Convert raw OCR text output into deterministic JSON format detailing patient information, symptoms, diagnoses, medications, etc.

## Outputs
- Strict JSON structure containing extracted data.
