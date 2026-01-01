# tutor.py
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import logging
from services.tutor_service import generate_hint_text  # adjust relative import if needed

router = APIRouter()
logger = logging.getLogger(__name__)


class HintRequest(BaseModel):
    query: str


@router.post("/rag/hint")
def generate_hint(request: HintRequest):
    q = (request.query or "").strip()
    if not q:
        raise HTTPException(status_code=400, detail="Query cannot be empty")

    hint = generate_hint_text(q)
    if hint:
        return {"hint": hint}
    else:
        raise HTTPException(status_code=500, detail="Failed to generate hint")
