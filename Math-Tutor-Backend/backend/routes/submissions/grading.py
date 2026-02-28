# grading.py
import logging
from fastapi import APIRouter, HTTPException
from db.db_connection import get_db_connection

logger = logging.getLogger(__name__)
from services.grading_service import (
    verify_answer_correctness,
    verify_solution_logical_flow,
    calculate_final_score,
)
try:
    from services.tutor_service import generate_wrong_answer_feedback
except Exception:
    def generate_wrong_answer_feedback(problem, student_answer, correct_answer, student_solution, ref_solution, limit=3):
        return None

router = APIRouter()


@router.post("/grade_submission/{submission_id}")
def grade_submission(submission_id: int):
    conn = get_db_connection()
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT ps.problem_id, ps.student_solution, ps.student_answer,
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

                total_percentage = 0.0
                for problem_id, student_solution, student_answer, correct_answer, ref_solution, domain, problem_text in rows:
                    # Prefer structured student_answer, else fallback to extracted OCR solution
                    student_answer = student_answer or student_solution or ""

                    try:
                        ar = verify_answer_correctness(student_answer, correct_answer)
                    except Exception as exc:
                        logger.error(f"verify_answer_correctness failed for submission {submission_id}: {exc}")
                        raise HTTPException(status_code=500, detail=str(exc)) from exc

                    try:
                        sr = verify_solution_logical_flow(student_solution or "", ref_solution or "", correct_answer or "")
                    except Exception as exc:
                        logger.error(f"verify_solution_logical_flow failed for submission {submission_id}: {exc}")
                        raise HTTPException(status_code=500, detail=str(exc)) from exc

                    score = calculate_final_score(ar, sr)

                    hint_provided = None
                    try:
                        is_correct = bool(ar.get("is_correct"))
                        confidence = float(ar.get("confidence", 0.0))
                    except Exception:
                        is_correct = False
                        confidence = 0.0

                    if not is_correct:
                        try:
                            hint_provided = generate_wrong_answer_feedback(
                                problem=problem_text or "",
                                student_answer=student_answer,
                                correct_answer=correct_answer or "",
                                student_solution=student_solution or "",
                                ref_solution=ref_solution or "",
                            )
                        except Exception:
                            hint_provided = None

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
                            score.get("final_score"),
                            score.get("percentage"),
                            None,  # grading_breakdown (optional JSON/text)
                            hint_provided,
                        ),
                    )
                    total_percentage += float(score.get("percentage", 0.0))

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
