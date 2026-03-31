import os
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import FileResponse
import requests
import json
import uuid
from dotenv import load_dotenv

load_dotenv()

# Import our custom agents
from execution.agent_01_extraction import run_extraction
from execution.agent_02_summarizer import run_summarizer
from execution.agent_03_fact_checker import run_fact_checker
from execution.agent_04_chatbot import run_chatbot
from execution.agent_05_localization import translate_sarvam, stt_sarvam
from execution.agent_06_longitudinal import run_longitudinal_analysis
from execution.pdf_generator import generate_pdf_from_json, generate_progress_pdf

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Allow all for local dev
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

security = HTTPBearer()
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

def get_current_user_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {token}"
    }
    r = requests.get(f"{SUPABASE_URL}/auth/v1/user", headers=headers)
    if not r.ok:
        raise HTTPException(status_code=401, detail="Invalid token")
    return {"token": token, "user": r.json()}

@app.get("/")
def read_root():
    return {"status": "Brain is online. EHR Active."}

@app.post("/api/upload")
async def upload_report(
    file: UploadFile = File(...), 
    language: str = Form("en-IN"),
    token_data: dict = Depends(get_current_user_token)
):
    user_id = token_data["user"]["id"]
    token = token_data["token"]

    # Save the file temporarily
    file_path = f".tmp/{uuid.uuid4()}_{file.filename}"
    os.makedirs(".tmp", exist_ok=True)
    with open(file_path, "wb") as f:
        f.write(await file.read())
    
    # Run Agent 1: Extraction
    extraction_res = run_extraction(file_path)
    if not extraction_res.get("success"):
        raise HTTPException(status_code=500, detail=extraction_res.get("error"))
    extracted_json = extraction_res["data"]
    
    # Save JSON to temp for Summarizer
    json_path = f"{file_path}.json"
    with open(json_path, 'w') as f:
        json.dump(extracted_json, f)
        
    lang_map = {
        "hi-IN": "Hindi", "en-IN": "English", "bn-IN": "Bengali", "gu-IN": "Gujarati", 
        "mr-IN": "Marathi", "ta-IN": "Tamil", "te-IN": "Telugu", "kn-IN": "Kannada", 
        "ml-IN": "Malayalam", "pa-IN": "Punjabi"
    }
    target_lang_name = lang_map.get(language, "English")
        
    # Run Agent 2: Summarizer
    summary_res = run_summarizer(json_path, language_name=target_lang_name)
    if not summary_res.get("success"):
        raise HTTPException(status_code=500, detail=summary_res.get("error"))
        
    sub_res = summary_res["summary"]
    if not sub_res.get("success"):
        raise HTTPException(status_code=500, detail=sub_res.get("error"))
        
    summary_data = sub_res.get("summary_data", {})
    markdown_summary_raw = summary_data.get("markdown_summary", "")
    
    # Robust Type Handling
    if isinstance(markdown_summary_raw, dict):
        markdown_summary_str = ""
        for k, v in markdown_summary_raw.items():
            markdown_summary_str += f"### {k}\n{v}\n\n"
    elif isinstance(markdown_summary_raw, list):
        markdown_summary_str = "\n".join(map(str, markdown_summary_raw))
    else:
        markdown_summary_str = str(markdown_summary_raw)
    
    # Save Markdown to temp for Fact Checker
    summary_path = f"{file_path}.md"
    with open(summary_path, 'w') as f:
        f.write(markdown_summary_str)
        
    # Run Agent 3: Fact Checker
    fact_check_res = run_fact_checker(json_path, summary_path)
    if not fact_check_res.get("success"):
        raise HTTPException(status_code=500, detail=fact_check_res.get("error"))
        
    # Clean up temp media file
    os.remove(file_path)

    corrected_summary = fact_check_res["result"].get("corrected_summary", markdown_summary_str)

    # ---------------------------------------------------------
    # SAVE TO SUPABASE EHR 
    # ---------------------------------------------------------
    insert_url = f"{SUPABASE_URL}/rest/v1/health_reports"
    db_headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "Prefer": "return=representation"
    }
    payload = {
        "user_id": user_id,
        "raw_json": extracted_json,
        "markdown_summary": corrected_summary
    }
    db_res = requests.post(insert_url, headers=db_headers, json=payload)
    
    longitudinal_data = None
    if db_res.ok:
        # Fetch Past Reports for Longitudinal Analysis
        get_url = f"{SUPABASE_URL}/rest/v1/health_reports?user_id=eq.{user_id}&order=created_at.asc"
        r = requests.get(get_url, headers=db_headers)
        if r.ok:
            past_reports = r.json()
            if len(past_reports) > 1:
                past_jsons = [pt["raw_json"] for pt in past_reports[:-1]]
                current_json = past_reports[-1]["raw_json"]
                long_res = run_longitudinal_analysis(past_jsons, current_json)
                if long_res.get("success"):
                    longitudinal_data = long_res["data"]
                    if language != "en-IN" and "drift_analysis" in longitudinal_data:
                        longitudinal_data["drift_analysis"] = [
                            translate_sarvam(drift, "en-IN", language) for drift in longitudinal_data["drift_analysis"]
                        ]
    
    # Localize Welcome Messages natively
    welc_msg = translate_sarvam("Your report has been analyzed. What would you like to know in simple terms?", "en-IN", language)
    suggestions = [
        translate_sarvam("Please explain my report in detail.", "en-IN", language),
        translate_sarvam("What are my biggest health risks?", "en-IN", language),
        translate_sarvam("What diet and precautions should I follow?", "en-IN", language)
    ]
    
    return {
        "success": True,
        "raw_json": extracted_json,
        "summary": corrected_summary,
        "fact_check": fact_check_res["result"],
        "context_file": json_path,
        "severity_score": summary_data.get("severity_score", 1),
        "affected_organs": summary_data.get("affected_organs", []),
        "hyper_localized_diet": summary_data.get("hyper_localized_diet", []),
        "medical_metaphor": summary_data.get("medical_metaphor", ""),
        "longitudinal_data": longitudinal_data,
        "welcome_msg": welc_msg,
        "welcome_suggestions": suggestions
    }

@app.get("/api/reports")
def get_reports(token_data: dict = Depends(get_current_user_token)):
    user_id = token_data["user"]["id"]
    token = token_data["token"]
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {token}",
    }
    get_url = f"{SUPABASE_URL}/rest/v1/health_reports?user_id=eq.{user_id}&order=created_at.desc"
    r = requests.get(get_url, headers=headers)
    if not r.ok:
        raise HTTPException(status_code=500, detail="Failed to fetch reports")
    
    return {"success": True, "reports": r.json()}

@app.get("/api/export/pdf/{report_id}")
def export_pdf(report_id: str, token_data: dict = Depends(get_current_user_token)):
    user_id = token_data["user"]["id"]
    token = token_data["token"]
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {token}"
    }
    get_url = f"{SUPABASE_URL}/rest/v1/health_reports?id=eq.{report_id}"
    r = requests.get(get_url, headers=headers)
    if not r.ok or not r.json():
        raise HTTPException(status_code=404, detail="Report not found")
        
    report = r.json()[0]
    out_path = f".tmp/{uuid.uuid4()}_export.pdf"
    os.makedirs(".tmp", exist_ok=True)
    generate_pdf_from_json(report["raw_json"], report["markdown_summary"], out_path)
    
    return FileResponse(out_path, media_type="application/pdf", filename=f"Health_Report_{report_id}.pdf")

@app.post("/api/export/progress-pdf")
async def export_progress_pdf(
    progress_data: str = Form(...),
    token_data: dict = Depends(get_current_user_token)
):
    """Generate a downloadable PDF from progress analysis data."""
    import traceback
    try:
        data = json.loads(progress_data)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid JSON data: {e}")
    
    try:
        out_path = f".tmp/{uuid.uuid4()}_progress.pdf"
        os.makedirs(".tmp", exist_ok=True)
        generate_progress_pdf(data, out_path)
    except Exception as e:
        err = traceback.format_exc()
        print(f"[PDF ERROR] {err}")
        raise HTTPException(status_code=500, detail=f"PDF generation error: {str(e)}")
    
    return FileResponse(out_path, media_type="application/pdf", filename="Health_Progress_Report.pdf")

@app.post("/api/reports/progress-analysis")
async def progress_analysis(
    days: int = Form(30),
    language: str = Form("en-IN"),
    token_data: dict = Depends(get_current_user_token)
):
    """Generate a comprehensive AI progress analysis across a date range of reports."""
    from datetime import datetime, timedelta
    from groq import Groq
    
    user_id = token_data["user"]["id"]
    token = token_data["token"]
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {token}",
    }
    
    cutoff = (datetime.utcnow() - timedelta(days=days)).isoformat()
    get_url = f"{SUPABASE_URL}/rest/v1/health_reports?user_id=eq.{user_id}&created_at=gte.{cutoff}&order=created_at.asc"
    r = requests.get(get_url, headers=headers)
    if not r.ok:
        raise HTTPException(status_code=500, detail="Failed to fetch reports")
    
    reports = r.json()
    if len(reports) < 1:
        raise HTTPException(status_code=400, detail="No reports found in the selected period")
    
    # Build a condensed data bundle for the AI
    reports_bundle = []
    for rep in reports:
        test_date = rep.get("raw_json", {}).get("report_metadata", {}).get("actual_test_date", "Unknown")
        ai_date = rep.get("created_at", "Unknown")
        patient = rep.get("raw_json", {}).get("patient_details", {})
        pages = rep.get("raw_json", {}).get("pages", [])
        all_results = []
        for page in pages:
            for lr in page.get("lab_results", []):
                all_results.append({
                    "test": lr.get("test_name", ""),
                    "result": lr.get("result", ""),
                    "unit": lr.get("unit", ""),
                    "ref": lr.get("reference_range", ""),
                    "status": lr.get("status", "Normal")
                })
        reports_bundle.append({
            "test_date": test_date,
            "ai_analysis_date": ai_date[:10] if len(str(ai_date)) > 10 else ai_date,
            "patient": patient,
            "lab_results": all_results,
            "summary_excerpt": rep.get("markdown_summary", "")[:500]
        })
    
    lang_map = {
        "hi-IN": "Hindi", "en-IN": "English", "bn-IN": "Bengali", "gu-IN": "Gujarati", 
        "mr-IN": "Marathi", "ta-IN": "Tamil", "te-IN": "Telugu"
    }
    target_lang = lang_map.get(language, "English")
    
    GROQ_API_KEY = os.getenv("GROQ_API_KEY")
    client = Groq(api_key=GROQ_API_KEY)
    
    system_prompt = f"""You are a Senior Medical Analyst AI. You are given multiple medical reports for the SAME patient over a period of time.
    
    Analyze the progression and output a JSON object with:
    
    1. "progress_summary": A very detailed markdown analysis. YOU MUST STRICTLY USE THESE HEADINGS (with exactly 3 hash marks):
       ### Overall Health Trajectory
       (Describe if improving, stable, or declining)
       
       ### Key Improvements
       (Bullet points of improved biomarkers)
       
       ### Worsening Indicators
       (Bullet points of worsened biomarkers)
       
       ### Recovery Rate
       (Estimated recovery percentage)
       
       ### Precautions Still Needed
       (Bullet points of things to watch out for)
       
       ### Recommendations
       (Bullet points for specialist consultations)
       
    2. "earliest_severity": Integer severity score (0-100) for the earliest report (0=perfect health, 100=critical). Be mathematically consistent based strictly on out-of-range biomarkers.
    3. "latest_severity": Integer severity score (0-100) for the latest report.
    4. "improvement_percentage": Float. How much the patient improved overall (+ for better, - for worse).
    5. "key_improvements": Array of strings listing specific improvements. (Put "None" if none found)
    6. "key_concerns": Array of strings listing remaining/new concerns. (Put "None" if none found)
    7. "reports_analyzed": Total number of reports analyzed.
    8. "date_range": The date range covered.
    
    IMPORTANT: Write ALL text values in {target_lang}. Output ONLY valid JSON.
    """
    
    chat_completion = client.chat.completions.create(
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"Reports to analyze:\n{json.dumps(reports_bundle, indent=2)}"}
        ],
        model="llama-3.3-70b-versatile",
        response_format={"type": "json_object"},
        temperature=0.0
    )
    
    try:
        result = json.loads(chat_completion.choices[0].message.content)
    except:
        raise HTTPException(status_code=500, detail="AI analysis failed")
    
    # Inject report references directly from DB (not AI)
    report_refs = []
    for idx, rep in enumerate(reports, 1):
        meta = rep.get("raw_json", {}).get("report_metadata", {})
        patient_d = rep.get("raw_json", {}).get("patient_details", {})
        report_refs.append({
            "index": idx,
            "test_date": meta.get("actual_test_date") or rep.get("created_at", "")[:10],
            "lab_name": meta.get("lab_name") or meta.get("laboratory_name") or "Unknown Lab",
            "clinic_name": meta.get("clinic_name") or meta.get("hospital_name") or "",
            "doctor_name": patient_d.get("referring_doctor") or patient_d.get("doctor_name") or meta.get("doctor_name") or "Not specified",
            "report_title": rep.get("markdown_summary", "")[:60].split("\n")[0].strip() or f"Report {idx}",
        })
    
    result["report_references"] = report_refs
    result["success"] = True
    return result

@app.get("/api/chat/threads")
def get_chat_threads(token_data: dict = Depends(get_current_user_token)):
    user_id = token_data["user"]["id"]
    token = token_data["token"]
    headers = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {token}"}
    r = requests.get(f"{SUPABASE_URL}/rest/v1/chat_threads?user_id=eq.{user_id}&order=created_at.desc&select=id,title,created_at,language_code", headers=headers)
    if not r.ok: raise HTTPException(status_code=500, detail="Failed to fetch chat threads")
    return {"success": True, "threads": r.json()}

@app.get("/api/chat/threads/{thread_id}")
def get_chat_thread(thread_id: str, token_data: dict = Depends(get_current_user_token)):
    user_id = token_data["user"]["id"]
    token = token_data["token"]
    headers = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {token}"}
    r = requests.get(f"{SUPABASE_URL}/rest/v1/chat_threads?id=eq.{thread_id}", headers=headers)
    if not r.ok or not r.json(): raise HTTPException(status_code=404, detail="Thread not found")
    return {"success": True, "thread": r.json()[0]}

@app.delete("/api/chat/threads/{thread_id}")
def delete_chat_thread(thread_id: str, token_data: dict = Depends(get_current_user_token)):
    token = token_data["token"]
    headers = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {token}"}
    r = requests.delete(f"{SUPABASE_URL}/rest/v1/chat_threads?id=eq.{thread_id}", headers=headers)
    if not r.ok:
        raise HTTPException(status_code=500, detail="Failed to delete thread")
    return {"success": True}

@app.delete("/api/reports/{report_id}")
def delete_report(report_id: str, token_data: dict = Depends(get_current_user_token)):
    token = token_data["token"]
    headers = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {token}"}
    r = requests.delete(f"{SUPABASE_URL}/rest/v1/health_reports?id=eq.{report_id}", headers=headers)
    if not r.ok:
        raise HTTPException(status_code=500, detail="Failed to delete report")
    return {"success": True}

@app.post("/api/chat")
async def chat(
    query: str = Form(...), 
    context_file: str = Form(""), 
    history: str = Form("[]"), 
    language: str = Form("hi-IN"),
    thread_id: str = Form(""),
    token_data: dict = Depends(get_current_user_token)
):
    user_id = token_data["user"]["id"]
    token = token_data["token"]
    headers = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {token}", "Content-Type": "application/json", "Prefer": "return=representation"}
    
    # FULL PIPELINE: Step 3 & 4 (Translate to English & run Groq Logic)
    # The Frontend handles the language selection. Sarvam translates native text into precise English.
    english_query = translate_sarvam(query, source_lang=language, target_lang="en-IN")
    chat_history = json.loads(history)
    
    if context_file and os.path.exists(context_file):
        with open(context_file, 'r') as f:
            ctx = json.load(f)
        res = run_chatbot(english_query, context_filepath=context_file, history_filepath=None)
    else:
        # Save temp history
        hist_path = f".tmp/{uuid.uuid4()}_hist.json"
        os.makedirs(".tmp", exist_ok=True)
        with open(hist_path, 'w') as f:
            json.dump(chat_history, f)
        res = run_chatbot(english_query, context_filepath=None, history_filepath=hist_path)
        
    if not res.get("success"):
        raise HTTPException(status_code=500, detail=res.get("error"))
        
    # FULL PIPELINE: Step 5 (Translate Groq's English answer BACK to native language!)
    english_response = res["response"]
    native_response = translate_sarvam(english_response, source_lang="en-IN", target_lang=language)
    
    # Translate the dynamic suggestions to native language as well!
    native_suggestions = [translate_sarvam(sug, source_lang="en-IN", target_lang=language) for sug in res.get("suggestions", [])]
        
    full_updated_history = chat_history + [{"role": "user", "content": query}] + [{"role": "assistant", "content": native_response, "suggestions": native_suggestions, "language_code": language}]
    
    returned_thread_id = thread_id
    if thread_id:
        requests.patch(f"{SUPABASE_URL}/rest/v1/chat_threads?id=eq.{thread_id}", headers=headers, json={"messages": full_updated_history})
    else:
        short_title = query[:40] + ("..." if len(query)>40 else "")
        r = requests.post(f"{SUPABASE_URL}/rest/v1/chat_threads", headers=headers, json={
            "user_id": user_id, "title": short_title, "messages": full_updated_history, "language_code": language
        })
        if r.ok and r.json():
            returned_thread_id = r.json()[0]["id"]
            
    return {
        "success": True, 
        "response": native_response, 
        "language_code": language,
        "suggestions": native_suggestions,
        "thread_id": returned_thread_id
    }

@app.post("/api/chat_voice")
async def chat_voice(
    file: UploadFile = File(...), 
    context_file: str = Form(""), 
    history: str = Form("[]"), 
    language: str = Form("hi-IN"),
    thread_id: str = Form(""),
    token_data: dict = Depends(get_current_user_token)
):
    # FULL NATIVE PIPELINE: Step 1 & 2 (Extract audio -> Native Text)
    file_path = f".tmp/{uuid.uuid4()}_{file.filename}"
    os.makedirs(".tmp", exist_ok=True)
    with open(file_path, "wb") as f:
        f.write(await file.read())
        
    try:
        # 1. Sarvam STT: Native Audio -> Native Text
        native_text_query = stt_sarvam(file_path, language_code=language)
        
        # 2. Re-use the precise /api/chat localized logic internally!
        reply_data = await chat(query=native_text_query, context_file=context_file, history=history, language=language, thread_id=thread_id, token_data=token_data)
        
        # Merge transcripts into the response so UI can show the user's speech
        reply_data["user_transcript"] = native_text_query
        return reply_data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if os.path.exists(file_path):
            os.remove(file_path)

@app.post("/api/tts")
async def tts(text: str = Form(...), language_code: str = Form("hi-IN")):
    import re
    import textwrap
    SARVAM_API_KEY = os.getenv("SARVAM_API_KEY")
    if not SARVAM_API_KEY:
        raise HTTPException(status_code=500, detail="SARVAM_API_KEY not set")
    
    url = "https://api.sarvam.ai/text-to-speech"
    headers = {
        "api-subscription-key": SARVAM_API_KEY, 
        "Content-Type": "application/json"
    }
    
    # Provide a sane fallback for unmapped languages
    valid_langs = ["hi-IN", "bn-IN", "ta-IN", "te-IN", "kn-IN", "ml-IN", "mr-IN", "gu-IN", "pa-IN", "or-IN", "en-IN"]
    if language_code not in valid_langs:
        language_code = "hi-IN"
        
    # STRIP MARKDOWN AND WEIRD FORMATTING
    clean_text = re.sub(r'[*#_`\[\]]+', '', text)
    clean_text = clean_text.replace('\n', ' ').strip()
        
    # Max out the global token limit (Sarvam limit is max 3 chunks of 500 chars = 1500)
    safe_text = clean_text[:1350]
    if len(clean_text) > 1350:
        last_space = safe_text.rfind(' ')
        if last_space > 0:
            safe_text = safe_text[:last_space]
            
    # THE ARRAY CHUNKER: Bypass 500 char string limit per input
    chunks = textwrap.wrap(safe_text, width=450)
    if not chunks:
        chunks = [""]
        
    # Strictly enforce 3 items max
    chunks = chunks[:3]
        
    payload = {
        "inputs": chunks,
        "target_language_code": language_code,
        "speaker": "shubh",
        "model": "bulbul:v3"
    }
    
    r = requests.post(url, json=payload, headers=headers)
    if not r.ok:
        print(f"SARVAM TTS V3 FAILED: {r.text}. Retrying with bulbul:v2 fallback...")
        payload["model"] = "bulbul:v2"
        payload["speaker"] = "anushka"
        r = requests.post(url, json=payload, headers=headers)
        
        if not r.ok:
            print(f"SARVAM TTS V2 FAILED: {r.text}")
            raise HTTPException(status_code=500, detail="TTS service error")
    
    data = r.json()
    return {"success": True, "audios": data.get("audios", [])}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
