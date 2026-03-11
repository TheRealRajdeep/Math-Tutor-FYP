from fastapi import APIRouter, Depends

from auth.deps import get_current_user
from db.db_connection import get_db_connection
from schemas.auth import UserOut

router = APIRouter()


@router.get("/submissions/my")
def list_my_submissions(current_user: UserOut = Depends(get_current_user)):
    """
    Return all test submissions for the currently authenticated user.
    """
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    ts.submission_id,
                    ts.test_id,
                    ts.student_id,
                    ts.submitted_at,
                    CASE
                        WHEN COUNT(gr.result_id) = 0 THEN 'pending'
                        WHEN BOOL_AND(COALESCE(gr.percentage, 0) >= 90) THEN 'correct'
                        WHEN AVG(COALESCE(gr.percentage, 0)) >= 50 THEN 'partially_correct'
                        ELSE 'incorrect'
                    END AS derived_status
                FROM test_submissions ts
                LEFT JOIN grading_results gr ON gr.submission_id = ts.submission_id
                WHERE ts.student_id = %s
                GROUP BY ts.submission_id, ts.test_id, ts.student_id, ts.submitted_at, ts.status
                ORDER BY ts.submitted_at DESC, ts.submission_id DESC
                """,
                (str(current_user.id),),
            )
            rows = cur.fetchall()

        return [
            {
                "submission_id": r[0],
                "test_id": r[1],
                "student_id": r[2],
                "submitted_at": r[3].isoformat() if r[3] else None,
                "status": r[4],
            }
            for r in rows
        ]
    finally:
        conn.close()

