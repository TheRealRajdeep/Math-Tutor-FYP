import re
from typing import Dict
import numpy as np
import json
import os
from dotenv import load_dotenv
from openai import OpenAI

from services.embedding_service import generate_embedding

load_dotenv()
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))


def _cosine_sim(a, b) -> float:
    va = np.array(a)
    vb = np.array(b)
    denom = (np.linalg.norm(va) * np.linalg.norm(vb)) or 1e-8
    return float(np.dot(va, vb) / denom)


def _normalize_answer_text(text: str) -> str:
    if not text:
        return ""
    t = text.strip()
    # remove spaces around LaTeX inline markers
    t = t.replace(" ", "")
    # normalize common unicode minus
    t = t.replace("−", "-")
    return t


def verify_answer_correctness(student_answer: str, correct_answer: str) -> Dict:
    """
    Verify answer correctness using OpenAI instead of custom algorithm.
    Uses GPT to compare student answer with correct answer, considering mathematical equivalence.
    """
    if not student_answer or not correct_answer:
        return {"is_correct": False, "confidence": 0.0, "match_type": "openai", "reasoning": "Missing answer"}
    
    # First try exact match after normalization (fast path)
    sa = _normalize_answer_text(student_answer)
    ca = _normalize_answer_text(correct_answer)
    
    if sa and sa == ca:
        return {"is_correct": True, "confidence": 1.0, "match_type": "exact"}
    
    # Use OpenAI for semantic/equivalence checking
    try:
        prompt = f"""You are a math grading assistant. Compare the student's answer with the correct answer.

Student Answer: {student_answer}

Correct Answer: {correct_answer}

Task:
1. Determine if the student's answer is mathematically correct/equivalent to the correct answer.
2. Consider that answers can be in different formats (e.g., fractions vs decimals, different forms of expressions).
3. Return a JSON object with:
   - "is_correct": boolean (true if the answers are mathematically equivalent)
   - "confidence": float (0.0 to 1.0, representing how confident you are)
   - "reasoning": string (brief explanation of your judgment)

Only return valid JSON, no other text."""

        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are a precise math grading assistant. Always respond with valid JSON only."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.0,  # Use 0 temperature for consistent grading
            response_format={"type": "json_object"}  # Force JSON response
        )
        
        result_text = response.choices[0].message.content
        result = json.loads(result_text)
        
        is_correct = result.get("is_correct", False)
        confidence = float(result.get("confidence", 0.0))
        reasoning = result.get("reasoning", "")
        
        # If confidence is very high (>= 0.85), treat as correct even if OpenAI says false
        # This handles cases where OpenAI is overly strict about format but the math is correct
        if not is_correct and confidence >= 0.85:
            is_correct = True
            reasoning = reasoning + " (Marked as correct due to high confidence despite format differences)"
        
        return {
            "is_correct": is_correct,
            "confidence": confidence,
            "match_type": "openai",
            "reasoning": reasoning
        }
        
    except Exception as e:
        # Fallback to semantic similarity if OpenAI fails
        emb_s = generate_embedding(student_answer)
        emb_c = generate_embedding(correct_answer)
        sim = _cosine_sim(emb_s, emb_c)
        return {
            "is_correct": sim >= 0.85,
            "confidence": sim,
            "match_type": "semantic_fallback",
            "error": str(e)
        }


def split_into_steps(solution_text: str):
    if not solution_text:
        return []
    # naive split on newlines or sentence terminators
    parts = re.split(r"\n+|(?<=[\.;:])\s+", solution_text)
    return [p.strip() for p in parts if p and len(p.strip()) > 1]


def verify_solution_logical_flow(student_solution: str, reference_solution: str, correct_answer: str) -> Dict:
    """
    Verify solution logical flow using OpenAI instead of embedding similarity.
    Evaluates whether the student's solution is logically sound, even if it uses
    a different approach than the reference solution.
    """
    if not student_solution or not student_solution.strip():
        return {
            "logical_score": 0.0,
            "step_count": 0,
            "valid_steps": 0,
            "first_error_step_index": 0,
            "error_summary": "No solution steps found",
        }
    
    try:
        prompt = f"""You are a math grading assistant evaluating a student's solution logic.

Student's Solution:
{student_solution}

Reference Solution:
{reference_solution}

Correct Answer: {correct_answer}

Task:
Evaluate the logical flow and correctness of the student's solution. Consider that:
1. Different valid mathematical approaches are acceptable (e.g., using product identities vs complex numbers)
2. The student's solution may use different methods than the reference but still be mathematically correct
3. Focus on whether each logical step is valid and leads toward the correct answer
4. Minor calculation errors should reduce score but not invalidate the entire approach

Return a JSON object with:
- "logical_score": float (0.0 to 1.0, representing overall logical correctness and flow)
- "step_count": integer (estimated number of logical steps in student solution)
- "valid_steps": integer (number of steps that are mathematically valid)
- "first_error_step_index": integer (0-based index of first step with significant error, or -1 if no errors)
- "error_summary": string (brief description of first error found, or null if solution is correct)

The logical_score should be high (>=0.8) if:
- The solution uses a valid mathematical approach
- The logical steps are sound
- It leads to the correct answer (or close approximation)

Only return valid JSON, no other text."""

        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are a precise math grading assistant. Always respond with valid JSON only. Evaluate mathematical solutions fairly, recognizing that multiple valid approaches exist."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.0,  # Use 0 temperature for consistent grading
            response_format={"type": "json_object"}  # Force JSON response
        )
        
        result_text = response.choices[0].message.content
        result = json.loads(result_text)
        
        logical_score = float(result.get("logical_score", 0.0))
        step_count = int(result.get("step_count", 0))
        valid_steps = int(result.get("valid_steps", 0))
        first_error_idx = int(result.get("first_error_step_index", -1))
        error_summary = result.get("error_summary")
        
        # Ensure first_error_step_index is non-negative or 0
        if first_error_idx < 0:
            first_error_idx = 0
            if error_summary:
                error_summary = None  # Clear error if index is -1
        
        return {
            "logical_score": logical_score,
            "step_count": step_count,
            "valid_steps": valid_steps,
            "first_error_step_index": first_error_idx,
            "error_summary": error_summary,
        }
        
    except Exception as e:
        # Fallback to old method if OpenAI fails (but log the error)
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"OpenAI logical flow evaluation failed: {str(e)}, falling back to embedding-based method")
        
        # Fallback to old embedding-based method
        student_steps = split_into_steps(student_solution)
        ref_steps = split_into_steps(reference_solution)

        if not student_steps:
            return {
                "logical_score": 0.0,
                "step_count": 0,
                "valid_steps": 0,
                "first_error_step_index": 0,
                "error_summary": "No solution steps found",
            }

        valid = 0
        first_error = None
        for idx, s in enumerate(student_steps):
            best = 0.0
            for r in ref_steps:
                best = max(best, _cosine_sim(generate_embedding(s), generate_embedding(r)))
            if best >= 0.70:
                valid += 1
            elif first_error is None:
                first_error = idx

        logical_score = valid / max(len(student_steps), 1)
        return {
            "logical_score": float(logical_score),
            "step_count": len(student_steps),
            "valid_steps": valid,
            "first_error_step_index": 0 if first_error is None else int(first_error),
            "error_summary": None if first_error is None else f"Step {first_error+1} deviates from reference",
        }


def calculate_final_score(answer_result: Dict, solution_result: Dict, max_score: float = 1.0) -> Dict:
    answer_correct = 1.0 if answer_result.get("is_correct") else 0.0
    logical_score = float(solution_result.get("logical_score", 0.0))

    if answer_correct >= 0.999:
        answer_weight, solution_weight = 0.4, 0.6
    elif logical_score > 0:
        answer_weight, solution_weight = 0.2, 0.8
    else:
        answer_weight, solution_weight = 0.5, 0.5

    final_score = answer_weight * answer_correct + solution_weight * logical_score
    percentage = max_score * final_score * 100.0
    return {
        "final_score": float(final_score),
        "max_score": float(max_score),
        "percentage": float(percentage),
    }


