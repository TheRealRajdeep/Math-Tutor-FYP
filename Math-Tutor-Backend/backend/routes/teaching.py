import json
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from auth.deps import get_current_user
from db.db_connection import get_db_connection
from schemas.auth import UserOut
from services.teaching_service import (
    MAX_RETRIES,
    evaluate_student_response,
    generate_lesson_plan,
    generate_reexplanation,
    is_interactive,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/teach", tags=["Teaching"])

# Suggested topics per domain shown in the UI topic picker
TOPIC_SUGGESTIONS: dict[str, list[str]] = {
    "Algebra": [
        "AM-GM Inequality",
        "Cauchy-Schwarz Inequality",
        "Polynomial Roots & Vieta's Formulas",
        "Solving Functional Equations",
        "Algebraic Inequalities",
    ],
    "Geometry": [
        "Angle Chasing",
        "Similar Triangles",
        "Circle Theorems & Power of a Point",
        "Trigonometric Identities in Geometry",
        "Coordinate Geometry Techniques",
    ],
    "Number Theory": [
        "Modular Arithmetic",
        "Euler's Theorem & Fermat's Little Theorem",
        "GCD, LCM & Bezout's Identity",
        "Diophantine Equations",
        "Chinese Remainder Theorem",
    ],
    "Combinatorics": [
        "Counting Principles & Bijections",
        "Pigeonhole Principle",
        "Inclusion-Exclusion Principle",
        "Stars and Bars",
        "Recursion & Generating Functions",
    ],
}

_table_ensured = False


def _ensure_table(conn) -> None:
    global _table_ensured
    if _table_ensured:
        return
    with conn.cursor() as cur:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS teaching_sessions (
                session_id   SERIAL PRIMARY KEY,
                student_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                topic        TEXT NOT NULL,
                domain       TEXT NOT NULL,
                lesson_plan  JSONB NOT NULL DEFAULT '[]'::jsonb,
                current_step INTEGER NOT NULL DEFAULT 0,
                retry_count  INTEGER NOT NULL DEFAULT 0,
                completed    BOOLEAN NOT NULL DEFAULT FALSE,
                created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                completed_at TIMESTAMPTZ
            )
        """)
    conn.commit()
    _table_ensured = True


def _load_session(cur, session_id: int, student_id: int) -> dict:
    cur.execute("""
        SELECT session_id, topic, domain, lesson_plan,
               current_step, retry_count, completed
        FROM teaching_sessions
        WHERE session_id = %s AND student_id = %s
    """, (session_id, student_id))
    row = cur.fetchone()
    if not row:
        raise HTTPException(404, "Session not found")
    sid, topic, domain, lp_raw, step_idx, retries, completed = row
    plan = lp_raw if isinstance(lp_raw, list) else json.loads(lp_raw or "[]")
    return {
        "session_id":   sid,
        "topic":        topic,
        "domain":       domain,
        "lesson_plan":  plan,
        "current_step": step_idx,
        "retry_count":  retries,
        "completed":    completed,
    }


def _session_response(session: dict) -> dict:
    """Shape the session dict into the API response body."""
    plan = session["lesson_plan"]
    idx  = session["current_step"]
    current_step = plan[idx] if idx < len(plan) else None
    return {
        "session_id":    session["session_id"],
        "topic":         session["topic"],
        "domain":        session["domain"],
        "total_steps":   len(plan),
        "current_step":  current_step,
        "current_step_index": idx,
        "completed":     session["completed"],
        "retry_count":   session["retry_count"],
        "steps_overview": [
            {
                "step_index": s["step_index"],
                "type":       s["type"],
                "title":      s["title"],
                "status":     s.get("status", "pending"),
            }
            for s in plan
        ],
    }


# ─── Pydantic models ──────────────────────────────────────────────────────────

class StartRequest(BaseModel):
    topic: str
    domain: str


class AdvanceRequest(BaseModel):
    student_response: str = ""


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/topics")
def get_topic_suggestions():
    """Return the curated topic list per domain for the UI picker."""
    return TOPIC_SUGGESTIONS


@router.post("/session/start")
def start_teaching_session(
    body: StartRequest,
    current_user: UserOut = Depends(get_current_user),
):
    """
    Start a new teaching session on `topic` within `domain`.

    GPT-4o generates a 5-6 step lesson plan (intro → examples → practice →
    checkpoint → summary).  Returns the session metadata and the first step.
    """
    if not body.topic.strip():
        raise HTTPException(400, "Topic cannot be empty")

    conn = get_db_connection()
    try:
        _ensure_table(conn)

        # Generate lesson plan (may take a few seconds)
        steps = generate_lesson_plan(body.topic.strip(), body.domain.strip())
        if not steps:
            raise HTTPException(500, "Could not generate lesson plan — try a different topic")

        cur = conn.cursor()
        cur.execute("""
            INSERT INTO teaching_sessions (student_id, topic, domain, lesson_plan)
            VALUES (%s, %s, %s, %s::jsonb)
            RETURNING session_id
        """, (current_user.id, body.topic.strip(), body.domain.strip(), json.dumps(steps)))
        session_id = cur.fetchone()[0]
        conn.commit()

        session = {
            "session_id":   session_id,
            "topic":        body.topic.strip(),
            "domain":       body.domain.strip(),
            "lesson_plan":  steps,
            "current_step": 0,
            "retry_count":  0,
            "completed":    False,
        }
        return _session_response(session)

    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("start_teaching_session failed")
        raise HTTPException(500, f"Error starting session: {exc}")
    finally:
        conn.close()


@router.get("/session/{session_id}")
def get_teaching_session(
    session_id: int,
    current_user: UserOut = Depends(get_current_user),
):
    """Return the current state of a teaching session."""
    conn = get_db_connection()
    try:
        _ensure_table(conn)
        cur = conn.cursor()
        session = _load_session(cur, session_id, current_user.id)
        return _session_response(session)
    finally:
        conn.close()


@router.post("/session/{session_id}/advance")
def advance_session(
    session_id: int,
    body: AdvanceRequest,
    current_user: UserOut = Depends(get_current_user),
):
    """
    Advance the lesson by one step.

    For non-interactive steps (intro / example / summary):
      - Marks the step complete and returns the next step immediately.

    For interactive steps (practice / checkpoint):
      - Evaluates `student_response` via GPT-4o-mini.
      - Correct → marks step complete, advances.
      - Wrong (< MAX_RETRIES attempts) → increments retry_count, returns
        an alternative explanation and the same step again.
      - Wrong (≥ MAX_RETRIES) → auto-advances with the correct answer shown.

    Returns:
      {
        evaluation:         {is_correct, feedback, hint} | null,
        reexplanation:      str | null,
        step_result:        "passed" | "failed" | "skipped" | "continued",
        next_step:          step_dict | null,
        current_step_index: int,
        session_complete:   bool,
      }
    """
    conn = get_db_connection()
    try:
        _ensure_table(conn)
        cur = conn.cursor()
        session = _load_session(cur, session_id, current_user.id)

        if session["completed"]:
            raise HTTPException(400, "Session is already completed")

        plan     = session["lesson_plan"]
        idx      = session["current_step"]
        retries  = session["retry_count"]
        step     = plan[idx]

        evaluation    = None
        reexplanation = None
        step_result   = "continued"
        advance       = True

        if is_interactive(step):
            evaluation = evaluate_student_response(step, body.student_response)

            if evaluation["is_correct"]:
                step_result = "passed"
                retries = 0
            else:
                retries += 1
                if retries <= MAX_RETRIES:
                    # Give another chance — re-explain
                    step_result   = "failed"
                    reexplanation = generate_reexplanation(step, body.student_response, retries)
                    advance = False
                else:
                    # Auto-advance after too many retries
                    step_result = "skipped"
                    retries = 0
        else:
            step_result = "continued"

        # Mark current step as done in the plan
        plan[idx]["status"] = "completed" if step_result in ("passed", "continued") else (
            "skipped" if step_result == "skipped" else "pending"
        )

        if advance:
            idx += 1

        session_complete = idx >= len(plan)
        next_step = plan[idx] if not session_complete else None

        # Persist
        if session_complete:
            cur.execute("""
                UPDATE teaching_sessions
                SET current_step = %s, retry_count = %s,
                    lesson_plan = %s::jsonb,
                    completed = TRUE, completed_at = NOW()
                WHERE session_id = %s
            """, (idx, retries, json.dumps(plan), session_id))
        else:
            cur.execute("""
                UPDATE teaching_sessions
                SET current_step = %s, retry_count = %s,
                    lesson_plan = %s::jsonb
                WHERE session_id = %s
            """, (idx, retries, json.dumps(plan), session_id))

        conn.commit()

        return {
            "evaluation":         evaluation,
            "reexplanation":      reexplanation,
            "step_result":        step_result,
            "next_step":          next_step,
            "current_step_index": idx,
            "session_complete":   session_complete,
        }

    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("advance_session failed for session %d", session_id)
        raise HTTPException(500, f"Error advancing session: {exc}")
    finally:
        conn.close()


@router.get("/sessions")
def list_sessions(
    limit: int = Query(default=8, ge=1, le=20),
    current_user: UserOut = Depends(get_current_user),
):
    """Return the student's recent teaching sessions."""
    conn = get_db_connection()
    try:
        _ensure_table(conn)
        cur = conn.cursor()
        cur.execute("""
            SELECT session_id, topic, domain, current_step,
                   completed, created_at, completed_at,
                   jsonb_array_length(lesson_plan) AS total_steps
            FROM teaching_sessions
            WHERE student_id = %s
            ORDER BY created_at DESC
            LIMIT %s
        """, (current_user.id, limit))

        return [
            {
                "session_id":   r[0],
                "topic":        r[1],
                "domain":       r[2],
                "current_step": r[3],
                "completed":    r[4],
                "created_at":   r[5].isoformat() if r[5] else None,
                "completed_at": r[6].isoformat() if r[6] else None,
                "total_steps":  r[7] or 0,
            }
            for r in cur.fetchall()
        ]
    finally:
        conn.close()
