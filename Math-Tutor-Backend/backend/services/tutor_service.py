# backend/services/tutor_service.py
import os
import logging
import json
from typing import Optional

from sentence_transformers import SentenceTransformer
from dotenv import load_dotenv

from db.db_connection import get_db_connection
from openai import OpenAI

load_dotenv()
logger = logging.getLogger(__name__)

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
    verdict: Optional[str] = None,
    limit: int = 3,
) -> Optional[str]:
    """
    Generate deep, explanatory feedback for a submission.

    verdict can be 'correct' (>=90%), 'partially_correct' (50-90%), or 'incorrect' (<50%).
    Falls back to deriving from is_correct when not provided.
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

        student_answer_section = f"Student's Answer: {student_answer}" if student_answer else ""
        correct_answer_section = f"Correct Answer: {correct_answer}" if correct_answer else ""
        student_solution_section = (
            f"Student's Working / Solution Steps:\n{student_solution}" if student_solution else ""
        )
        ref_solution_section = (
            f"Reference Solution:\n{ref_solution}" if ref_solution else ""
        )
        
        # Resolve the effective verdict
        if verdict is None:
            effective_verdict = "correct" if is_correct else "incorrect"
        else:
            effective_verdict = verdict

        if effective_verdict == "correct":
            verdict_context = "The student's answer is marked as CORRECT (score ≥ 90%)."
            feedback_instructions = """Your task is to write detailed, constructive feedback.

Since the student is CORRECT:
1. **Affirmation**: Confirm they got it right and briefly highlight what they did well.
2. **Deepen Understanding**: Suggest a way to verify the result or mention a related advanced concept.
3. **Challenge**: Briefly pose a "What if…" extension to push their thinking further."""
        elif effective_verdict == "partially_correct":
            verdict_context = "The student's answer is marked as PARTIALLY CORRECT (score between 50–90%): they demonstrated some correct reasoning but made errors that prevented a fully correct solution."
            feedback_instructions = """Your task is to write detailed, constructive feedback.

Since the student is PARTIALLY CORRECT:
1. **What They Got Right**: Acknowledge the correct steps or ideas in their work.
2. **What Went Wrong**: Pinpoint the specific error(s) that caused point deductions.
3. **Key Concept to Review**: Identify the underlying concept or technique they need to strengthen.
4. **Guided Correction**: Walk through how to fix the error and arrive at the correct answer.
5. **Encouragement**: End with a motivational note recognising their partial progress."""
        else:
            verdict_context = "The student's answer is marked as INCORRECT (score < 50%)."
            feedback_instructions = """Your task is to write detailed, constructive feedback.

Since the student is INCORRECT:
1. **What Went Wrong**: Pinpoint the specific error(s) in their approach.
2. **Key Concept**: Identify the underlying concept to revisit.
3. **Guidance**: Walk through the correct approach step-by-step.
4. **Encouragement**: End with a motivational note."""

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

{feedback_instructions}

Write in clear, friendly language suitable for a student. Be thorough."""

        client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        model_name = os.getenv("RAG_HINT_MODEL", "gpt-4o")
        is_reasoning_model = model_name.startswith("o1") or model_name.startswith("o3")
        
        completion_args = {
            "model": model_name,
            "messages": [
                {
                    "role": "system",
                    "content": "You are a knowledgeable and patient math tutor.",
                },
                {"role": "user", "content": prompt},
            ]
        }
        
        if is_reasoning_model:
            completion_args["max_completion_tokens"] = 8000
        else:
            completion_args["max_tokens"] = 1500

        response = client.chat.completions.create(**completion_args)
        feedback = response.choices[0].message.content.strip()
        
        return feedback or "The solution appears incorrect, but I couldn't generate detailed feedback."

    except Exception as exc:
        logger.exception("generate_diagnostic_feedback error")
        return f"Error generating feedback: {str(exc)}"


def generate_tutor_chat_response(student_id: int, query: str) -> str:
    """
    Generate a response for the general AI Tutor chat.
    
    1. Fetches student context (weaknesses, recent error themes).
    2. Performs RAG to find relevant math concepts/problems from omni_math_data.
    3. Enforces strict domain restriction (math/prep only).
    """
    try:
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            return "Configuration Error: OpenAI API key is missing."

        # 1. Fetch Student Context
        conn = get_db_connection()
        context_str = ""
        try:
            cur = conn.cursor()
            
            # Weakest domains
            cur.execute("""
                WITH Stats AS (
                    SELECT TRIM(d.domain) as domain, AVG(gr.percentage) as avg_score
                    FROM grading_results gr
                    JOIN test_submissions ts ON ts.submission_id = gr.submission_id
                    JOIN omni_math_data omd ON omd.problem_id = gr.problem_id
                    JOIN LATERAL unnest(string_to_array(omd.domain, ',')) AS d(domain) ON TRUE
                    WHERE ts.student_id = %s
                    GROUP BY 1
                )
                SELECT domain FROM Stats WHERE avg_score < 60 ORDER BY avg_score ASC LIMIT 3
            """, (str(student_id),))
            weak_domains = [r[0] for r in cur.fetchall()]
            
            # Recent error themes
            cur.execute("""
                SELECT DISTINCT gr.error_summary
                FROM grading_results gr
                JOIN test_submissions ts ON ts.submission_id = gr.submission_id
                WHERE ts.student_id = %s 
                  AND gr.answer_is_correct = FALSE
                  AND gr.error_summary IS NOT NULL
                  AND gr.graded_at >= NOW() - INTERVAL '14 days'
                LIMIT 5
            """, (str(student_id),))
            errors = [r[0] for r in cur.fetchall()]
            
            context_parts = []
            if weak_domains:
                context_parts.append(f"Student's weak domains: {', '.join(weak_domains)}.")
            if errors:
                context_parts.append(f"Recent error patterns: {'; '.join(errors)}.")
            
            context_str = "\n".join(context_parts)
            
            # 2. RAG for Math Context
            model = _get_semantic_model()
            emb = model.encode(query).tolist()
            
            cur.execute("""
                SELECT problem, solution, answer
                FROM omni_math_data
                ORDER BY embedding <-> %s::vector
                LIMIT 2;
            """, (emb,))
            rag_rows = cur.fetchall()
            
            rag_context = ""
            if rag_rows:
                rag_context = "Reference Math Problems:\n" + "\n\n".join(
                    [f"Problem: {r[0]}\nSolution: {r[1]}" for r in rag_rows]
                )

        finally:
            cur.close()
            conn.close()

        # 3. Construct Prompt
        system_prompt = f"""You are an expert Math Olympiad tutor.
Your goal is to help the student prepare for competitions like RMO, USAMO, and IMO.

Student Context:
{context_str}

Reference Material (use if relevant to the query):
{rag_context}

STRICT RULES:
1. **Domain Restriction**: You ONLY answer questions related to mathematics, olympiad preparation, study strategies, specific problems, or the student's performance.
2. **Refusal**: If the user asks about anything else (sports, weather, politics, general chat like "how are you"), politely refuse and steer them back to math.
   - Example Refusal: "I'm here to help you with math. Let's focus on your preparation."
3. **Personalisation**: Use the Student Context to tailor your advice. If they ask "what should I study?", refer to their weak domains.
4. **Tone**: Encouraging, professional, and clear. Use LaTeX for math ($...$).

User Query:
{query}
"""

        client = OpenAI(api_key=api_key)
        response = client.chat.completions.create(
            model=os.getenv("TUTOR_CHAT_MODEL", "gpt-4o"),
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": query}
            ],
            temperature=0.5,
            max_tokens=1000
        )
        
        return response.choices[0].message.content.strip()

    except Exception as e:
        logger.error(f"Tutor chat failed: {str(e)}")
        return "I encountered an error while thinking. Please try asking again."
