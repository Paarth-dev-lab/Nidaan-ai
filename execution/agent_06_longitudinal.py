import os
import json
import uuid
import requests
from dotenv import load_dotenv

load_dotenv()

GROQ_API_KEY = os.getenv("GROQ_API_KEY")

def run_longitudinal_analysis(past_reports_json_list, current_report_json):
    """
    Takes a list of past reports and the current report to generate:
    1. A tabular % drift of biomarkers.
    2. Predictive AI Forecasting.
    3. Organ Health mapping (0-100 score).
    """
    url = "https://api.groq.com/openai/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type": "application/json"
    }
    
    system_prompt = """You are a highly advanced Medical Longitudinal Analyzer.
You will be given a list of PAST medical reports for a patient in chronological order, followed by their CURRENT medical report.
Your job is to:
1. Calculate the percentage drift (improvement/decay) for key matching biomarkers (e.g. "HbA1c increased by 5%, indicating worsened sugar control").
2. Provide 'Predictive Forecasting' (e.g., 'At this rate, you will become pre-diabetic in 4 months').
3. Map the health of 5 major systems (Heart, Liver, Kidneys, Lungs, General) on a scale of 0 to 100 based on the current report's severity. Return exactly these keys: "heart", "liver", "kidneys", "lungs", "general". 100 means perfect health.

Return ONLY a valid JSON object with the following structure exactly (no markdown formatting, no comments):
{
    "drift_analysis": ["bullet point 1", "bullet point 2"],
    "predictive_forecast": "Short text predicting future risk based on trajectory",
    "organ_health": {
        "heart": 90,
        "liver": 85,
        "kidneys": 95,
        "lungs": 100,
        "general": 80
    },
    "chart_data": [
        {"timestamp": "YYYY-MM-DD", "biomarker_name": value, ...}
    ]
}

Note: For chart_data, extract the 3 most erratic or important biomarkers, and provide an array of objects where each object represents a date (timestamp) and the values of those 3 biomarkers at that date. This will be used in a Recharts frontend.
"""

    past_context = json.dumps(past_reports_json_list)
    current_context = json.dumps(current_report_json)
    
    user_prompt = f"PAST REPORTS:\n{past_context}\n\nCURRENT REPORT:\n{current_context}\n\nAnalyze the trajectory."

    payload = {
        "model": "llama-3.3-70b-versatile",
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        "temperature": 0.1,
        "response_format": {"type": "json_object"}
    }
    
    try:
        response = requests.post(url, headers=headers, json=payload)
        response.raise_for_status()
        result = response.json()
        content = result["choices"][0]["message"]["content"]
        
        analysis_json = json.loads(content)
        return {
            "success": True,
            "data": analysis_json
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }
