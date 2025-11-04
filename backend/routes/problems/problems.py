from fastapi import APIRouter, Query, HTTPException
from typing import List, Optional
from db import get_db_connection
from models.problem_model import Problem
import json

router = APIRouter()

def parse_domains(domain_string: str) -> List[str]:
    """Parse comma-separated domain string into list of unique domains"""
    if not domain_string or not domain_string.strip():
        return []
    
    # Split by comma and clean each domain
    domains = [d.strip() for d in domain_string.split(',')]
    # Remove empty strings and get unique values
    domains = list(set([d for d in domains if d]))
    return domains

@router.get("/problems/domain", response_model=List[Problem])
def get_problems_by_domain(domain: str, limit: int = 10):
    """
    Get problems by domain. 
    Uses PostgreSQL array functions to search within the domain string.
    """
    try:
        conn = get_db_connection()
        cur = conn.cursor()

        # Use string_to_array to convert the domain column to an array
        # Then use ANY or @> operator to check if the search domain exists
        cur.execute("""
            SELECT problem_id, domain, problem, solution, answer, difficulty_level, source, embedding, created_at
            FROM omni_math_data
            WHERE EXISTS (
                SELECT 1 
                FROM unnest(string_to_array(domain, ',')) AS d
                WHERE LOWER(TRIM(d)) LIKE LOWER(%s)
            )
            LIMIT %s;
        """, (f"%{domain}%", limit))

        rows = cur.fetchall()
        cur.close()
        conn.close()

        return [
            Problem(
                problem_id=row[0],
                domain=parse_domains(row[1]),  # Parse string to array
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

# Update other endpoints similarly
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
                domain=parse_domains(row[1]),  # Parse string to array
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
            domain=parse_domains(row[1]),  # Parse string to array
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