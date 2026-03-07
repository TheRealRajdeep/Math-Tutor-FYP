from fastapi import APIRouter, Depends, HTTPException
from db.db_connection import get_db_connection
from auth.deps import get_current_user
from schemas.auth import UserOut
from decimal import Decimal

router = APIRouter(prefix="/analytics", tags=["Analytics"])


def _f(val) -> float:
    """Safely convert any numeric DB value to float."""
    if val is None:
        return 0.0
    if isinstance(val, Decimal):
        return float(val)
    return float(val)


@router.get("/my-profile")
def get_analytics_profile(current_user: UserOut = Depends(get_current_user)):
    """
    Returns a comprehensive analytics profile for the current student:
    - Per-domain stats with strength level and trend
    - Overall stats
    - Test history (last 10 completed)
    - Recent error themes extracted from grading results
    """
    conn = get_db_connection()
    try:
        cur = conn.cursor()

        # ── 1. Per-domain stats ──────────────────────────────────────────────────
        # Uses LATERAL unnest to split comma-separated domain strings per problem.
        # RecentStats (last 30 days) is compared against all-time avg to compute trend.
        cur.execute("""
            WITH DomainStats AS (
                SELECT
                    TRIM(d.domain) AS domain,
                    COUNT(*)::int                                                     AS total_attempted,
                    SUM(CASE WHEN gr.answer_is_correct = TRUE THEN 1 ELSE 0 END)::int AS correct_count,
                    AVG(gr.percentage)                                                AS avg_score,
                    AVG(gr.logical_flow_score)                                        AS avg_logic_score
                FROM grading_results gr
                JOIN test_submissions ts ON ts.submission_id = gr.submission_id
                JOIN omni_math_data omd ON omd.problem_id = gr.problem_id
                JOIN LATERAL unnest(string_to_array(omd.domain, ',')) AS d(domain) ON TRUE
                WHERE ts.student_id = %s
                GROUP BY TRIM(d.domain)
            ),
            RecentStats AS (
                SELECT
                    TRIM(d.domain) AS domain,
                    AVG(gr.percentage) AS recent_avg
                FROM grading_results gr
                JOIN test_submissions ts ON ts.submission_id = gr.submission_id
                JOIN omni_math_data omd ON omd.problem_id = gr.problem_id
                JOIN LATERAL unnest(string_to_array(omd.domain, ',')) AS d(domain) ON TRUE
                WHERE ts.student_id = %s
                    AND gr.graded_at >= NOW() - INTERVAL '30 days'
                GROUP BY TRIM(d.domain)
            )
            SELECT
                ds.domain,
                ds.total_attempted,
                ds.correct_count,
                ds.avg_score,
                ds.avg_logic_score,
                rs.recent_avg
            FROM DomainStats ds
            LEFT JOIN RecentStats rs ON ds.domain = rs.domain
            WHERE ds.domain IS NOT NULL
              AND TRIM(ds.domain) != ''
            ORDER BY ds.total_attempted DESC
        """, (str(current_user.id), str(current_user.id)))

        domain_rows = cur.fetchall()
        domains = []
        for row in domain_rows:
            domain, total, correct, avg_score_raw, avg_logic_raw, recent_raw = row
            avg_score = _f(avg_score_raw)
            avg_logic = _f(avg_logic_raw)
            # If no recent data, use all-time avg so trend shows as stable
            recent_avg = _f(recent_raw) if recent_raw is not None else avg_score

            if avg_score < 50:
                strength_level = "weak"
            elif avg_score < 75:
                strength_level = "developing"
            else:
                strength_level = "strong"

            diff = recent_avg - avg_score
            trend = "improving" if diff > 10 else ("declining" if diff < -10 else "stable")
            accuracy = round((correct / total * 100) if total else 0.0, 1)

            domains.append({
                "name": domain.strip(),
                "total_attempted": total,
                "correct": correct,
                "accuracy": accuracy,
                "avg_score": round(avg_score, 1),
                "avg_logic_score": round(avg_logic, 3),
                "strength_level": strength_level,
                "trend": trend,
            })

        # ── 2. Overall stats ─────────────────────────────────────────────────────
        cur.execute("""
            SELECT
                COUNT(*)::int,
                SUM(CASE WHEN gr.answer_is_correct = TRUE THEN 1 ELSE 0 END)::int,
                AVG(gr.percentage)
            FROM grading_results gr
            JOIN test_submissions ts ON ts.submission_id = gr.submission_id
            WHERE ts.student_id = %s
        """, (str(current_user.id),))

        ov = cur.fetchone()
        total_att = ov[0] or 0
        total_cor = ov[1] or 0
        overall_avg = _f(ov[2])

        cur.execute("""
            SELECT COUNT(DISTINCT test_id)::int
            FROM mock_tests
            WHERE student_id = %s AND status = 'completed'
        """, (current_user.id,))
        tests_completed = cur.fetchone()[0] or 0

        # ── 3. Test history (last 10 completed, ordered ascending for chart) ─────
        cur.execute("""
            SELECT
                mt.test_id,
                mt.test_type,
                mt.created_at,
                AVG(gr.percentage)                                                    AS avg_score,
                SUM(CASE WHEN gr.answer_is_correct = TRUE THEN 1 ELSE 0 END)::int     AS correct,
                COUNT(gr.result_id)::int                                              AS total
            FROM mock_tests mt
            JOIN test_submissions ts
                ON ts.test_id = mt.test_id AND ts.student_id = %s
            JOIN grading_results gr ON gr.submission_id = ts.submission_id
            WHERE mt.student_id = %s AND mt.status = 'completed'
            GROUP BY mt.test_id, mt.test_type, mt.created_at
            ORDER BY mt.created_at ASC
            LIMIT 10
        """, (str(current_user.id), current_user.id))

        history_rows = cur.fetchall()
        test_history = [
            {
                "test_id": row[0],
                "label": f"Test {i + 1}",
                "test_type": row[1],
                "avg_score": round(_f(row[3]), 1),
                "correct": row[4] or 0,
                "total": row[5] or 0,
                "date": row[2].strftime("%b %d") if row[2] else None,
            }
            for i, row in enumerate(history_rows)
        ]

        # ── 4. Recent error summaries from incorrect answers ──────────────────────
        cur.execute("""
            SELECT gr.error_summary
            FROM grading_results gr
            JOIN test_submissions ts ON ts.submission_id = gr.submission_id
            WHERE ts.student_id = %s
              AND gr.answer_is_correct = FALSE
              AND gr.error_summary IS NOT NULL
              AND gr.error_summary != ''
            ORDER BY gr.graded_at DESC
            LIMIT 12
        """, (str(current_user.id),))

        error_rows = cur.fetchall()
        seen: set = set()
        error_themes = []
        for (summary,) in error_rows:
            if summary and summary not in seen:
                seen.add(summary)
                error_themes.append(summary)
            if len(error_themes) >= 6:
                break

        # ── 5. Derive strongest / weakest ────────────────────────────────────────
        sorted_by_score = sorted(domains, key=lambda d: d["avg_score"])
        weakest = sorted_by_score[0]["name"] if sorted_by_score else None
        strongest = sorted_by_score[-1]["name"] if sorted_by_score else None

        return {
            "domains": domains,
            "overall": {
                "total_attempted": total_att,
                "total_correct": total_cor,
                "accuracy": round((total_cor / total_att * 100) if total_att else 0.0, 1),
                "avg_score": round(overall_avg, 1),
                "tests_completed": tests_completed,
            },
            "strongest_domain": strongest,
            "weakest_domain": weakest,
            "recent_error_themes": error_themes,
            "test_history": test_history,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching analytics: {str(e)}")
    finally:
        conn.close()
