# curriculum_service.py
from typing import List, Dict, Optional, Any
from datetime import date, datetime, timedelta
from decimal import Decimal
from db.db_connection import get_db_connection
import json


def convert_decimal_to_float(obj):
    """Convert Decimal values to float for JSON serialization"""
    if isinstance(obj, Decimal):
        return float(obj)
    elif isinstance(obj, dict):
        return {key: convert_decimal_to_float(value) for key, value in obj.items()}
    elif isinstance(obj, list):
        return [convert_decimal_to_float(item) for item in obj]
    return obj


def analyze_student_weaknesses(student_id: int) -> List[Dict[str, Any]]:
    """
    Analyzes test_submissions -> problem_submissions -> grading_results 
    to identify weak domains/topics where the student has incorrect answers.
    
    Returns list of weak domains with scores, weighted by recency.
    """
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        
        # Analyze weaknesses from grading_results with recency weighting
        # Recent mistakes (last 7 days) get 2x weight, older mistakes get 1x weight
        cur.execute("""
            WITH RecentFailures AS (
                SELECT 
                    TRIM(unnest(string_to_array(omd.domain, ','))) as domain,
                    COUNT(*) * 2 as failure_count,
                    MAX(gr.graded_at) as last_failure_date
                FROM grading_results gr
                JOIN test_submissions ts ON ts.submission_id = gr.submission_id
                JOIN omni_math_data omd ON omd.problem_id = gr.problem_id
                WHERE ts.student_id = %s 
                    AND gr.answer_is_correct = FALSE
                    AND gr.graded_at >= NOW() - INTERVAL '7 days'
                GROUP BY TRIM(unnest(string_to_array(omd.domain, ',')))
            ),
            OlderFailures AS (
                SELECT 
                    TRIM(unnest(string_to_array(omd.domain, ','))) as domain,
                    COUNT(*) as failure_count,
                    MAX(gr.graded_at) as last_failure_date
                FROM grading_results gr
                JOIN test_submissions ts ON ts.submission_id = gr.submission_id
                JOIN omni_math_data omd ON omd.problem_id = gr.problem_id
                WHERE ts.student_id = %s 
                    AND gr.answer_is_correct = FALSE
                    AND gr.graded_at < NOW() - INTERVAL '7 days'
                GROUP BY TRIM(unnest(string_to_array(omd.domain, ',')))
            ),
            MistakeCounts AS (
                SELECT 
                    domain,
                    COUNT(*) as mistake_count,
                    MAX(created_at) as last_mistake_date
                FROM student_mistakes
                WHERE student_id = %s
                GROUP BY domain
            )
            SELECT 
                COALESCE(rf.domain, of.domain, mc.domain) as domain,
                (COALESCE(rf.failure_count, 0) + COALESCE(of.failure_count, 0) + COALESCE(mc.mistake_count, 0)) as weakness_score,
                GREATEST(
                    COALESCE(rf.last_failure_date, '1970-01-01'::timestamp),
                    COALESCE(of.last_failure_date, '1970-01-01'::timestamp),
                    COALESCE(mc.last_mistake_date, '1970-01-01'::timestamp)
                ) as last_issue_date
            FROM RecentFailures rf
            FULL OUTER JOIN OlderFailures of ON rf.domain = of.domain
            FULL OUTER JOIN MistakeCounts mc ON COALESCE(rf.domain, of.domain) = mc.domain
            WHERE COALESCE(rf.domain, of.domain, mc.domain) IS NOT NULL
                AND TRIM(COALESCE(rf.domain, of.domain, mc.domain)) != ''
            ORDER BY weakness_score DESC, last_issue_date DESC
        """, (str(student_id), str(student_id), str(student_id)))
        
        rows = cur.fetchall()
        weaknesses = []
        
        for row in rows:
            domain = row[0]
            if domain and domain.strip():
                weaknesses.append({
                    "domain": domain.strip(),
                    "weakness_score": row[1] or 0,
                    "last_issue_date": row[2]
                })
        
        # If no weaknesses found, return default domains for general practice
        if not weaknesses:
            weaknesses = [
                {"domain": "Algebra", "weakness_score": 1, "last_issue_date": None},
                {"domain": "Geometry", "weakness_score": 1, "last_issue_date": None},
                {"domain": "Number Theory", "weakness_score": 1, "last_issue_date": None}
            ]
        
        return weaknesses
        
    finally:
        conn.close()


def generate_daily_tasks(student_id: int, duration_months: int, task_date: date) -> List[Dict[str, Any]]:
    """
    Generates daily tasks for a specific date based on student weaknesses.
    Creates 2-3 practice problems and 1-2 study materials.
    """
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        
        # Check if tasks already exist for this date
        cur.execute("""
            SELECT task_id FROM daily_tasks 
            WHERE student_id = %s AND task_date = %s
        """, (student_id, task_date))
        
        if cur.fetchone():
            # Tasks already exist, return them
            cur.execute("""
                SELECT task_id, task_type, task_content, is_completed
                FROM daily_tasks
                WHERE student_id = %s AND task_date = %s
                ORDER BY task_type, task_id
            """, (student_id, task_date))
            
            rows = cur.fetchall()
            tasks = []
            for r in rows:
                task_content = r[2]
                # Handle JSONB - it might be a dict or a string
                if isinstance(task_content, str):
                    try:
                        task_content = json.loads(task_content)
                    except (json.JSONDecodeError, TypeError):
                        pass  # Keep as string if parsing fails
                tasks.append({
                    "task_id": r[0],
                    "task_type": r[1],
                    "task_content": task_content,
                    "is_completed": r[3]
                })
            return tasks
        
        # Analyze weaknesses
        weaknesses = analyze_student_weaknesses(student_id)
        
        # Get top 2-3 weak domains
        top_weak_domains = [w["domain"] for w in weaknesses[:3]]
        
        generated_tasks = []
        
        # Generate 2-3 practice problems from weak domains
        problems_per_domain = max(1, 3 // len(top_weak_domains) if top_weak_domains else 1)
        
        for domain in top_weak_domains[:2]:  # Limit to 2 domains to avoid too many problems
            clean_domain = domain.strip('[]"')
            
            cur.execute("""
                SELECT problem_id, problem, difficulty_level, domain 
                FROM omni_math_data
                WHERE domain ILIKE %s
                ORDER BY RANDOM()
                LIMIT %s
            """, (f"%{clean_domain}%", problems_per_domain))
            
            problem_rows = cur.fetchall()
            
            for prob_row in problem_rows:
                task_content = {
                    "problem_id": prob_row[0],
                    "problem_text": prob_row[1][:200] + "..." if len(prob_row[1]) > 200 else prob_row[1],
                    "difficulty": prob_row[2],
                    "domain": prob_row[3]
                }
                
                # Convert any Decimal values to float for JSON serialization
                task_content = convert_decimal_to_float(task_content)
                
                # Insert task
                cur.execute("""
                    INSERT INTO daily_tasks 
                    (student_id, task_date, task_type, task_content, curriculum_duration_months)
                    VALUES (%s, %s, 'practice_problem', %s, %s)
                    RETURNING task_id
                """, (student_id, task_date, json.dumps(task_content), duration_months))
                
                task_id = cur.fetchone()[0]
                generated_tasks.append({
                    "task_id": task_id,
                    "task_type": "practice_problem",
                    "task_content": task_content,
                    "is_completed": False
                })
        
        # Generate 1-2 study materials related to weak topics
        if top_weak_domains:
            cur.execute("""
                SELECT material_id, title, url, material_type, content 
                FROM study_materials 
                WHERE related_topics::text ILIKE ANY(%s)
                ORDER BY RANDOM()
                LIMIT 2
            """, ([f"%{d}%" for d in top_weak_domains],))
            
            material_rows = cur.fetchall()
            
            for mat_row in material_rows:
                task_content = {
                    "material_id": mat_row[0],
                    "title": mat_row[1],
                    "url": mat_row[2],
                    "material_type": mat_row[3],
                    "snippet": mat_row[4][:150] + "..." if mat_row[4] and len(mat_row[4]) > 150 else (mat_row[4] or "")
                }
                
                # Convert any Decimal values to float for JSON serialization
                task_content = convert_decimal_to_float(task_content)
                
                # Insert task
                cur.execute("""
                    INSERT INTO daily_tasks 
                    (student_id, task_date, task_type, task_content, curriculum_duration_months)
                    VALUES (%s, %s, 'study_material', %s, %s)
                    RETURNING task_id
                """, (student_id, task_date, json.dumps(task_content), duration_months))
                
                task_id = cur.fetchone()[0]
                generated_tasks.append({
                    "task_id": task_id,
                    "task_type": "study_material",
                    "task_content": task_content,
                    "is_completed": False
                })
        
        # If no study materials found, create a topic review task
        if not any(t["task_type"] == "study_material" for t in generated_tasks) and top_weak_domains:
            task_content = {
                "topics": top_weak_domains[:2],
                "description": f"Review concepts in {', '.join(top_weak_domains[:2])}"
            }
            
            # Convert any Decimal values to float for JSON serialization
            task_content = convert_decimal_to_float(task_content)
            
            cur.execute("""
                INSERT INTO daily_tasks 
                (student_id, task_date, task_type, task_content, curriculum_duration_months)
                VALUES (%s, %s, 'topic_review', %s, %s)
                RETURNING task_id
            """, (student_id, task_date, json.dumps(task_content), duration_months))
            
            task_id = cur.fetchone()[0]
            generated_tasks.append({
                "task_id": task_id,
                "task_type": "topic_review",
                "task_content": task_content,
                "is_completed": False
            })
        
        conn.commit()
        return generated_tasks
        
    finally:
        conn.close()


def regenerate_daily_tasks_if_needed(student_id: int) -> bool:
    """
    Checks if user has made significant progress and regenerates tasks if needed.
    Returns True if regeneration occurred, False otherwise.
    """
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        
        # Check recent performance (last 3 days)
        cur.execute("""
            SELECT COUNT(*) as recent_correct
            FROM grading_results gr
            JOIN test_submissions ts ON ts.submission_id = gr.submission_id
            WHERE ts.student_id = %s 
                AND gr.answer_is_correct = TRUE
                AND gr.graded_at >= NOW() - INTERVAL '3 days'
        """, (str(student_id),))
        
        recent_correct = cur.fetchone()[0] or 0
        
        # If student has 5+ correct answers in last 3 days, regenerate tomorrow's tasks
        if recent_correct >= 5:
            tomorrow = date.today() + timedelta(days=1)
            
            # Get curriculum selection
            cur.execute("""
                SELECT duration_months FROM user_curriculum_selections
                WHERE student_id = %s
            """, (student_id,))
            
            selection = cur.fetchone()
            if selection:
                duration_months = selection[0]
                
                # Delete existing tomorrow's tasks
                cur.execute("""
                    DELETE FROM daily_tasks 
                    WHERE student_id = %s AND task_date = %s
                """, (student_id, tomorrow))
                
                # Regenerate
                generate_daily_tasks(student_id, duration_months, tomorrow)
                conn.commit()
                return True
        
        return False
        
    finally:
        conn.close()

