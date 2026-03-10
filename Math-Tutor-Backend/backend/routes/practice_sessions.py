import json
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth.deps import get_current_user
from db.db_connection import get_db_connection
from schemas.auth import UserOut
from services.grading_service import (
    calculate_final_score,
    verify_answer_correctness,
    verify_solution_logical_flow,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/practice", tags=["Practice Sessions"])

SESSION_LENGTH = 5      # problems per session
DIFFICULTY_STEP = 0.5
MIN_DIFFICULTY = 1.0
MAX_DIFFICULTY = 10.0

# Module-level flag so we only run CREATE TABLE IF NOT EXISTS once per process
_table_ensured = False


def _ensure_table(conn) -> None:
    global _table_ensured
    if _table_ensured:
        return
    with conn.cursor() as cur:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS practice_sessions (
                session_id       SERIAL PRIMARY KEY,
                student_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                mock_test_id     INTEGER REFERENCES mock_tests(test_id),
                domain           TEXT NOT NULL,
                current_difficulty FLOAT NOT NULL DEFAULT 3.0,
                problems_attempted INTEGER NOT NULL DEFAULT 0,
                problems_correct   INTEGER NOT NULL DEFAULT 0,
                status           TEXT NOT NULL DEFAULT 'active',
                session_problems JSONB NOT NULL DEFAULT '[]'::jsonb,
                current_problem_id INTEGER,
                started_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                completed_at     TIMESTAMPTZ
            )
        """)
    conn.commit()
    _table_ensured = True


def _pick_problem(cur, domain: str, difficulty: float, excluded_ids: list) -> Optional[dict]:
    """
    Pick one problem from omni_math_data closest to `difficulty` in `domain`,
    skipping any problem_id in `excluded_ids`.
    Falls back to a wider search if nothing found in ±1.5 difficulty window.
    """
    clean = domain.strip('[]"')

    def _query(extra_where: str, params: tuple):
        cur.execute(f"""
            SELECT problem_id, domain, problem, solution, answer, difficulty_level
            FROM omni_math_data
            WHERE domain ILIKE %s
              AND difficulty_level BETWEEN %s AND %s
              {extra_where}
            ORDER BY ABS(difficulty_level - %s), RANDOM()
            LIMIT 1
        """, params)
        return cur.fetchone()

    def _fallback(extra_where: str, params: tuple):
        cur.execute(f"""
            SELECT problem_id, domain, problem, solution, answer, difficulty_level
            FROM omni_math_data
            WHERE domain ILIKE %s
              {extra_where}
            ORDER BY ABS(difficulty_level - %s), RANDOM()
            LIMIT 1
        """, params)
        return cur.fetchone()

    lo, hi = difficulty - 1.0, difficulty + 1.5
    if excluded_ids:
        row = _query("AND problem_id != ALL(%s)", (f"%{clean}%", lo, hi, excluded_ids, difficulty))
        if not row:
            row = _fallback("AND problem_id != ALL(%s)", (f"%{clean}%", excluded_ids, difficulty))
    else:
        row = _query("", (f"%{clean}%", lo, hi, difficulty))
        if not row:
            row = _fallback("", (f"%{clean}%", difficulty))

    if not row:
        return None
    return {
        "problem_id": row[0],
        "domain": row[1],
        "problem": row[2],
        "solution": row[3],
        "answer": row[4],
        "difficulty_level": float(row[5]) if row[5] else difficulty,
    }


def get_verdict(percentage: float) -> str:
    """Map a percentage score to a three-state verdict string."""
    if percentage >= 90:
        return "correct"
    if percentage >= 50:
        return "partially_correct"
    return "incorrect"


def _adaptive_params(percentage: float, difficulty: float) -> tuple[str, str, float]:
    """Return (decision, feedback_message, next_difficulty) given a score."""
    if percentage >= 80:
        return (
            "harder",
            "Excellent! Moving you to a harder problem.",
            min(MAX_DIFFICULTY, difficulty + DIFFICULTY_STEP),
        )
    if percentage >= 50:
        return (
            "same",
            "Good effort — keeping the same difficulty.",
            difficulty,
        )
    return (
        "easier",
        "Let's try a slightly easier one to build your confidence.",
        max(MIN_DIFFICULTY, difficulty - DIFFICULTY_STEP),
    )


# ─── Pydantic request bodies ──────────────────────────────────────────────────

class StartRequest(BaseModel):
    domain: str


class GradeRequest(BaseModel):
    submission_id: int


# ─── Endpoints ───────────────────────────────────────────────────────────────

@router.post("/session/start")
def start_session(body: StartRequest, current_user: UserOut = Depends(get_current_user)):
    """
    Start a new adaptive practice session for a domain.

    Starting difficulty is inferred from the student's historical avg score in
    that domain (lower avg → easier start). Returns session metadata + first problem.
    """
    conn = get_db_connection()
    try:
        _ensure_table(conn)
        cur = conn.cursor()

        # ── infer starting difficulty from history ──────────────────────────
        cur.execute("""
            SELECT AVG(gr.percentage)
            FROM grading_results gr
            JOIN test_submissions ts ON ts.submission_id = gr.submission_id
            JOIN omni_math_data omd ON omd.problem_id = gr.problem_id
            WHERE ts.student_id = %s AND omd.domain ILIKE %s
        """, (str(current_user.id), f"%{body.domain}%"))

        row = cur.fetchone()
        if row and row[0] is not None:
            # Map 0-100 score → 1-6 difficulty (low score ⟹ easier start)
            start_diff = max(MIN_DIFFICULTY, min(6.0, float(row[0]) * 0.06))
        else:
            start_diff = 3.0

        # ── get (or create) the student's Practice Session mock_test ────────
        cur.execute("""
            SELECT test_id FROM mock_tests
            WHERE student_id = %s AND test_type = 'Practice Session'
            LIMIT 1
        """, (current_user.id,))
        mt = cur.fetchone()

        if mt:
            mock_test_id = mt[0]
        else:
            cur.execute("""
                INSERT INTO mock_tests (test_type, student_id, problems, status)
                VALUES ('Practice Session', %s, '[]'::jsonb, 'in_progress')
                RETURNING test_id
            """, (current_user.id,))
            mock_test_id = cur.fetchone()[0]

        # ── pick first problem ──────────────────────────────────────────────
        first = _pick_problem(cur, body.domain, start_diff, [])
        if not first:
            raise HTTPException(404, f"No problems found for domain: {body.domain}")

        # ── create session row ──────────────────────────────────────────────
        cur.execute("""
            INSERT INTO practice_sessions
                (student_id, mock_test_id, domain, current_difficulty, current_problem_id)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING session_id
        """, (current_user.id, mock_test_id, body.domain, start_diff, first["problem_id"]))
        session_id = cur.fetchone()[0]
        conn.commit()

        return {
            "session_id": session_id,
            "mock_test_id": mock_test_id,
            "domain": body.domain,
            "current_problem": first,
            "session_state": {
                "problems_attempted": 0,
                "problems_correct": 0,
                "target": SESSION_LENGTH,
                "current_difficulty": round(start_diff, 1),
                "status": "active",
            },
        }
    finally:
        conn.close()


@router.get("/session/{session_id}")
def get_session(session_id: int, current_user: UserOut = Depends(get_current_user)):
    """Return current session state and the active problem (if session is still active)."""
    conn = get_db_connection()
    try:
        _ensure_table(conn)
        cur = conn.cursor()

        cur.execute("""
            SELECT session_id, mock_test_id, domain, current_difficulty,
                   problems_attempted, problems_correct, status,
                   session_problems, current_problem_id
            FROM practice_sessions
            WHERE session_id = %s AND student_id = %s
        """, (session_id, current_user.id))

        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Session not found")

        sid, mt_id, domain, diff, attempted, correct, status, sp_raw, cur_pid = row
        sp = sp_raw if isinstance(sp_raw, list) else json.loads(sp_raw or "[]")

        current_problem = None
        if cur_pid and status == "active":
            cur.execute("""
                SELECT problem_id, domain, problem, solution, answer, difficulty_level
                FROM omni_math_data WHERE problem_id = %s
            """, (cur_pid,))
            p = cur.fetchone()
            if p:
                current_problem = {
                    "problem_id": p[0], "domain": p[1], "problem": p[2],
                    "solution": p[3], "answer": p[4],
                    "difficulty_level": float(p[5] or diff),
                }

        return {
            "session_id": sid,
            "mock_test_id": mt_id,
            "domain": domain,
            "current_problem": current_problem,
            "session_state": {
                "problems_attempted": attempted,
                "problems_correct": correct,
                "target": SESSION_LENGTH,
                "current_difficulty": round(float(diff), 1),
                "status": status,
                "session_problems": sp,
            },
        }
    finally:
        conn.close()


@router.post("/session/{session_id}/grade")
def grade_session_problem(
    session_id: int,
    body: GradeRequest,
    current_user: UserOut = Depends(get_current_user),
):
    """
    Grade the current practice problem.

    1. Runs the full grading pipeline (answer + logic).
    2. Stores result in grading_results (feeds into Pillar 1 analytics).
    3. Applies adaptive difficulty: up on ≥80%, down on <50%.
    4. Picks the next problem or marks session complete after SESSION_LENGTH attempts.
    """
    conn = get_db_connection()
    try:
        _ensure_table(conn)
        cur = conn.cursor()

        # ── fetch session ───────────────────────────────────────────────────
        cur.execute("""
            SELECT domain, current_difficulty, problems_attempted, problems_correct,
                   status, session_problems, current_problem_id
            FROM practice_sessions
            WHERE session_id = %s AND student_id = %s
        """, (session_id, current_user.id))

        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Session not found")

        domain, diff, attempted, correct, status, sp_raw, cur_pid = row
        if status != "active":
            raise HTTPException(400, "Session is already completed")

        sp = sp_raw if isinstance(sp_raw, list) else json.loads(sp_raw or "[]")

        # ── fetch submission ────────────────────────────────────────────────
        cur.execute("""
            SELECT ps.student_solution, ps.student_answer,
                   omd.answer, omd.solution
            FROM problem_submissions ps
            JOIN omni_math_data omd ON omd.problem_id = ps.problem_id
            WHERE ps.submission_id = %s AND ps.problem_id = %s
        """, (body.submission_id, cur_pid))

        sub = cur.fetchone()
        if not sub:
            raise HTTPException(
                404,
                "No submission found for the current problem. "
                "Upload your solution images first."
            )

        student_solution, student_answer, correct_answer, ref_solution = sub
        student_answer = student_answer or student_solution or ""

        # ── run grading pipeline ────────────────────────────────────────────
        ar = verify_answer_correctness(student_answer, correct_answer or "")
        sr = verify_solution_logical_flow(
            student_solution or "", ref_solution or "", correct_answer or ""
        )
        score_data = calculate_final_score(ar, sr)

        percentage = float(score_data.get("percentage", 0.0))
        logical_score = float(sr.get("logical_score", 0.0))
        error_summary = sr.get("error_summary")
        verdict = get_verdict(percentage)
        # Only count as correct when the score meets the strict threshold (>=90%)
        is_correct = verdict == "correct"

        # ── persist grading result (feeds analytics) ────────────────────────
        cur.execute("""
            SELECT result_id FROM grading_results
            WHERE submission_id = %s AND problem_id = %s
        """, (body.submission_id, cur_pid))

        if not cur.fetchone():
            cur.execute("""
                INSERT INTO grading_results (
                    submission_id, problem_id, answer_correctness, answer_is_correct,
                    logical_flow_score, first_error_step_index, error_summary,
                    final_score, percentage, grading_breakdown
                ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            """, (
                body.submission_id, cur_pid,
                ar.get("confidence"), is_correct,
                logical_score,
                sr.get("first_error_step_index"),
                error_summary,
                score_data.get("final_score"),
                percentage,
                None,
            ))

        # ── adaptive difficulty + session progress ──────────────────────────
        decision, feedback_msg, next_diff = _adaptive_params(percentage, float(diff))

        new_attempted = attempted + 1
        new_correct = correct + (1 if is_correct else 0)
        sp.append({
            "problem_id": cur_pid,
            "score": round(percentage, 1),
            "is_correct": is_correct,
            "difficulty": round(float(diff), 1),
        })

        session_complete = new_attempted >= SESSION_LENGTH
        next_problem = None

        if session_complete:
            cur.execute("""
                UPDATE practice_sessions
                SET problems_attempted = %s, problems_correct = %s,
                    status = 'completed', session_problems = %s::jsonb,
                    current_problem_id = NULL, completed_at = NOW()
                WHERE session_id = %s
            """, (new_attempted, new_correct, json.dumps(sp), session_id))
        else:
            excluded = [p["problem_id"] for p in sp]
            next_problem = _pick_problem(cur, domain, next_diff, excluded)
            cur.execute("""
                UPDATE practice_sessions
                SET problems_attempted = %s, problems_correct = %s,
                    current_difficulty = %s, session_problems = %s::jsonb,
                    current_problem_id = %s
                WHERE session_id = %s
            """, (
                new_attempted, new_correct,
                next_diff, json.dumps(sp),
                next_problem["problem_id"] if next_problem else None,
                session_id,
            ))

        conn.commit()

        # Generate rich feedback for any score below 100%
        hint_provided = None
        try:
            from services.tutor_service import generate_diagnostic_feedback

            cur.execute(
                "SELECT problem, solution FROM omni_math_data WHERE problem_id = %s",
                (cur_pid,),
            )
            prob_row = cur.fetchone()
            problem_text = prob_row[0] if prob_row else ""
            ref_sol = prob_row[1] if prob_row else ""

            hint_provided = generate_diagnostic_feedback(
                problem=problem_text,
                student_answer=student_answer,
                correct_answer=correct_answer or "",
                student_solution=student_solution or "",
                ref_solution=ref_sol,
                is_correct=is_correct,
                verdict=verdict,
            )
        except Exception as _fb_err:
            logger.warning(f"Practice feedback generation failed: {_fb_err}")

        return {
            "score": {
                "percentage": round(percentage, 1),
                "is_correct": is_correct,
                "verdict": verdict,
                "logical_flow_score": round(logical_score, 3),
                "error_summary": error_summary,
                "answer_reasoning": ar.get("reasoning"),
                "hint_provided": hint_provided,
            },
            "decision": decision,
            "feedback_message": feedback_msg,
            "next_difficulty": round(float(next_diff), 1),
            "session_complete": session_complete,
            "problems_attempted": new_attempted,
            "problems_correct": new_correct,
            "next_problem": next_problem,
        }
    finally:
        conn.close()


@router.get("/sessions")
def get_my_sessions(
    limit: int = 5,
    current_user: UserOut = Depends(get_current_user),
):
    """Return the student's most recent practice sessions."""
    conn = get_db_connection()
    try:
        _ensure_table(conn)
        cur = conn.cursor()
        cur.execute("""
            SELECT session_id, domain, problems_attempted, problems_correct,
                   current_difficulty, status, started_at, completed_at
            FROM practice_sessions
            WHERE student_id = %s
            ORDER BY started_at DESC
            LIMIT %s
        """, (current_user.id, limit))

        return [
            {
                "session_id": r[0],
                "domain": r[1],
                "problems_attempted": r[2],
                "problems_correct": r[3],
                "current_difficulty": round(float(r[4]), 1),
                "status": r[5],
                "started_at": r[6].isoformat() if r[6] else None,
                "completed_at": r[7].isoformat() if r[7] else None,
                "accuracy": round((r[3] / r[2] * 100) if r[2] else 0.0, 1),
            }
            for r in cur.fetchall()
        ]
    finally:
        conn.close()
