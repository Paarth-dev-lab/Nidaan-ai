import os
import json
from dotenv import load_dotenv
from groq import Groq

load_dotenv()
GROQ_API_KEY = os.getenv("GROQ_API_KEY")

def fact_check_summary(json_data, markdown_summary):
    if not GROQ_API_KEY:
        raise ValueError("GROQ_API_KEY is not set.")
        
    client = Groq(api_key=GROQ_API_KEY)
    
    system_prompt = """
    You are an extremely strict Medical Fact-Checker. 
    Your goal is to cross-reference a generated Markdown summary against the exact JSON facts extracted from a medical report.
    Identify ANY discrepancies, hallucinated numbers, incorrect symptoms, inferred facts not present in the JSON, or unwarranted assumptions.
    
    3. STRICT RULE: IF you find any discrepancy, output a `corrected_summary` replacing ONLY the false information. 
    4. CRITICAL LANGUAGE RULE: If the original summarized text is in a native language (like Hindi, Gujarati, Tamil, etc.), you MUST write the `corrected_summary` and any outputs entirely in that exact same language script. DO NOT translate it back into English.
    5. Return your analysis in this STRICT JSON format:
    {
      "is_hallucination_free": true, // or false
      "discrepancies": ["list of issues found", "..."],
      "corrected_summary": "If is_hallucination_free is false, write the corrected markdown summary here without the hallucinations. If true, place the original summary here."
    }
    """
    
    chat_completion = client.chat.completions.create(
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"Source of Truth JSON:\n{json.dumps(json_data, indent=2)}\n\nGenerated Summary:\n{markdown_summary}"}
        ],
        model="llama-3.3-70b-versatile",
        response_format={"type": "json_object"},
        temperature=0.0
    )
    
    return json.loads(chat_completion.choices[0].message.content)

def run_fact_checker(json_filepath, summary_filepath):
    try:
        with open(json_filepath, 'r') as f:
            json_data = json.load(f)
        with open(summary_filepath, 'r') as f:
            summary = f.read()
        
        result = fact_check_summary(json_data, summary)
        return {"success": True, "result": result}
    except Exception as e:
        return {"success": False, "error": str(e)}

if __name__ == "__main__":
    import sys
    if len(sys.argv) > 2:
        res = run_fact_checker(sys.argv[1], sys.argv[2])
        print(json.dumps(res, indent=2))
