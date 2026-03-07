"""
Recommendations Service — Pillar 4

Builds a personalised resource list for each student based on:
  1. Their weakest domains (from grading history)
  2. Specific error themes per domain (from grading_results.error_summary)
  3. Resources in study_materials that match those domains
  4. A curated static fallback bank when the DB is sparse
  5. A GPT-4o-mini study tip tailored to the student's error themes
"""
import json
import logging
import os
from typing import Optional

from openai import OpenAI
from db.db_connection import get_db_connection

logger = logging.getLogger(__name__)

# ─── Curated static resource bank ────────────────────────────────────────────
# These are inserted into study_materials on first use so they can be tracked
# in student_recommendations.  URLs are stable, well-known math resources.
CURATED: dict[str, list[dict]] = {
    "Algebra": [
        {
            "title": "AoPS Algebra Wiki",
            "url": "https://artofproblemsolving.com/wiki/index.php/Algebra",
            "material_type": "article",
            "content": "Comprehensive Algebra wiki by Art of Problem Solving covering polynomials, "
                       "inequalities, sequences, and olympiad techniques.",
            "related_topics": ["Algebra"],
        },
        {
            "title": "Khan Academy — Algebra Basics",
            "url": "https://www.khanacademy.org/math/algebra",
            "material_type": "video",
            "content": "Free video lessons on algebra fundamentals, equations, and functions.",
            "related_topics": ["Algebra"],
        },
        {
            "title": "Brilliant — Algebra Course",
            "url": "https://brilliant.org/courses/algebra/",
            "material_type": "practice",
            "content": "Interactive algebra problems from foundational to olympiad level.",
            "related_topics": ["Algebra"],
        },
        {
            "title": "AoPS — Algebraic Manipulations Cheatsheet",
            "url": "https://artofproblemsolving.com/wiki/index.php/Algebraic_manipulation",
            "material_type": "cheat_sheet",
            "content": "Key identities and manipulation techniques used in olympiad algebra.",
            "related_topics": ["Algebra"],
        },
    ],
    "Geometry": [
        {
            "title": "AoPS Geometry Wiki",
            "url": "https://artofproblemsolving.com/wiki/index.php/Geometry",
            "material_type": "article",
            "content": "Geometry reference covering circles, triangles, angle chasing, and proofs.",
            "related_topics": ["Geometry"],
        },
        {
            "title": "Khan Academy — High School Geometry",
            "url": "https://www.khanacademy.org/math/geometry",
            "material_type": "video",
            "content": "Video lessons on angles, congruence, similarity, and coordinate geometry.",
            "related_topics": ["Geometry"],
        },
        {
            "title": "Brilliant — Geometry Course",
            "url": "https://brilliant.org/courses/geometry/",
            "material_type": "practice",
            "content": "Interactive geometry puzzles and olympiad-level challenges.",
            "related_topics": ["Geometry"],
        },
        {
            "title": "AoPS — Angle Chasing Guide",
            "url": "https://artofproblemsolving.com/wiki/index.php/Angle_chasing",
            "material_type": "cheat_sheet",
            "content": "Concise reference on angle chasing techniques for olympiad geometry.",
            "related_topics": ["Geometry"],
        },
    ],
    "Number Theory": [
        {
            "title": "AoPS Number Theory Wiki",
            "url": "https://artofproblemsolving.com/wiki/index.php/Number_theory",
            "material_type": "article",
            "content": "Deep reference on divisibility, primes, modular arithmetic, and Diophantine equations.",
            "related_topics": ["Number Theory"],
        },
        {
            "title": "Khan Academy — Factors & Multiples",
            "url": "https://www.khanacademy.org/math/cc-sixth-grade-math/cc-6th-factors-and-multiples",
            "material_type": "video",
            "content": "Video lessons on GCD, LCM, prime factorisation, and divisibility rules.",
            "related_topics": ["Number Theory"],
        },
        {
            "title": "Brilliant — Number Theory Course",
            "url": "https://brilliant.org/courses/number-theory/",
            "material_type": "practice",
            "content": "Interactive number theory from modular arithmetic to advanced olympiad topics.",
            "related_topics": ["Number Theory"],
        },
        {
            "title": "AoPS — Modular Arithmetic Cheatsheet",
            "url": "https://artofproblemsolving.com/wiki/index.php/Modular_arithmetic",
            "material_type": "cheat_sheet",
            "content": "Key properties and techniques for modular arithmetic problems.",
            "related_topics": ["Number Theory"],
        },
    ],
    "Combinatorics": [
        {
            "title": "AoPS Combinatorics Wiki",
            "url": "https://artofproblemsolving.com/wiki/index.php/Combinatorics",
            "material_type": "article",
            "content": "Reference covering counting, permutations, combinations, graph theory, and pigeonhole.",
            "related_topics": ["Combinatorics"],
        },
        {
            "title": "Khan Academy — Counting & Probability",
            "url": "https://www.khanacademy.org/math/statistics-probability/counting-permutations-and-combinations",
            "material_type": "video",
            "content": "Video lessons on permutations, combinations, and basic probability.",
            "related_topics": ["Combinatorics"],
        },
        {
            "title": "Brilliant — Combinatorics Course",
            "url": "https://brilliant.org/courses/combinatorics/",
            "material_type": "practice",
            "content": "Interactive combinatorics problems from introductory to olympiad level.",
            "related_topics": ["Combinatorics"],
        },
        {
            "title": "AoPS — Pigeonhole Principle Guide",
            "url": "https://artofproblemsolving.com/wiki/index.php/Pigeonhole_Principle",
            "material_type": "cheat_sheet",
            "content": "Explanation and worked examples of the pigeonhole principle in contests.",
            "related_topics": ["Combinatorics"],
        },
    ],
}

TYPE_ICON = {
    "video": "🎬",
    "article": "📖",
    "practice": "✏️",
    "cheat_sheet": "📋",
}


# ─── helpers ──────────────────────────────────────────────────────────────────

def _upsert_material(cur, resource: dict) -> int:
    """
    Insert a curated resource into study_materials if not already present (by URL).
    Returns the material_id.
    """
    cur.execute("SELECT material_id FROM study_materials WHERE url = %s", (resource["url"],))
    row = cur.fetchone()
    if row:
        return row[0]

    cur.execute(
        """
        INSERT INTO study_materials (title, material_type, url, content, related_topics)
        VALUES (%s, %s, %s, %s, %s::jsonb)
        RETURNING material_id
        """,
        (
            resource["title"],
            resource["material_type"],
            resource["url"],
            resource["content"],
            json.dumps(resource["related_topics"]),
        ),
    )
    return cur.fetchone()[0]


def _ensure_recommendation(cur, student_id: int, material_id: int, reason: str) -> tuple[int, bool]:
    """
    Get or create a student_recommendation row.
    Returns (recommendation_id, is_completed).
    """
    cur.execute(
        """
        SELECT recommendation_id, is_completed
        FROM student_recommendations
        WHERE student_id = %s AND material_id = %s
        """,
        (student_id, material_id),
    )
    row = cur.fetchone()
    if row:
        return row[0], bool(row[1])

    cur.execute(
        """
        INSERT INTO student_recommendations (student_id, material_id, reason)
        VALUES (%s, %s, %s)
        RETURNING recommendation_id
        """,
        (student_id, material_id, reason),
    )
    return cur.fetchone()[0], False


def _generate_study_tip(domain: str, error_themes: list[str]) -> Optional[str]:
    """
    Call GPT-4o-mini to generate a concise, personalised study tip for the domain
    based on the student's specific error themes.
    """
    if not error_themes:
        return None

    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        return None

    try:
        client = OpenAI(api_key=api_key)
        themes_str = "; ".join(error_themes[:5])
        prompt = (
            f"A student preparing for math olympiads is weak in {domain}. "
            f"Their recent mistakes cluster around these themes: {themes_str}.\n\n"
            f"Write 2–3 sentences of highly specific, actionable study advice targeting "
            f"these exact error patterns. Be direct and practical — name specific theorems, "
            f"techniques, or problem types they should review. Do not repeat the error themes "
            f"verbatim; instead give concrete next-step guidance."
        )
        resp = client.chat.completions.create(
            model=os.getenv("RECOMMENDATION_MODEL", "gpt-4o-mini"),
            messages=[
                {"role": "system", "content": "You are a concise math olympiad coach."},
                {"role": "user", "content": prompt},
            ],
            max_tokens=200,
            temperature=0.5,
        )
        return resp.choices[0].message.content.strip()
    except Exception as exc:
        logger.warning("Study tip generation failed for %s: %s", domain, exc)
        return None


# ─── main public function ─────────────────────────────────────────────────────

def get_recommendations_for_student(student_id: int, max_domains: int = 3) -> dict:
    """
    Build a personalised resource list for the student.

    Returns:
        {
            "weak_domains": [
                {
                    "domain": str,
                    "avg_score": float,
                    "strength_level": str,
                    "error_themes": [str],
                    "resources": [
                        {
                            "recommendation_id": int,
                            "material_id": int,
                            "title": str,
                            "url": str,
                            "type": str,
                            "description": str,
                            "is_completed": bool,
                            "icon": str,
                        }
                    ],
                    "study_tip": str | None,
                }
            ],
            "all_completed": bool,
        }
    """
    conn = get_db_connection()
    try:
        cur = conn.cursor()

        # ── 1. Identify weak domains (avg_score < 75) from grading history ──
        cur.execute("""
            WITH DS AS (
                SELECT
                    TRIM(d.domain)      AS domain,
                    AVG(gr.percentage)  AS avg_score,
                    COUNT(*)::int       AS total
                FROM grading_results gr
                JOIN test_submissions ts ON ts.submission_id = gr.submission_id
                JOIN omni_math_data omd   ON omd.problem_id  = gr.problem_id
                JOIN LATERAL unnest(string_to_array(omd.domain, ',')) AS d(domain) ON TRUE
                WHERE ts.student_id = %s
                GROUP BY TRIM(d.domain)
            )
            SELECT domain, avg_score, total
            FROM DS
            WHERE domain IS NOT NULL AND TRIM(domain) != ''
            ORDER BY avg_score ASC
            LIMIT %s
        """, (str(student_id), max_domains))

        domain_rows = cur.fetchall()

        # Fall back to all known domains if no history
        if not domain_rows:
            domain_rows = [
                ("Algebra", 0.0, 0),
                ("Geometry", 0.0, 0),
                ("Number Theory", 0.0, 0),
            ]

        # ── 2. Per-domain: get error themes ──────────────────────────────────
        weak_domains = []

        for domain_raw, avg_raw, total in domain_rows:
            domain = domain_raw.strip()
            avg_score = float(avg_raw) if avg_raw else 0.0

            if avg_score >= 75:
                strength_level = "strong"
            elif avg_score >= 50:
                strength_level = "developing"
            else:
                strength_level = "weak"

            # Get the student's distinct error summaries in this domain
            cur.execute("""
                SELECT DISTINCT gr.error_summary
                FROM grading_results gr
                JOIN test_submissions ts ON ts.submission_id = gr.submission_id
                JOIN omni_math_data omd   ON omd.problem_id  = gr.problem_id
                WHERE ts.student_id = %s
                  AND omd.domain ILIKE %s
                  AND gr.error_summary IS NOT NULL
                  AND gr.error_summary != ''
                ORDER BY gr.error_summary
                LIMIT 5
            """, (str(student_id), f"%{domain}%"))
            error_themes = [r[0] for r in cur.fetchall()]

            # ── 3. Find resources from study_materials ──────────────────────
            # Exclude materials already completed by this student
            cur.execute("""
                SELECT sm.material_id, sm.title, sm.url, sm.material_type, sm.content
                FROM study_materials sm
                WHERE sm.related_topics::text ILIKE %s
                  AND sm.material_id NOT IN (
                      SELECT material_id FROM student_recommendations
                      WHERE student_id = %s AND is_completed = TRUE
                  )
                ORDER BY sm.material_id
                LIMIT 4
            """, (f"%{domain}%", student_id))

            db_materials = cur.fetchall()

            resources = []

            # Add DB resources
            for mat_id, title, url, mat_type, content in db_materials:
                reason = f"Recommended for {domain} weakness"
                rec_id, is_done = _ensure_recommendation(cur, student_id, mat_id, reason)
                if not is_done:
                    resources.append({
                        "recommendation_id": rec_id,
                        "material_id": mat_id,
                        "title": title,
                        "url": url or "",
                        "type": mat_type,
                        "description": (content or "")[:120] + "…" if content and len(content) > 120 else (content or ""),
                        "is_completed": False,
                        "icon": TYPE_ICON.get(mat_type, "📚"),
                        "source": "db",
                    })

            # ── 4. Supplement with curated resources if DB is sparse ────────
            if len(resources) < 3 and domain in CURATED:
                # Check which curated URLs are already completed
                completed_urls: set[str] = set()
                cur.execute("""
                    SELECT sm.url FROM student_recommendations sr
                    JOIN study_materials sm ON sm.material_id = sr.material_id
                    WHERE sr.student_id = %s AND sr.is_completed = TRUE
                """, (student_id,))
                completed_urls = {r[0] for r in cur.fetchall() if r[0]}

                for curated_res in CURATED[domain]:
                    if len(resources) >= 4:
                        break
                    if curated_res["url"] in completed_urls:
                        continue

                    mat_id = _upsert_material(cur, curated_res)
                    reason = f"Curated resource for {domain}"
                    rec_id, is_done = _ensure_recommendation(cur, student_id, mat_id, reason)
                    if not is_done:
                        resources.append({
                            "recommendation_id": rec_id,
                            "material_id": mat_id,
                            "title": curated_res["title"],
                            "url": curated_res["url"],
                            "type": curated_res["material_type"],
                            "description": curated_res["content"][:120] + "…"
                                if len(curated_res["content"]) > 120
                                else curated_res["content"],
                            "is_completed": False,
                            "icon": TYPE_ICON.get(curated_res["material_type"], "📚"),
                            "source": "curated",
                        })

            # ── 5. Generate personalised study tip ──────────────────────────
            study_tip = _generate_study_tip(domain, error_themes)

            conn.commit()  # persist any new study_materials / student_recommendations rows

            weak_domains.append({
                "domain": domain,
                "avg_score": round(avg_score, 1),
                "strength_level": strength_level,
                "error_themes": error_themes,
                "resources": resources,
                "study_tip": study_tip,
            })

        all_completed = all(
            len(d["resources"]) == 0 for d in weak_domains
        )

        return {
            "weak_domains": weak_domains,
            "all_completed": all_completed,
        }

    except Exception as exc:
        logger.exception("get_recommendations_for_student failed for student %d", student_id)
        raise
    finally:
        conn.close()


def mark_recommendation_complete(student_id: int, recommendation_id: int) -> bool:
    """
    Mark a recommendation as completed.
    Returns True on success, False if record not found / not owned by student.
    """
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            UPDATE student_recommendations
            SET is_completed = TRUE
            WHERE recommendation_id = %s AND student_id = %s
            RETURNING recommendation_id
            """,
            (recommendation_id, student_id),
        )
        updated = cur.fetchone()
        conn.commit()
        return updated is not None
    finally:
        conn.close()
