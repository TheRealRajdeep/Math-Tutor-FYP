import logging
from typing import Dict
import json
import os
from dotenv import load_dotenv
from openai import OpenAI

logger = logging.getLogger(__name__)

load_dotenv()

# Model for grading: o3 is OpenAI's reasoning model, strong for math (see https://platform.openai.com/docs/models/o3)
GRADING_MODEL = os.getenv("GRADING_MODEL", "o3")


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
        client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
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
            model=GRADING_MODEL,
            messages=[
                {"role": "system", "content": "You are a precise math grading assistant. Always respond with valid JSON only."},
                {"role": "user", "content": prompt}
            ],
            response_format={"type": "json_object"}  # Force JSON response
        )
        
        result_text = response.choices[0].message.content
        result = json.loads(result_text)
        
        is_correct = result.get("is_correct", False)
        confidence = float(result.get("confidence", 0.0))
        reasoning = result.get("reasoning", "")
        # If confidence is very high (>= 0.85), treat as correct even if OpenAI says false
        # This handles cases where OpenAI is overly strict about format but the math is correct
        if is_correct and confidence >= 0.85:
            is_correct = True
            reasoning = reasoning + " (Marked as correct due to high confidence despite format differences)"
        
        return {
            "is_correct": is_correct,
            "confidence": confidence,
            "match_type": "openai",
            "reasoning": reasoning
        }
        
    except Exception as e:
        logger.error(f"OpenAI answer verification failed: {str(e)}")
        raise RuntimeError(f"Answer verification failed — OpenAI API error: {str(e)}") from e


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
        client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
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
            model=GRADING_MODEL,
            messages=[
                {"role": "system", "content": "You are a precise math grading assistant. Always respond with valid JSON only. Evaluate mathematical solutions fairly, recognizing that multiple valid approaches exist."},
                {"role": "user", "content": prompt}
            ],
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
        logger.error(f"OpenAI logical flow evaluation failed: {str(e)}")
        raise RuntimeError(f"Solution evaluation failed — OpenAI API error: {str(e)}") from e


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
