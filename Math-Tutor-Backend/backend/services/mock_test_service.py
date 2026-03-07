import json
import logging
import math
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
from decimal import Decimal

from db.db_connection import get_db_connection

logger = logging.getLogger(__name__)

KNOWN_DOMAINS = ["Algebra", "Number Theory", "Geometry", "Combinatorics"]
TARGETED_TEST_SIZE = 10

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

def _get_domain_performance(conn, student_id: int) -> Dict[str, Dict]:
    """
    Returns per-domain stats for a student:
      avg_score (0-100), total_attempted, weakness_score (higher = weaker)
    Falls back to neutral defaults for domains with no history.
    """
    cur = conn.cursor()
    try:
        cur.execute("""
            WITH DomainStats AS (
                SELECT
                    TRIM(d.domain)                                                        AS domain,
                    COUNT(*)::int                                                         AS total_attempted,
                    AVG(gr.percentage)                                                    AS avg_score,
                    SUM(CASE WHEN gr.answer_is_correct = FALSE THEN 1 ELSE 0 END)::int   AS fail_count
                FROM grading_results gr
                JOIN test_submissions ts ON ts.submission_id = gr.submission_id
                JOIN omni_math_data omd ON omd.problem_id = gr.problem_id
                JOIN LATERAL unnest(string_to_array(omd.domain, ',')) AS d(domain) ON TRUE
                WHERE ts.student_id = %s
                GROUP BY TRIM(d.domain)
            )
            SELECT domain, total_attempted, avg_score, fail_count
            FROM DomainStats
            WHERE domain IS NOT NULL AND TRIM(domain) != ''
        """, (str(student_id),))

        perf = {}
        for domain, total, avg_raw, fails in cur.fetchall():
            avg = float(avg_raw) if avg_raw is not None else 50.0
            perf[domain.strip()] = {
                "avg_score": round(avg, 1),
                "total_attempted": total,
                # weakness_score: 0 = strong, higher = weaker
                "weakness_score": max(0.5, (100.0 - avg) / 10.0 + fails * 0.5),
            }
        return perf
    finally:
        cur.close()


def _allocate_questions(domain_perf: Dict[str, Dict], total: int = TARGETED_TEST_SIZE) -> Dict[str, int]:
    """
    Distribute `total` questions across KNOWN_DOMAINS proportionally to weakness_score.
    Every domain gets at least 1 question.  Domains with no history get a neutral weight.
    """
    weights = {}
    for domain in KNOWN_DOMAINS:
        if domain in domain_perf:
            weights[domain] = domain_perf[domain]["weakness_score"]
        else:
            weights[domain] = 2.0  # neutral default — neither strong nor weak

    total_weight = sum(weights.values())
    # Initial allocation (float)
    raw = {d: (w / total_weight) * total for d, w in weights.items()}

    # Floor to int, guarantee minimum 1 per domain
    alloc = {d: max(1, math.floor(v)) for d, v in raw.items()}
    assigned = sum(alloc.values())

    # Distribute remainder by largest fractional parts
    remainder = total - assigned
    if remainder > 0:
        fracs = sorted(raw.keys(), key=lambda d: -(raw[d] - math.floor(raw[d])))
        for i in range(remainder):
            alloc[fracs[i % len(fracs)]] += 1

    return alloc


def _domain_difficulty(domain: str, domain_perf: Dict[str, Dict]) -> tuple[float, float]:
    """
    Return (min_diff, max_diff) for a domain based on the student's avg score.
    Weak students get lower difficulty (confidence-building); strong get harder.
    """
    if domain not in domain_perf:
        return 3.0, 6.0  # default range for unknown domains

    avg = domain_perf[domain]["avg_score"]
    # Linear map: avg 0→(1.5,4.0), avg 50→(3.5,6.0), avg 80→(5.5,8.0), avg 100→(7.0,9.5)
    mid = max(2.0, min(9.0, (avg / 100.0) * 7.5 + 1.5))
    return round(max(1.0, mid - 1.5), 1), round(min(10.0, mid + 1.5), 1)


def generate_weakness_mock_test(student_id: int) -> int:
    """
    Generates a Targeted Mock Test personalised to the student's weak domains.

    Algorithm:
      1. Fetch per-domain performance (avg score + failure count).
      2. Allocate 10 questions proportionally to weakness — weaker domains get
         more questions; every domain gets at least 1.
      3. For each domain, target a difficulty range calibrated to the student's
         avg score in that domain (lower score → easier problems to build confidence).
      4. Insert the mock_test record with type "Targeted Mock Test".

    Returns the new test_id, or 0 if no problems could be found.
    """
    conn = get_db_connection()
    try:
        domain_perf = _get_domain_performance(conn, student_id)
        allocation = _allocate_questions(domain_perf)

        all_problems: List[Dict] = []
        used_ids: set = set()

        for domain, count in allocation.items():
            min_diff, max_diff = _domain_difficulty(domain, domain_perf)
            rows = fetch_problems_by_domain(conn, domain, count, min_diff=min_diff, max_diff=max_diff)

            # Avoid duplicate problem_ids across domains
            for row in rows:
                if row[0] not in used_ids:
                    all_problems.append({"problem_id": row[0]})
                    used_ids.add(row[0])

            # If not enough unique problems found, widen the difficulty search
            if len([r for r in rows if r[0] not in used_ids | {row[0] for row in rows}]) < count:
                shortfall = count - len(
                    [r for r in rows if r[0] not in (used_ids - {r[0] for r in rows})]
                )
                if shortfall > 0:
                    extra = fetch_problems_by_domain(conn, domain, shortfall + 3, min_diff=1.0, max_diff=10.0)
                    for row in extra:
                        if row[0] not in used_ids:
                            all_problems.append({"problem_id": row[0]})
                            used_ids.add(row[0])
                            shortfall -= 1
                            if shortfall <= 0:
                                break

        if not all_problems:
            logger.warning(f"No problems found for targeted test for user {student_id}")
            return 0

        # Build a human-readable description of the domain breakdown
        breakdown = ", ".join(f"{d}×{c}" for d, c in allocation.items() if c > 0)
        test_type = f"Targeted Mock Test ({breakdown})"

        cur = conn.cursor()
        try:
            cur.execute(
                """
                INSERT INTO mock_tests (test_type, problems, student_id, status, created_at)
                VALUES (%s, %s, %s, 'not_started', NOW())
                RETURNING test_id
                """,
                (test_type, json.dumps(all_problems[:TARGETED_TEST_SIZE]), student_id),
            )
            test_id = cur.fetchone()[0]
            conn.commit()
            logger.info(
                "Generated targeted mock test %d for user %d: %s",
                test_id, student_id, breakdown,
            )
            return test_id
        finally:
            cur.close()

    except Exception as e:
        logger.error("Failed to generate targeted mock test for user %d: %s", student_id, e)
        conn.rollback()
        raise
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




