# backend/services/tutor_service.py
import os
import logging
from typing import Optional

from sentence_transformers import SentenceTransformer
from dotenv import load_dotenv

from ..db.db_connection import get_db_connection
import openai

load_dotenv()
logger = logging.getLogger(__name__)

openai.api_key = os.getenv("OPENAI_API_KEY")

_MODEL = None

def _get_semantic_model() -> SentenceTransformer:
    global _MODEL
    if _MODEL is None:
        model_name = os.getenv("EMBEDDING_MODEL", "all-MiniLM-L6-v2")
        logger.info(f"Loading embedding model: {model_name}")
        _MODEL = SentenceTransformer(model_name)
    return _MODEL


def generate_hint_text(query: str, limit: int = 3) -> Optional[str]:
    try:
        if not query or not query.strip():
            return None

        model = _get_semantic_model()
        emb = model.encode(query).tolist()

        conn = get_db_connection()
        cur = conn.cursor()
        try:
            # explicit cast to vector to avoid "vector <-> numeric[]" errors
            cur.execute(
                """
                SELECT problem, solution, answer
                FROM omni_math_data
                ORDER BY embedding <-> %s::vector
                LIMIT %s;
                """,
                (emb, limit),
            )
            rows = cur.fetchall()
        finally:
            cur.close()
            conn.close()

        context = "\n\n".join(
            [f"Problem: {r[0]}\nSolution: {r[1]}\nAnswer: {r[2]}" for r in rows]
        )

        if not openai.api_key:
            logger.error("OpenAI API key not configured; cannot generate hint.")
            return None

        prompt = f"""
You are a helpful math tutor.
Based on the following similar problems, generate a clear hint (not the full answer)
that guides the student toward solving the query.

Query: {query}

Context problems:
{context}

Provide only a short hint (1–3 lines).
"""

        response = openai.chat.completions.create(
            model=os.getenv("RAG_HINT_MODEL", "gpt-4o-mini"),
            messages=[
                {"role": "system", "content": "You are a knowledgeable and patient math tutor."},
                {"role": "user", "content": prompt},
            ],
            max_tokens=120,
            temperature=0.7,
        )

        hint_text = response.choices[0].message.content.strip()
        logger.info(f"Generated hint: {hint_text}")
        return hint_text

    except Exception as exc:
        logger.exception("generate_hint_text error")
        return None
