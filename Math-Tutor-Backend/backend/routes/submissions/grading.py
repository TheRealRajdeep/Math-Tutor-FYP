# grading.py
import logging
from fastapi import APIRouter, HTTPException
from db.db_connection import get_db_connection
from typing import Optional

logger = logging.getLogger(__name__)
from services.grading_service import (
    verify_answer_correctness,
    verify_solution_logical_flow,
    check_relevance,
    extract_solution_structure,
)
try:
    from services.tutor_service import generate_diagnostic_feedback
except ImportError:
    # Fallback if rename hasn't propagated or for some reason fails
    from services.tutor_service import generate_wrong_answer_feedback as generate_diagnostic_feedback

router = APIRouter()


@router.post("/grade_submission/{submission_id}")
def grade_submission(submission_id: int, problem_id: Optional[int] = None):
    conn = get_db_connection()
    try:
        with conn:
            with conn.cursor() as cur:
                if problem_id:
                    # Strict Pipeline: Grade only the specific problem requested
                    cur.execute(
                        """
                        SELECT ps.problem_id, ps.ocr_text, ps.student_solution, ps.student_answer,
                               oml.answer, oml.solution, oml.domain, oml.problem
                        FROM problem_submissions ps
                        JOIN omni_math_data oml ON oml.problem_id = ps.problem_id
                        WHERE ps.submission_id = %s AND ps.problem_id = %s
                        """,
                        (submission_id, problem_id),
                    )
                else:
                    # Fallback: Grade all problems in submission (legacy behavior)
                    cur.execute(
                        """
                        SELECT ps.problem_id, ps.ocr_text, ps.student_solution, ps.student_answer,
                               oml.answer, oml.solution, oml.domain, oml.problem
                        FROM problem_submissions ps
                        JOIN omni_math_data oml ON oml.problem_id = ps.problem_id
                        WHERE ps.submission_id = %s
                        """,
                        (submission_id,),
                    )
                
                rows = cur.fetchall()
                if not rows:
                    raise HTTPException(status_code=404, detail="No problem submissions found")

                # Wipe ALL previous grading results for this submission up front.
                # Because practice submissions reuse the same submission_id for the same
                # student, old results from previous problems would otherwise linger in
                # the table and be returned alongside the new result, causing the wrong
                # problem's verdict to appear in the UI.
                cur.execute(
                    "DELETE FROM grading_results WHERE submission_id = %s",
                    (submission_id,),
                )

                total_percentage = 0.0
                for row in rows:
                    problem_id, ocr_text, student_solution, student_answer, correct_answer, ref_solution, domain, problem_text = row
                    
                    # 1. Relevance Check (Gatekeeper)
                    # Use ocr_text if available, else fallback to student_solution
                    text_to_check = ocr_text or student_solution or ""

                    is_relevant, relevance_reason = check_relevance(text_to_check, problem_text)

                    if not is_relevant:
                        logger.info(
                            f"Submission {submission_id} problem {problem_id} flagged as irrelevant. "
                            f"Reason: {relevance_reason}"
                        )
                        irrelevance_feedback = (
                            f"Your submission does not appear to be an attempt at the assigned problem. "
                            f"Reason: {relevance_reason}"
                        )

                        cur.execute(
                            """
                            INSERT INTO grading_results (
                                submission_id, problem_id,
                                answer_correctness, answer_is_correct,
                                logical_flow_score, first_error_step_index, error_summary,
                                final_score, percentage, grading_breakdown,
                                hint_provided
                            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                            """,
                            (
                                submission_id, problem_id,
                                0.0, False, 0.0, 0, f"Submission irrelevant: {relevance_reason}",
                                0.0, 0.0, None,
                                irrelevance_feedback,
                            )
                        )
                        continue

                    # 2. Structure Extraction
                    is_proof = False
                    # If we have raw OCR text, use it to split steps vs answer
                    if ocr_text:
                        structure = extract_solution_structure(ocr_text)
                        structured_answer = structure.get("student_answer", "")
                        structured_steps = "\n".join(structure.get("student_steps", []))
                        is_proof = structure.get("is_proof", False)
                    else:
                        structured_answer = student_answer or ""
                        structured_steps = student_solution or ""
                    
                    # Heuristic: Check for proof keywords in problem text if extraction didn't flag it
                    if not is_proof and problem_text:
                        lower_prob = problem_text.lower()
                        if any(k in lower_prob for k in ["prove", "show that", "demonstrate"]):
                            is_proof = True

                    # 3. Answer Verification
                    if is_proof:
                        # For proofs, "Final Answer" verification is less strict or N/A.
                        # We assume correct if logic is sound.
                        ar = {"is_correct": True, "confidence": 1.0, "match_type": "proof_bypass"}
                    else:
                        try:
                            ar = verify_answer_correctness(structured_answer, correct_answer)
                        except Exception as exc:
                            logger.error(f"verify_answer_correctness failed for submission {submission_id}: {exc}")
                            # Fallback to safe defaults
                            ar = {"is_correct": False, "confidence": 0.0}

                    # 4. Logical Flow Verification
                    try:
                        sr = verify_solution_logical_flow(structured_steps, ref_solution or "", correct_answer or "")
                    except Exception as exc:
                        logger.error(f"verify_solution_logical_flow failed for submission {submission_id}: {exc}")
                        sr = {"logical_score": 0.0, "step_count": 0, "valid_steps": 0, "first_error_step_index": 0, "error_summary": "Evaluation failed"}

                    # 5. Waterfall Scoring Logic
                    answer_correct = ar.get("is_correct", False)
                    logic_score = float(sr.get("logical_score", 0.0))
                    
                    percentage = 0.0
                    
                    if is_proof:
                        # For proofs, logic score is the main driver
                        if logic_score >= 0.8:
                            percentage = 100.0
                            answer_correct = True # override if it was somehow false
                        elif logic_score >= 0.5:
                            percentage = 75.0
                            answer_correct = True
                        elif logic_score >= 0.3:
                            percentage = 40.0
                            answer_correct = False # Treat low logic proof as incorrect
                        else:
                            percentage = 0.0
                            answer_correct = False
                    elif answer_correct:
                        if logic_score >= 0.7:
                            # High confidence correct
                            percentage = 100.0
                        elif logic_score >= 0.4:
                            # Correct answer, shaky logic
                            percentage = 80.0
                        else:
                            # Correct answer, bad/missing logic (Lucky guess?)
                            percentage = 40.0
                    else:
                        if logic_score >= 0.8:
                            # Wrong answer, but great logic (calculation error?)
                            percentage = 60.0
                        elif logic_score >= 0.4:
                            # Wrong answer, some valid steps
                            percentage = 30.0
                        else:
                            # Wrong answer, bad logic
                            percentage = 0.0
                            
                    final_score = percentage / 100.0

                    # 6. Feedback Generation (Always)
                    try:
                        hint_provided = generate_diagnostic_feedback(
                            problem=problem_text or "",
                            student_answer=structured_answer,
                            correct_answer=correct_answer or "",
                            student_solution=structured_steps,
                            ref_solution=ref_solution or "",
                            is_correct=answer_correct, # Pass the boolean verdict
                        )
                    except Exception as e:
                        logger.error(f"Feedback generation failed: {e}")
                        hint_provided = "Could not generate feedback at this time."

                    cur.execute(
                        """
                        INSERT INTO grading_results (
                            submission_id, problem_id,
                            answer_correctness, answer_is_correct,
                            logical_flow_score, first_error_step_index, error_summary,
                            final_score, percentage, grading_breakdown,
                            hint_provided
                        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                        RETURNING result_id
                        """,
                        (
                            submission_id,
                            problem_id,
                            ar.get("confidence"),
                            ar.get("is_correct"),
                            sr.get("logical_score"),
                            sr.get("first_error_step_index"),
                            sr.get("error_summary"),
                            final_score,
                            percentage,
                            None,
                            hint_provided,
                        ),
                    )
                    total_percentage += percentage

                cur.execute(
                    "UPDATE test_submissions SET status='graded' WHERE submission_id=%s",
                    (submission_id,),
                )

        return {"submission_id": submission_id, "message": "Grading completed"}
    finally:
        conn.close()


@router.get("/submission/{submission_id}/results")
def get_results(submission_id: int):
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT gr.problem_id, gr.answer_is_correct, gr.answer_correctness,
                       gr.logical_flow_score, gr.percentage, gr.first_error_step_index, gr.error_summary,
                       gr.hint_provided, gr.final_score
                FROM grading_results gr
                WHERE gr.submission_id = %s
                ORDER BY gr.problem_id
                """,
                (submission_id,),
            )
            rows = cur.fetchall()
        return [
            {
                "problem_id": r[0],
                "answer_is_correct": r[1],
                "answer_confidence": r[2],
                "logical_flow_score": r[3],
                "percentage": r[4],
                "first_error_step_index": r[5],
                "error_summary": r[6],
                "hint_provided": r[7],
                "final_score": r[8],
            }
            for r in rows
        ]
    finally:
        conn.close()
