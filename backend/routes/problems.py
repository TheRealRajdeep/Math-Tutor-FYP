from fastapi import APIRouter, Query, HTTPException
from typing import List, Optional
from ..db import get_db_connection                     # <- relative
from ..models.problem_model import Problem 

router = APIRouter()

@router.get("/problems/domain", response_model=List[Problem])
def get_problems_by_domain(domain: str, limit: int = 10):
    try:
        conn = get_db_connection()
        cur = conn.cursor()

        cur.execute("""
            SELECT problem_id, domain, problem, solution, answer, difficulty_level, source, embedding, created_at
            FROM omni_math_data
            WHERE LOWER(domain) = LOWER(%s)
            LIMIT %s;
        """, (domain, limit))

        rows = cur.fetchall()
        cur.close()
        conn.close()

        return [
            Problem(
                problem_id=row[0],
                domain=row[1],
                problem=row[2],
                solution=row[3],
                answer=row[4],
                difficulty_level=row[5],
                source=row[6],
                embedding=row[7],
                created_at=row[8]
            )
            for row in rows
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


@router.get("/problems/difficulty", response_model=List[Problem])
def get_problems_by_difficulty(level: str, limit: int = 10):
    try:
        conn = get_db_connection()
        cur = conn.cursor()

        cur.execute("""
            SELECT problem_id, domain, problem, solution, answer, difficulty_level, source, embedding, created_at
            FROM omni_math_data
            WHERE difficulty_level = %s
            LIMIT %s;
        """, (level, limit))

        rows = cur.fetchall()
        cur.close()
        conn.close()

        return [
            Problem(
                problem_id=row[0],
                domain=row[1],
                problem=row[2],
                solution=row[3],
                answer=row[4],
                difficulty_level=row[5],
                source=row[6],
                embedding=row[7],
                created_at=row[8]
            )
            for row in rows
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


# @router.get("/problems/source", response_model=List[Problem])
# def get_problems_by_source(source: str, limit: int = 10):
#     try:
#         conn = get_db_connection()
#         cur = conn.cursor()

#         cur.execute("""
#             SELECT problem_id, domain, problem, solution, answer, difficulty_level, source, embedding, created_at
#             FROM omni_math_data
#             WHERE LOWER(source) = LOWER(%s)
#             LIMIT %s;
#         """, (source, limit))

#         rows = cur.fetchall()
#         cur.close()
#         conn.close()

#         return [
#             Problem(
#                 problem_id=row[0],
#                 domain=row[1],
#                 problem=row[2],
#                 solution=row[3],
#                 answer=row[4],
#                 difficulty_level=row[5],
#                 source=row[6],
#                 embedding=row[7],
#                 created_at=row[8]
#             )
#             for row in rows
#         ]
#     except Exception as e:
#         raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


@router.get("/problems", response_model=List[Problem])
def get_all_problems(limit: int = 10, offset: int = 0):
    try:
        conn = get_db_connection()
        cur = conn.cursor()

        cur.execute("""
            SELECT problem_id, domain, problem, solution, answer, difficulty_level, source, embedding, created_at
            FROM omni_math_data
            ORDER BY created_at DESC
            LIMIT %s OFFSET %s;
        """, (limit, offset))

        rows = cur.fetchall()
        cur.close()
        conn.close()

        return [
            Problem(
                problem_id=row[0],
                domain=row[1],
                problem=row[2],
                solution=row[3],
                answer=row[4],
                difficulty_level=row[5],
                source=row[6],
                embedding=row[7],
                created_at=row[8]
            )
            for row in rows
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


@router.get("/problems/{problem_id}", response_model=Problem)
def get_problem_by_id(problem_id: int):
    try:
        conn = get_db_connection()
        cur = conn.cursor()

        cur.execute("""
            SELECT problem_id, domain, problem, solution, answer, difficulty_level, source, embedding, created_at
            FROM omni_math_data
            WHERE problem_id = %s;
        """, (problem_id,))

        row = cur.fetchone()
        cur.close()
        conn.close()

        if row is None:
            raise HTTPException(status_code=404, detail="Problem not found")

        return Problem(
            problem_id=row[0],
            domain=row[1],
            problem=row[2],
            solution=row[3],
            answer=row[4],
            difficulty_level=row[5],
            source=row[6],
            embedding=row[7],
            created_at=row[8]
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")