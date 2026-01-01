import json
import logging
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta

from db.db_connection import get_db_connection

logger = logging.getLogger(__name__)

def parse_domains(domain_string: str) -> List[str]:
    """Parse comma-separated domain string into list of unique domains"""
    if not domain_string or not domain_string.strip():
        return []
    domains = [d.strip() for d in domain_string.split(',')]
    return list(set([d for d in domains if d]))

def fetch_problems_by_domain(conn, domain: str, count: int, min_diff: float = 3.0, max_diff: float = 6.0) -> List[tuple]:
    """Fetch problems for a specific domain within difficulty range"""
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
            AND difficulty_level >= %s 
            AND difficulty_level <= %s
            ORDER BY RANDOM()
            LIMIT %s;
        """, (f"%{domain}%", min_diff, max_diff, count))
        return cur.fetchall()
    finally:
        cur.close()

def generate_entry_mock_test_for_user(user_id: int) -> int:
    """
    Generates an RMO Entry Mock Test for a newly signed up user.
    """
    conn = get_db_connection()
    try:
        domain_config = [
            ("Algebra", 3),
            ("Number Theory", 3),
            ("Geometry", 3),
            ("Combinatorics", 1)
        ]
        
        all_problems = []
        for domain_name, count in domain_config:
            # Entry level difficulty: 3.0 - 6.0
            rows = fetch_problems_by_domain(conn, domain_name, count, min_diff=3.0, max_diff=6.0)
            all_problems.extend([{ "problem_id": row[0] } for row in rows])
        
        if not all_problems:
            logger.warning(f"No problems found for entry test generation for user {user_id}")
            # If strictly required, might want to raise an error, 
            # but returning 0 allows the process to continue without crashing 
            # if the DB is empty during development.
            return 0

        cur = conn.cursor()
        try:
            cur.execute(
                """
                INSERT INTO mock_tests (test_type, problems, student_id, status, created_at)
                VALUES (%s, %s, %s, %s, NOW())
                RETURNING test_id;
                """,
                (
                    "RMO Entry Mock Test",
                    json.dumps(all_problems),
                    user_id,
                    "not_started"
                ),
            )
            test_id = cur.fetchone()[0]
            conn.commit()
            logger.info(f"Generated entry mock test {test_id} for user {user_id}")
            return test_id
        finally:
            cur.close()
    except Exception as e:
        logger.error(f"Failed to generate entry mock test for user {user_id}: {e}")
        conn.rollback()
        raise e
    finally:
        conn.close()

def generate_scheduled_test_for_batch(batch_id: int = None) -> List[int]:
    """
    Generates a scheduled mock test for all users (or batch-specific).
    """
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        
        # 1. Get students
        if batch_id:
            cur.execute("SELECT id FROM users WHERE batch_id = %s", (batch_id,))
        else:
            cur.execute("SELECT id FROM users") # Select all active students
        
        students = cur.fetchall()
        if not students:
            logger.info("No students found for scheduled test generation.")
            return []

        # 2. Select problems (Weekly test difficulty: 4.0 - 8.0)
        domain_config = [
            ("Algebra", 3),
            ("Number Theory", 2),
            ("Geometry", 3),
            ("Combinatorics", 2)
        ]
        
        template_problems = []
        for domain_name, count in domain_config:
            rows = fetch_problems_by_domain(conn, domain_name, count, min_diff=4.0, max_diff=8.0)
            template_problems.extend([{ "problem_id": row[0] } for row in rows])

        if not template_problems:
             logger.warning("No problems found for scheduled test generation.")
             return []

        problems_json = json.dumps(template_problems)
        test_type = f"Scheduled Mock Test - {datetime.now().strftime('%Y-%m-%d')}"
        
        created_test_ids = []
        
        # 3. Assign to students
        for student in students:
            student_id = student[0]
            cur.execute(
                """
                INSERT INTO mock_tests (test_type, problems, student_id, status, created_at)
                VALUES (%s, %s, %s, %s, NOW())
                RETURNING test_id;
                """,
                (test_type, problems_json, student_id, "not_started")
            )
            created_test_ids.append(cur.fetchone()[0])
            
        conn.commit()
        logger.info(f"Generated scheduled tests for {len(created_test_ids)} students.")
        return created_test_ids
        
    except Exception as e:
        logger.error(f"Error generating scheduled tests: {e}")
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


