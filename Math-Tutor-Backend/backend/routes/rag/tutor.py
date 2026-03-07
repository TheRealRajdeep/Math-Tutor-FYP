# tutor.py
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
import logging
from services.tutor_service import generate_tutor_chat_response
from auth.deps import get_current_user
from schemas.auth import UserOut

router = APIRouter()
logger = logging.getLogger(__name__)


class ChatRequest(BaseModel):
    query: str


@router.post("/rag/chat")
def chat_tutor(
    request: ChatRequest,
    current_user: UserOut = Depends(get_current_user)
):
    q = (request.query or "").strip()
    if not q:
        raise HTTPException(status_code=400, detail="Query cannot be empty")

    response = generate_tutor_chat_response(current_user.id, q)
    if response:
        return {"response": response}
    else:
        raise HTTPException(status_code=500, detail="Failed to generate response")
