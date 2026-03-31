import os
import requests
import json
from dotenv import load_dotenv

load_dotenv()
SARVAM_API_KEY = os.getenv("SARVAM_API_KEY")

def translate_sarvam(text, source_lang, target_lang):
    if source_lang == target_lang:
        return text
    
    if not text or not SARVAM_API_KEY:
        return text
        
    url = "https://api.sarvam.ai/translate"
    payload = {
        "input": text,
        "source_language_code": source_lang,
        "target_language_code": target_lang,
        "speaker_gender": "Male",
        "mode": "formal"
    }
    headers = {
        "api-subscription-key": SARVAM_API_KEY, 
        "Content-Type": "application/json"
    }
    
    try:
        r = requests.post(url, json=payload, headers=headers)
        if r.ok:
             return r.json().get("translated_text", text)
        return text
    except Exception:
        return text

def stt_sarvam(file_path, language_code):
    if not SARVAM_API_KEY:
        raise ValueError("SARVAM_API_KEY missing")
        
    url = "https://api.sarvam.ai/speech-to-text"
    headers = {"api-subscription-key": SARVAM_API_KEY}
    
    with open(file_path, 'rb') as f:
        files = {'file': (os.path.basename(file_path), f, 'audio/webm')}
        data = {
            'model': 'saaras:v3',
            'mode': 'transcribe',
            'language_code': language_code
        }
        r = requests.post(url, files=files, data=data, headers=headers)
        
    if not r.ok:
        raise Exception(f"STT Error: {r.text}")
        
    return r.json().get("transcript", "")
