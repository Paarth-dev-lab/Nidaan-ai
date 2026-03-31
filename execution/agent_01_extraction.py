import os
import json
import requests
from dotenv import load_dotenv
from groq import Groq

load_dotenv()

OCR_SPACE_API_KEY = os.getenv("OCR_SPACE_API_KEY")
GROQ_API_KEY = os.getenv("GROQ_API_KEY")

import fitz  # PyMuPDF
import uuid
import concurrent.futures

def extract_text_from_file(file_path):
    if not OCR_SPACE_API_KEY:
        raise ValueError("OCR_SPACE_API_KEY is not set.")
    
    payload = {
        'apikey': OCR_SPACE_API_KEY,
        'language': 'eng',
        'isOverlayRequired': False,
        'OCREngine': 3,
        'scale': True
    }
    
    # Slice multi-page PDFs using PyMuPDF to bypass OCR.space 3-page limit
    if file_path.lower().endswith('.pdf'):
        doc = fitz.open(file_path)
        
        # --- NEW PERFORMANCE LOGIC: Native Extraction Bypass ---
        # Most digital lab reports (like LalPathLabs) contain native text.
        # If we can rip the text out instantaneously without OCR, we bypass the API entirely!
        native_text = []
        for page_num in range(len(doc)):
            page = doc.load_page(page_num)
            text = page.get_text("text")
            native_text.append(f"[[--- PAGE {page_num + 1} ---]]\n{text}")
                
        combined_native_text = "\n".join(native_text)
        
        # If the PDF has substantial text baked in, skip the OCR network requests (0.01s parse time)
        if len(combined_native_text.strip()) > 100:
            return combined_native_text
            
        # --- FALLBACK: It's a scanned PDF. Proceed with compressed images & multithreading ---
        tmp_images = []
        
        # Step 1: Synchronously extract all pages to temporary compressed images
        for page_num in range(len(doc)):
            page = doc.load_page(page_num)
            # Use 150 DPI and JPG to create a 200KB file instead of 10MB PNG, saving massive upload/processing time
            pix = page.get_pixmap(dpi=150)
            tmp_img_path = f".tmp/{uuid.uuid4()}_page_{page_num}.jpg"
            pix.save(tmp_img_path)
            tmp_images.append(tmp_img_path)
            
        def send_to_ocr(img_path):
            with open(img_path, 'rb') as f:
                r = requests.post('https://api.ocr.space/parse/image', files={'filename': f}, data=payload)
            os.remove(img_path)
            result = r.json()
            if result.get('IsErroredOnProcessing'):
                return f"OCR Error: {result.get('ErrorMessage')}"
            parsed = result.get('ParsedResults', [])
            return "\n".join([res.get('ParsedText', '') for res in parsed if res.get('ParsedText')])

        extracted_text_list = [""] * len(tmp_images)
        
        # Step 2: Asynchronously blast OCR requests in parallel to save massive amounts of time
        with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
            future_to_idx = {executor.submit(send_to_ocr, img): i for i, img in enumerate(tmp_images)}
            for future in concurrent.futures.as_completed(future_to_idx):
                idx = future_to_idx[future]
                try:
                    res_text = future.result()
                    extracted_text_list[idx] = f"[[--- PAGE {idx + 1} ---]]\n{res_text}"
                except Exception as exc:
                    extracted_text_list[idx] = f"[[--- PAGE {idx + 1} ---]]\nError: {str(exc)}"
            
        return "\n".join(extracted_text_list)

    else:
        # Standard image processing
        with open(file_path, 'rb') as f:
            r = requests.post('https://api.ocr.space/parse/image', files={'filename': f}, data=payload)
        result = r.json()
        
        if result.get('IsErroredOnProcessing'):
            raise Exception(f"OCR Error: {result.get('ErrorMessage')}")
            
        parsed_results = result.get('ParsedResults', [])
        return "[[--- PAGE 1 ---]]\n" + "\n".join([res.get('ParsedText', '') for res in parsed_results])

def _groq_parse_batch(text, extract_metadata=True):
    """Process a batch of pages through Groq. First batch gets full prompt, subsequent batches get lightweight pages-only prompt."""
    client = Groq(api_key=GROQ_API_KEY)
    
    if extract_metadata:
        system_prompt = """
    You are a highly capable medical parsing AI. Your job is to extract medical data from raw OCR text and convert it into a strictly formatted JSON object.
    The text is separated by [[--- PAGE X ---]] markers.
    You must output ONLY valid JSON without any markdown formatting.
    The JSON must adhere to the following structure:
    {
      "patient_details": { "name": "...", "age": "...", "gender": "...", "date_of_report": "..." },
      "report_metadata": {
        "lab_name": "The name of the laboratory or diagnostic centre that performed the tests (e.g. Dr Lal PathLabs, SRL Diagnostics, Thyrocare). Extract this from headers, footers, logos, or watermarks.",
        "referring_doctor": "The name of the referring doctor or physician mentioned on the report. Include their designation if available (e.g. Dr. Sharma, MD).",
        "actual_test_date": "The date when the sample was actually collected or the test was performed. Extract this from fields like 'Sample Collected On', 'Test Date', 'Collection Date', 'Date of Collection' etc. Format as DD/MM/YYYY if possible.",
        "report_generation_date": "The date when the report was generated/printed. Look for 'Report Date', 'Printed On' etc. Format as DD/MM/YYYY."
      },
      "pages": [
        {
          "page_number": 1,
          "test_categories_on_page": ["e.g. Complete Blood Count", "e.g. Lipid Profile"],
          "lab_results": [{ "test_name": "...", "result": "...", "unit": "...", "reference_range": "...", "status": "Normal/High/Low/Critical" }],
          "doctor_notes_on_page": "..."
        }
      ]
    }
    IMPORTANT EXTRACTION RULES:
    - For each lab_result, you MUST determine the "status" field by comparing the result against the reference_range. Mark as "Normal" if within range, "High" if above, "Low" if below, "Critical" if dangerously out of range.
    - For the reference_range, extract exactly what the report shows (e.g. "0.00 - 30.00").
    - Always extract the unit of measurement for each test (e.g. mg/dL, mm/hr, g/dL).
    - If a page has no actionable data, skip it or leave its internal arrays empty.
    - Do not hallucinate data. Ensure `pages` is an array.
    - If lab_name or referring_doctor cannot be found, set them to "Not mentioned in report".
    """
    else:
        # ━━━ LIGHTWEIGHT PROMPT for parallel page batches ━━━
        system_prompt = """
    You are a medical data extraction AI. Extract ONLY the lab test results from these pages.
    The text is separated by [[--- PAGE X ---]] markers. Preserve original page numbers.
    Output ONLY valid JSON:
    {
      "pages": [
        {
          "page_number": <use the original page number from the [[--- PAGE X ---]] marker>,
          "test_categories_on_page": ["category name"],
          "lab_results": [{ "test_name": "...", "result": "...", "unit": "...", "reference_range": "...", "status": "Normal/High/Low/Critical" }],
          "doctor_notes_on_page": "..."
        }
      ]
    }
    RULES: Determine status by comparing result vs reference_range. Skip pages with no lab data. Do not hallucinate.
    """
    
    chat_completion = client.chat.completions.create(
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"Raw OCR Text:\n{text}"}
        ],
        model="llama-3.3-70b-versatile",
        response_format={"type": "json_object"},
        temperature=0.1
    )
    
    return json.loads(chat_completion.choices[0].message.content)


def parse_text_to_json(text):
    """Parse extracted text to structured JSON. Uses parallel chunking for large reports (>4 pages)."""
    if not GROQ_API_KEY:
        raise ValueError("GROQ_API_KEY is not set.")
    
    import re
    # Split text into page blocks
    page_splits = re.split(r'(\[\[--- PAGE \d+ ---\]\])', text)
    page_blocks = {}
    current_page = None
    for part in page_splits:
        m = re.match(r'\[\[--- PAGE (\d+) ---\]\]', part)
        if m:
            current_page = int(m.group(1))
            page_blocks[current_page] = ""
        elif current_page is not None:
            page_blocks[current_page] += part
    
    total_pages = len(page_blocks)
    
    # ━━━ FAST PATH: Small reports (≤4 pages) → single API call ━━━
    if total_pages <= 4:
        return _groq_parse_batch(text, extract_metadata=True)
    
    # ━━━ TURBO PATH: Large reports → parallel chunked processing ━━━
    # A 15-page report becomes 5 parallel batches of 3 pages each
    CHUNK_SIZE = 3
    page_nums = sorted(page_blocks.keys())
    chunks = []
    for i in range(0, len(page_nums), CHUNK_SIZE):
        chunk_pages = page_nums[i:i + CHUNK_SIZE]
        chunk_text = "\n".join([f"[[--- PAGE {p} ---]]\n{page_blocks[p]}" for p in chunk_pages])
        chunks.append((chunk_text, i == 0))  # (text, needs_metadata_extraction)
    
    print(f"⚡ TURBO MODE: {total_pages} pages → {len(chunks)} parallel batches")
    
    results = [None] * len(chunks)
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
        fmap = {executor.submit(_groq_parse_batch, ct, needs_meta): idx
                for idx, (ct, needs_meta) in enumerate(chunks)}
        for future in concurrent.futures.as_completed(fmap):
            idx = fmap[future]
            try:
                results[idx] = future.result()
            except Exception as e:
                print(f"⚠️ Chunk {idx} failed: {e}")
                results[idx] = {"pages": []}
    
    # Merge: first result has patient_details & report_metadata, append pages from rest
    merged = results[0] if results[0] else {"patient_details": {}, "report_metadata": {}, "pages": []}
    for r in results[1:]:
        if r and "pages" in r:
            merged.setdefault("pages", []).extend(r["pages"])
    
    return merged

def run_extraction(file_path):
    try:
        raw_text = extract_text_from_file(file_path)
        structured_data = parse_text_to_json(raw_text)
        return {"success": True, "data": structured_data, "raw_text": raw_text}
    except Exception as e:
        return {"success": False, "error": str(e)}

if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1:
        res = run_extraction(sys.argv[1])
        print(json.dumps(res, indent=2))
