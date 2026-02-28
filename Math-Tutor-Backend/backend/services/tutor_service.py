# backend/services/tutor_service.py
import os
import logging
from typing import Optional

from sentence_transformers import SentenceTransformer
from dotenv import load_dotenv

from db.db_connection import get_db_connection
from openai import OpenAI

load_dotenv()
logger = logging.getLogger(__name__)

# Use fresh client instantiation in functions
# openai.api_key = os.getenv("OPENAI_API_KEY")

_MODEL = None

def _get_semantic_model() -> SentenceTransformer:
    global _MODEL
    if _MODEL is None:
        model_name = os.getenv("EMBEDDING_MODEL", "all-MiniLM-L6-v2")
        logger.info(f"Loading embedding model: {model_name}")
        _MODEL = SentenceTransformer(model_name)
    return _MODEL


def generate_hint_text(query: str, limit: int = 3) -> Optional[str]:
    """Thin wrapper kept for backward compatibility — delegates to the detailed feedback path."""
    return generate_wrong_answer_feedback(
        problem=query,
        student_answer="",
        correct_answer="",
        student_solution=query,
        ref_solution="",
        limit=limit,
    )


def generate_wrong_answer_feedback(
    problem: str,
    student_answer: str,
    correct_answer: str,
    student_solution: str,
    ref_solution: str,
    limit: int = 3,
) -> Optional[str]:
    """
    Generate deep, explanatory feedback for a wrong answer.

    The feedback:
    - Identifies what the student did wrong and why
    - Explains the correct reasoning step-by-step
    - Provides an encouraging closing remark
    """
    try:
        query = problem or student_solution or student_answer
        if not query or not query.strip():
            return None

        model = _get_semantic_model()
        emb = model.encode(query).tolist()

        conn = get_db_connection()
        cur = conn.cursor()
        try:
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

        similar_context = "\n\n".join(
            [f"Similar Problem: {r[0]}\nSolution: {r[1]}\nAnswer: {r[2]}" for r in rows]
        )

        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            logger.error("OpenAI API key not configured; cannot generate feedback.")
            return "Error: OpenAI API key is missing."

        # Build optional sections only when data is available
        student_answer_section = f"Student's Answer: {student_answer}" if student_answer else ""
        correct_answer_section = f"Correct Answer: {correct_answer}" if correct_answer else ""
        student_solution_section = (
            f"Student's Working / Solution Steps:\n{student_solution}" if student_solution else ""
        )
        ref_solution_section = (
            f"Reference Solution:\n{ref_solution}" if ref_solution else ""
        )

        prompt = f"""You are an experienced, encouraging math tutor reviewing a student's incorrect submission.

Problem:
{problem}

{student_answer_section}
{correct_answer_section}
{student_solution_section}
{ref_solution_section}

Similar worked examples for context:
{similar_context}

Your task is to write detailed, constructive feedback for the student. Structure your response as follows:

1. **What Went Wrong** – Pinpoint the specific error(s) in the student's reasoning or calculation. Be precise about where and why they went off track.

2. **Key Concept to Revisit** – Identify the underlying mathematical concept or technique the student needs to strengthen.

3. **Step-by-Step Guidance** – Walk through how to approach this problem correctly, explaining the reasoning behind each step (do not just state the answer; show the thinking process).

4. **Encouragement** – End with a brief, genuine motivational note tailored to what the student attempted.

Write in clear, friendly language suitable for a student. Avoid being overly brief — depth of explanation is important here."""

        client = OpenAI(api_key=api_key)
        response = client.chat.completions.create(
            model=os.getenv("RAG_HINT_MODEL", "o3"),
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a knowledgeable and patient math tutor. "
                        "Your feedback should be thorough, clear, and genuinely helpful — "
                        "not just a one-liner hint, but a real explanation that helps the student learn."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
            max_completion_tokens=600,
        )

        feedback = response.choices[0].message.content.strip()
        logger.info(f"Generated detailed feedback ({len(feedback)} chars)")
        return feedback

    except Exception as exc:
        logger.exception("generate_wrong_answer_feedback error")
        return f"Error generating feedback: {str(exc)}"
