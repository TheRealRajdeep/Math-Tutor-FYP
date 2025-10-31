import os
import base64
import json
import requests
import logging
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)
MATHPIX_ENDPOINT = "https://api.mathpix.com/v3/text"


def extract_text_from_image(image_path: str) -> dict:
    app_id = os.getenv("MATHPIX_APP_ID")
    app_key = os.getenv("MATHPIX_APP_KEY")
    if not app_id or not app_key:
        return {"text": "", "confidence": 0.0, "error": "MathPix credentials missing"}

    with open(image_path, "rb") as f:
        img_b64 = base64.b64encode(f.read()).decode()

    headers = {"app_id": app_id, "app_key": app_key}
    payload = {
        "src": f"data:image/png;base64,{img_b64}",
        "formats": ["text"],
        "rm_spaces": True,
        "math_inline_delimiters": ["$", "$"]
    }

    try:
        resp = requests.post(MATHPIX_ENDPOINT, json=payload, headers=headers, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        
        # Print full MathPix API response for debugging
        print("=" * 80)
        print("MATHPIX API RESPONSE:")
        print("=" * 80)
        print(f"Full Response JSON: {json.dumps(data, indent=2)}")
        print("=" * 80)
        logger.info(f"MathPix API Response: {json.dumps(data, indent=2)}")
        
        text = data.get("text", "")
        logger.debug(f"MathPix response - text length: {len(text)}")
        return {"text": text, "confidence": 1.0, "error": None}
    except Exception as e:
        logger.error(f"MathPix API error: {str(e)}")
        return {"text": "", "confidence": 0.0, "error": str(e)}


