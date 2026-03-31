import os
import json
from dotenv import load_dotenv
from groq import Groq

load_dotenv()
GROQ_API_KEY = os.getenv("GROQ_API_KEY")

def summarize_medical_json(json_data, language_name="English"):
    if not GROQ_API_KEY:
        raise ValueError("GROQ_API_KEY is not set.")
        
    client = Groq(api_key=GROQ_API_KEY)
    
    system_prompt = f"""
    You are a Next-Generation Chief Medical Officer AI.
    You are analyzing a patient's medical report JSON.
    
    You must output a HIGHLY STRUCTURED JSON object containing the following:
    
    1. "markdown_summary": A comprehensive layman summary structured as follows:
       - **Global Overview**: Brief intro with patient name, age, gender, and overall health status.
       - **Page-by-Page Breakdown**: For each page (e.g., ### Page 1: Complete Blood Count):
         * For EACH test result, create a clear classification line like:
           - **ESR (Erythrocyte Sedimentation Rate)**: Result = 83 mm/hr | Normal Range for [age] year old [gender] = 0-20 mm/hr | Status: ⚠️ HIGH
           - **Hemoglobin**: Result = 14.2 g/dL | Normal for [age] year old [gender] = 13.0-17.5 g/dL | Status: ✅ NORMAL
         * After listing each test, explain in simple terms what abnormal values mean for the patient.
       - **Risk Assessment**: Future health risks based on abnormal findings.
       - **Actionable Precautions**: Specific diet, lifestyle, and follow-up recommendations.
       
       CRITICAL: The normal ranges MUST be age-appropriate and gender-appropriate. A 65-year-old female has different normal ESR than a 25-year-old male. Use medically accurate reference ranges.
       
    2. "severity_score": An integer from 1 to 100 indicating how critical the health situation is (1 = perfectly normal, 100 = life-threatening emergency).
    3. "affected_organs": An array of strings of the human body systems affected by abnormal results. Choose ONLY from this exact list: ["heart", "liver", "kidneys", "lungs", "blood", "thyroid", "brain", "pancreas", "bones", "stomach", "immune system"]. If everything is normal, return an empty array.
    4. "hyper_localized_diet": An array of 3 highly specific, culturally relevant Indian regional food/diet recommendations tailored perfectly to the condition. Do not say "eat healthy." Say "Drink Jamun juice" or "Eat Bajra Roti" if diabetic.
    5. "medical_metaphor": A brilliant, highly relatable real-world metaphor explaining their condition in 1-2 sentences. 
    
    CRITICAL LOCALIZATION INSTRUCTION:
    You MUST translate the values for "markdown_summary", "affected_organs", "hyper_localized_diet", and "medical_metaphor" entirely and accurately into: {language_name}.
    If {language_name} is English, write in English. If it is Hindi, Gujarati, Tamil, etc, you MUST write the JSON string values natively in that language's script!
    Ensure that you do not break the Markdown formatting such as `#` or `**` when translating the summary.

    CRITICAL: Base your facts ONLY on the provided JSON data. You MUST return valid JSON. Do not output raw markdown outside of the JSON structure.
    """
    
    chat_completion = client.chat.completions.create(
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"Analyze this report data:\n{json.dumps(json_data, indent=2)}"}
        ],
        model="llama-3.3-70b-versatile",
        response_format={"type": "json_object"},
        temperature=0.3
    )
    
    raw_response = chat_completion.choices[0].message.content
    try:
        response_data = json.loads(raw_response)
        return {"success": True, "summary_data": response_data}
    except Exception as e:
        return {"success": False, "error": f"JSON parsing failed: {e}"}

def run_summarizer(json_filepath, language_name="English"):
    try:
        with open(json_filepath, 'r') as f:
            data = json.load(f)
        summary = summarize_medical_json(data, language_name=language_name)
        return {"success": True, "summary": summary}
    except Exception as e:
        return {"success": False, "error": str(e)}

if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1:
        res = run_summarizer(sys.argv[1])
        print(json.dumps(res, indent=2))
