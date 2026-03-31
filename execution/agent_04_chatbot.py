import os
import json
from dotenv import load_dotenv
from groq import Groq

load_dotenv()
GROQ_API_KEY = os.getenv("GROQ_API_KEY")

def chat_response(user_query, context_json=None, chat_history=None):
    if not GROQ_API_KEY:
        raise ValueError("GROQ_API_KEY is not set.")
        
    client = Groq(api_key=GROQ_API_KEY)
    
    chat_history = chat_history or []
    
    if context_json:
        # State 1: Contextual
        system_prompt = f"""
        You are an empathetic, highly knowledgeable medical guide.
        The user has uploaded their medical report. Here is the strict JSON representation of the report:
        {json.dumps(context_json, indent=2)}
        
        Your instructions:
        1. Understand the user's intent. Answer their questions based EXCLUSIVELY on this medical report's data.
        2. Explain everything in extremely simple, layman terms that even a child can understand.
        3. STRICT INSTRUCTION: If the user asks for details, risks, or precautions, YOU MUST BE EXTREMELY COMPREHENSIVE. Break down every risk and precaution thoroughly with bullet points.
        4. YOU MUST RESPOND EXCLUSIVELY IN ENGLISH.
        5. Generate 3 logical follow-up questions the user might want to ask next based on your reply, ALSO IN ENGLISH.
        6. CLINICAL CONSTRAINT: You are strictly a Health and Medical Copilot. If the user asks ANY question unrelated to health, medicine, wellness, or their report (e.g., sports, coding, general knowledge), YOU MUST POLITELY BUT FIRMLY DECLINE to answer, stating you are a dedicated medical AI. Under NO circumstances should you hallucinate external remedies.
        7. You MUST return your answer strictly as a JSON object:
        {{
          "reply": "Your highly accessible, simple, and detailed answer in English",
          "suggestions": ["English follow-up 1", "English follow-up 2", "English follow-up 3"]
        }}
        """
    else:
        # State 2: Symptom Checker
        system_prompt = """
        You are an empathetic and knowledgeable general medical guide.
        The user has NOT uploaded a medical report. They are describing their symptoms or asking general medical questions.
        
        Your instructions:
        1. Understand the user's intent. Provide empathetic, extremely simple, layman general medical guidance.
        2. If asked for details, BE VERY DETAIL-ORIENTED. Break down causes, implications, and precautions thoroughly. Do not be brief.
        3. Clearly state that you are an AI, not a doctor. Include standard "consult a doctor" disclaimers. 
        4. YOU MUST RESPOND EXCLUSIVELY IN ENGLISH.
        5. CLINICAL CONSTRAINT: You are strictly a Health and Medical Copilot. If the user asks ANY question unrelated to health, medicine, or wellness, YOU MUST POLITELY BUT FIRMLY DECLINE to answer, stating you are a dedicated medical AI. Do NOT hallucinate false treatments.
        6. Generate 3 logical follow-up questions in ENGLISH.
        7. You MUST return your answer strictly as a JSON object:
        {
          "reply": "Your detailed empathetic English answer",
          "suggestions": ["Follow-up 1", "Follow-up 2", "Follow-up 3"]
        }
        """
        
    messages = [{"role": "system", "content": system_prompt}]
    
    for msg in chat_history:
        messages.append({"role": msg["role"], "content": msg["content"]})
        
    messages.append({"role": "user", "content": user_query})
    
    chat_completion = client.chat.completions.create(
        messages=messages,
        model="llama-3.3-70b-versatile",
        response_format={"type": "json_object"},
        temperature=0.3
    )
    
    return json.loads(chat_completion.choices[0].message.content)

def run_chatbot(user_query, context_filepath=None, history_filepath=None):
    try:
        context_json = None
        if context_filepath and os.path.exists(context_filepath):
            with open(context_filepath, 'r') as f:
                context_json = json.load(f)
                
        history = []
        if history_filepath and os.path.exists(history_filepath):
            with open(history_filepath, 'r') as f:
                history = json.load(f)
                
        response_data = chat_response(user_query, context_json, history)
        return {
            "success": True, 
            "response": response_data.get("reply", "Error parsing reply."), 
            "suggestions": response_data.get("suggestions", [])
        }
    except Exception as e:
        return {"success": False, "error": str(e)}

if __name__ == "__main__":
    pass
