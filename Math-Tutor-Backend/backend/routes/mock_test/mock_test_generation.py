from fastapi import APIRouter, HTTPException
from backend.db import get_db_connection
import json

router = APIRouter()

def parse_domains(domain_string: str) -> list:
    """Parse comma-separated domain string into list of unique domains"""
    if not domain_string or not domain_string.strip():
        return []
    domains = [d.strip() for d in domain_string.split(',')]
    return list(set([d for d in domains if d]))

def fetch_problems_by_domain(conn, domain: str, count: int) -> list:
    """Fetch problems for a specific domain with difficulty between 3.0 and 6.0"""
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT problem_id, domain, problem, solution, answer, difficulty_level, created_at
            FROM omni_math_data
            WHERE EXISTS (
                SELECT 1 
                FROM unnest(string_to_array(domain, ',')) AS d
                WHERE LOWER(TRIM(d)) LIKE LOWER(%s)
            )
            AND difficulty_level >= 3.0 
            AND difficulty_level <= 6.0
            ORDER BY RANDOM()
            LIMIT %s;
        """, (f"%{domain}%", count))
        return cur.fetchall()
    finally:
        cur.close()

@router.get("/entry_mock_test")
def generate_entry_mock_test():
    """
    Generate an RMO Entry Mock Test with specific structure:
    - Difficulty range: 3.0 to 6.0 (RMO entry level)
    - Algebra: 3 questions
    - Number Theory: 3 questions
    - Geometry: 3 questions
    - Combinatorics: 1 question
    Total: 10 questions
    """
    conn = get_db_connection()
    
    try:
        # Domain distribution for RMO test
        domain_config = [
            ("Algebra", 3),
            ("Number Theory", 3),
            ("Geometry", 3),
            ("Combinatorics", 1)
        ]
        
        all_problems = []
        domain_counts = {}
        
        # Fetch problems for each domain
        for domain_name, count in domain_config:
            rows = fetch_problems_by_domain(conn, domain_name, count)
            
            if len(rows) < count:
                # Log warning but continue with available problems
                domain_counts[domain_name] = len(rows)
            else:
                domain_counts[domain_name] = count
            
            problems = [
                {
                    "problem_id": row[0],
                    "domain": parse_domains(row[1]),
                    "problem": row[2],
                    "solution": row[3],
                    "answer": row[4],
                    "difficulty_level": row[5],
                    "created_at": row[6]
                } for row in rows
            ]
            all_problems.extend(problems)
        
        # Persist the generated test instance in DB
        if not all_problems:
            raise HTTPException(
                status_code=404, 
                detail="No problems found for RMO difficulty range (3.0-6.0) in the specified domains."
            )
        
        cur = conn.cursor()
        try:
            cur.execute(
                """
                INSERT INTO mock_tests (test_type, problems)
                VALUES (%s, %s)
                RETURNING test_id;
                """,
                (
                    "RMO Entry Mock Test",
                    json.dumps([{ "problem_id": p["problem_id"] } for p in all_problems])
                ),
            )
            test_id = cur.fetchone()[0]
            conn.commit()
        finally:
            cur.close()
            conn.close()

        return {
            "test_id": test_id,
            "test_type": "RMO Entry Mock Test",
            "difficulty_range": "3.0 - 6.0",
            "total_questions": len(all_problems),
            "domain_distribution": domain_counts,
            "problems": all_problems,
        }
    
    except HTTPException:
        raise
    except Exception as e:
        conn.close()
        raise HTTPException(status_code=500, detail=f"Error generating mock test: {str(e)}")