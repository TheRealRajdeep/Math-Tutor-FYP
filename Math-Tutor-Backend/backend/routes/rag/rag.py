from fastapi import APIRouter
from sentence_transformers import SentenceTransformer
from db.db_connection import get_db_connection

router = APIRouter()
model = None

@router.get("/search")
def semantic_search(query: str, limit: int = 5):
    global model
    if model is None:
        model = SentenceTransformer("all-MiniLM-L6-v2")
    embedding = model.encode(query).tolist()

    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute("""
        SELECT problem_id, problem, solution, answer, domain, difficulty_level
        FROM omni_math_data
        ORDER BY embedding <-> %s
        LIMIT %s;
    """, (embedding, limit))

    results = cur.fetchall()
    cur.close()
    conn.close()

    return [
        {
            "problem_id": r[0],
            "problem": r[1],
            "solution": r[2],
            "answer": r[3],
            "domain": r[4],
            "difficulty_level": r[5]
        } for r in results
    ]
