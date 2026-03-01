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
    return generate_diagnostic_feedback(
        problem=query,
        student_answer="",
        correct_answer="",
        student_solution=query,
        ref_solution="",
        is_correct=False,
        limit=limit,
    )


def generate_diagnostic_feedback(
    problem: str,
    student_answer: str,
    correct_answer: str,
    student_solution: str,
    ref_solution: str,
    is_correct: bool = False,
    limit: int = 3,
) -> Optional[str]:
    """
    Generate deep, explanatory feedback for a submission.
    
    The feedback handles three scenarios:
    - Correct: Reinforces why it's correct and suggests advanced insights.
    - Partial/Lucky: Points out logical flaws despite the correct answer.
    - Incorrect: Identifies errors and explains the correct reasoning.
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
        
        verdict_context = "The student's answer is marked as CORRECT." if is_correct else "The student's answer is marked as INCORRECT."

        prompt = f"""You are an experienced, encouraging math tutor reviewing a student's submission.
{verdict_context}

Problem:
{problem}

{student_answer_section}
{correct_answer_section}
{student_solution_section}
{ref_solution_section}

Similar worked examples for context:
{similar_context}

Your task is to write detailed, constructive feedback.

If the student is CORRECT:
1. **Affirmation**: Confirm they got it right and briefly mention what they did well.
2. **Deepen Understanding**: Suggest a way to verify the result or mention a related advanced concept (optional).
3. **Challenge**: Briefly ask "What if..." to push their thinking (e.g., "What if the angle was negative?").

If the student is INCORRECT:
1. **What Went Wrong**: Pinpoint the specific error(s) in the student's reasoning or calculation.
2. **Key Concept**: Identify the underlying concept to revisit.
3. **Guidance**: Walk through the correct approach step-by-step (show the thinking, not just the answer).
4. **Encouragement**: End with a motivational note.

Write in clear, friendly language suitable for a student. Be thorough."""

        logger.info(f"--- Tutor Feedback Prompt ---\n{prompt}\n------------------------------")

        client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        # Check if model starts with o1 or o3 to determine token parameter
        model_name = os.getenv("RAG_HINT_MODEL", "gpt-4o")
        is_reasoning_model = model_name.startswith("o1") or model_name.startswith("o3")
        
        completion_args = {
            "model": model_name,
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "You are a knowledgeable and patient math tutor. "
                        "Your feedback should be thorough, clear, and genuinely helpful."
                    ),
                },
                {"role": "user", "content": prompt},
            ]
        }
        
        if is_reasoning_model:
            # o1/o3 models share the max_completion_tokens budget between
            # internal reasoning tokens and visible output tokens.
            # 1000 is almost entirely consumed by reasoning, leaving nothing
            # for the actual response.  Use a much larger ceiling so the model
            # has room to think AND write a full feedback paragraph.
            completion_args["max_completion_tokens"] = 8000
        else:
            completion_args["max_tokens"] = 1500

        response = client.chat.completions.create(**completion_args)

        feedback = response.choices[0].message.content.strip()
        
        if not feedback:
            logger.warning("Feedback generation returned empty string.")
            return "The solution appears incorrect, but I couldn't generate detailed feedback. Please review the reference solution and comparing your steps."
            
        logger.info(f"Generated detailed feedback ({len(feedback)} chars)")
        return feedback

    except Exception as exc:
        logger.exception("generate_diagnostic_feedback error")
        return f"Error generating feedback: {str(exc)}"
