from fastapi import APIRouter
from db import get_db_connection

router = APIRouter()

@router.get("/mock_test")
def generate_mock_test(difficulty: str, domain: str | None = None):
    """
    Generate a 10-question mock test. If domain is given, filter by domain.
    Otherwise, pull from random domains.
    """
    conn = get_db_connection()
    cur = conn.cursor()

    if domain:
        cur.execute("""
            SELECT problem_id, domain, problem, solution, answer, difficulty_level, created_at
            FROM omni_math_data
            WHERE LOWER(domain) LIKE LOWER(%s)
              AND difficulty_level = %s
            ORDER BY RANDOM()
            LIMIT 10;
        """, (f"%{domain}%", difficulty))
    else:
        cur.execute("""
            SELECT problem_id, domain, problem, solution, answer, difficulty_level, created_at
            FROM omni_math_data
            WHERE difficulty_level = %s
            ORDER BY RANDOM()
            LIMIT 10;
        """, (difficulty,))

    rows = cur.fetchall()
    cur.close()
    conn.close()

    if not rows:
        return {"message": "No problems found for this difficulty or domain."}

    problems = [
        {
            "problem_id": row[0],
            "domain": row[1],
            "problem": row[2],
            "solution": row[3],
            "answer": row[4],
            "difficulty_level": row[5],
            "created_at": row[6]
        } for row in rows
    ]

    return {
        "domain": domain or "Random",
        "difficulty": difficulty,
        "total_questions": len(problems),
        "problems": problems
    }
