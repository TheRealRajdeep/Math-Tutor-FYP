import logging
from typing import Dict, Optional, Tuple, List
import json
import os
from dotenv import load_dotenv
from openai import OpenAI

logger = logging.getLogger(__name__)

load_dotenv()

# Model for grading: o3-mini is OpenAI's reasoning model, strong for math
GRADING_MODEL = os.getenv("GRADING_MODEL", "o3-mini")


RELEVANCE_CHECK_MODEL = os.getenv("RELEVANCE_CHECK_MODEL", "gpt-4o-mini")


def check_relevance(student_text: str, problem_text: str) -> Tuple[bool, str]:
    """
    Check if the student's submission is relevant to the problem.
    Returns (is_relevant: bool, reason: str).
    Uses a lightweight model — no need for a heavy reasoning model for this binary decision.
    """
    if not student_text or not student_text.strip():
        return False, "Empty submission"

    try:
        client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        prompt = f"""You are a grading assistant. Determine if the student's submission is an attempt to solve the given problem.

Problem:
{problem_text}

Student Submission (OCR Text):
{student_text}

Task:
1. Analyze if the submission contains mathematical work, numbers, or text related to the problem.
2. Ignore minor OCR errors.
3. If the submission is completely unrelated (e.g., a photo of a cat, a different subject, or a solution to a DIFFERENT math problem), return "is_relevant": false.
4. If it appears to be an attempt at this problem (even if wrong), return "is_relevant": true.

Return valid JSON only: {{ "is_relevant": boolean, "reason": string }}
"""
        logger.info(f"--- Check Relevance Prompt (model: {RELEVANCE_CHECK_MODEL}) ---\n{prompt}\n------------------------------")
        response = client.chat.completions.create(
            model=RELEVANCE_CHECK_MODEL,
            messages=[
                {"role": "system", "content": "You are a precise grading gatekeeper. Respond with valid JSON only."},
                {"role": "user", "content": prompt}
            ],
            response_format={"type": "json_object"}
        )

        result = json.loads(response.choices[0].message.content)
        is_relevant = result.get("is_relevant", False)
        reason = result.get("reason", "No reason provided")
        logger.info(f"Relevance check result: is_relevant={is_relevant}, reason={reason}")
        return is_relevant, reason

    except Exception as e:
        logger.error(f"Relevance check failed: {str(e)}")
        # Fail open — if check errors, assume relevant to avoid silent 0 scores
        return True, "Relevance check error — defaulting to relevant"


def extract_solution_structure(ocr_text: str) -> Dict[str, any]:
    """
    Extract the final answer and solution steps from the OCR text.
    Handle cases where the problem is a proof (no specific final value).
    """
    # If text is extremely short, it's likely not a detailed solution
    if not ocr_text or len(ocr_text.strip()) < 10:
        return {"student_answer": ocr_text or "", "student_steps": [], "is_proof": False}
        
    try:
        client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        prompt = f"""You are a math solution parser. Extract the structure from the student's handwritten solution (OCR text).

OCR Text:
{ocr_text}

Task:
1. Identify if this is a "Proof" question or a "Calculation" question.
2. If Calculation: Identify the "Final Answer" (often boxed, or "Answer:").
3. If Proof: The "Final Answer" should be the conclusion statement (e.g., "Therefore, y is rational" or "Q.E.D.").
4. Identify the "Solution Steps".
5. Convert content to LaTeX where appropriate.
6. **IMPORTANT**: The OCR text may contain multiple pages (marked [Page X]). The pages might be out of order (e.g., Page 2 before Page 1). Please reconstruct the logical flow across pages if necessary.

Return valid JSON only:
{{
  "is_proof": boolean,
  "student_answer": "extracted final answer/conclusion string",
  "student_steps": ["step 1", "step 2", ...]
}}
"""
        logger.info(f"--- Extract Structure Prompt ---\n{prompt}\n------------------------------")
        response = client.chat.completions.create(
            model=GRADING_MODEL,
            messages=[
                {"role": "system", "content": "You are a structural parser for math solutions. Respond with valid JSON only."},
                {"role": "user", "content": prompt}
            ],
            response_format={"type": "json_object"}
        )
        
        result = json.loads(response.choices[0].message.content)
        # Ensure keys exist
        if "is_proof" not in result:
            result["is_proof"] = False
        return result
        
    except Exception as e:
        logger.error(f"Structure extraction failed: {str(e)}")
        # Fallback: treat whole text as steps
        return {"is_proof": False, "student_answer": "", "student_steps": [ocr_text]}


def verify_answer_correctness(student_answer: str, correct_answer: str) -> Dict:
    """
    Verify answer correctness using OpenAI.
    """
    if not student_answer or not correct_answer:
        return {"is_correct": False, "confidence": 0.0, "match_type": "openai", "reasoning": "Missing answer"}
    
    # Use OpenAI for semantic/equivalence checking
    try:
        client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        prompt = f"""You are a math grading assistant. Compare the student's answer with the correct answer.

Student Answer: {student_answer}

Correct Answer: {correct_answer}

Task:
1. Determine if the student's answer is mathematically correct/equivalent to the correct answer.
2. Consider that answers can be in different formats (e.g., fractions vs decimals, different forms of expressions).
3. If this is a PROOF question (where the answer is "See Proof" or similar), check if the student's conclusion statement matches the goal.
4. Return a JSON object with:
   - "is_correct": boolean (true if the answers are mathematically equivalent)
   - "confidence": float (0.0 to 1.0, representing how confident you are)
   - "reasoning": string (brief explanation of your judgment)

Only return valid JSON, no other text."""

        logger.info(f"--- Answer Verification Prompt ---\n{prompt}\n------------------------------")
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
        
        # If confidence is very high (>= 0.85), treat as correct
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
    Verify solution logical flow using OpenAI with Chain of Thought.
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
Evaluate the logical flow and correctness of the student's solution.
Perform a step-by-step consistency check (Chain of Thought).

**IMPORTANT Context**:
- The solution may span multiple pages (marked [Page X]).
- The pages might be out of order. Please reconstruct the correct logical order of pages/steps before evaluating.
- For **Proofs**: Check if the logical argument is sound, even if the student uses a different method than the reference.

1. Go step-by-step through the student's work (reordering pages if needed).
2. For each step, check: Does this strictly follow from the previous line?
3. Identify the *first* line where a logical error occurs.
4. Does the final answer actually derive from the work shown, or does it appear out of nowhere?

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

        logger.info(f"--- Logical Flow Prompt ---\n{prompt}\n------------------------------")
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
