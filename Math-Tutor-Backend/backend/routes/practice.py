from fastapi import APIRouter, Depends, HTTPException
from typing import List, Optional
from db.db_connection import get_db_connection
from auth.deps import get_current_user
from schemas.auth import UserOut
import json

router = APIRouter(prefix="/practice", tags=["Practice"])

@router.get("/recommendations")
def get_practice_recommendations(current_user: UserOut = Depends(get_current_user)):
    """
    Provide practice problems and study material according to student's strengths and weaknesses.
    AI Logic: Analyzes 'student_mistakes' and 'grading_results' to find weak domains.
    """
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        
        # 1. Identify Weakest Domains based on mistakes and low scores
        # Weight recent mistakes higher
        cur.execute("""
            WITH MistakeCounts AS (
                SELECT domain, COUNT(*) as mistake_count
                FROM student_mistakes
                WHERE student_id = %s
                GROUP BY domain
            ),
            LowScores AS (
                SELECT 
                    (jsonb_array_elements_text(omd.domain)) as domain,
                    COUNT(*) as failure_count
                FROM grading_results gr
                JOIN test_submissions ts ON ts.submission_id = gr.submission_id
                JOIN omni_math_data omd ON omd.problem_id = gr.problem_id
                WHERE ts.student_id = %s AND gr.answer_is_correct = FALSE
                GROUP BY 1
            )
            SELECT 
                COALESCE(mc.domain, ls.domain) as domain,
                (COALESCE(mc.mistake_count, 0) + COALESCE(ls.failure_count, 0)) as weakness_score
            FROM MistakeCounts mc
            FULL OUTER JOIN LowScores ls ON mc.domain = ls.domain
            ORDER BY weakness_score DESC
            LIMIT 3;
        """, (str(current_user.id), str(current_user.id)))
        
        weak_domains_rows = cur.fetchall()
        weak_domains = [r[0] for r in weak_domains_rows if r[0]]
        
        # If no data, default to broad categories
        if not weak_domains:
            weak_domains = ["Algebra", "Geometry", "Number Theory"]
            recommendation_reason = "General practice (no history found)"
        else:
            recommendation_reason = f"Based on weaknesses in: {', '.join(weak_domains)}"

        # 2. Fetch recommended problems for these domains
        recommendations = []
        for domain in weak_domains:
            # Clean domain string (remove array brackets if stored oddly)
            clean_domain = domain.strip('[]"')
            
            cur.execute("""
                SELECT problem_id, problem, difficulty_level, domain 
                FROM omni_math_data
                WHERE domain ILIKE %s
                ORDER BY RANDOM()
                LIMIT 2
            """, (f"%{clean_domain}%",))
            
            rows = cur.fetchall()
            for r in rows:
                recommendations.append({
                    "problem_id": r[0],
                    "problem_text": r[1],
                    "difficulty": r[2],
                    "domain": r[3],
                    "type": "Practice Problem"
                })

        # 3. Fetch related study materials (Feature 4 part 2)
        materials = []
        if weak_domains:
            # This assumes study_materials table is populated
            cur.execute("""
                SELECT title, url, material_type, content 
                FROM study_materials 
                WHERE related_topics::text ILIKE ANY(%s)
                LIMIT 3
            """, ([f"%{d}%" for d in weak_domains],))
            
            mat_rows = cur.fetchall()
            for m in mat_rows:
                materials.append({
                    "title": m[0],
                    "url": m[1],
                    "type": m[2],
                    "snippet": m[3][:100] + "..." if m[3] else ""
                })

        return {
            "reason": recommendation_reason,
            "practice_problems": recommendations,
            "study_materials": materials
        }

    finally:
        conn.close()



