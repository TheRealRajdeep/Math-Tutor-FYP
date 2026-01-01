from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from datetime import date
import json
from db.db_connection import get_db_connection
from auth.deps import get_current_user
from schemas.auth import UserOut

router = APIRouter(prefix="/curriculum", tags=["Curriculum"])

class BatchCreate(BaseModel):
    batch_name: str
    duration_months: int  # 1, 3, 6, 12
    start_date: date

class BatchOut(BatchCreate):
    batch_id: int

class CurriculumPlanItem(BaseModel):
    week_number: int
    topic: str
    description: Optional[str] = None
    resources: Optional[List[dict]] = []

@router.post("/batches", response_model=BatchOut)
def create_batch(batch: BatchCreate, current_user: UserOut = Depends(get_current_user)):
    # In a real app, restrict to admin
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO batches (batch_name, duration_months, start_date)
            VALUES (%s, %s, %s)
            RETURNING batch_id, batch_name, duration_months, start_date
            """,
            (batch.batch_name, batch.duration_months, batch.start_date)
        )
        row = cur.fetchone()
        conn.commit()
        return {
            "batch_id": row[0],
            "batch_name": row[1],
            "duration_months": row[2],
            "start_date": row[3]
        }
    finally:
        conn.close()

@router.get("/batches", response_model=List[BatchOut])
def get_batches():
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        cur.execute("SELECT batch_id, batch_name, duration_months, start_date FROM batches ORDER BY start_date DESC")
        rows = cur.fetchall()
        return [
            {
                "batch_id": r[0],
                "batch_name": r[1],
                "duration_months": r[2],
                "start_date": r[3]
            } for r in rows
        ]
    finally:
        conn.close()

@router.post("/batches/{batch_id}/plan")
def add_curriculum_to_batch(batch_id: int, plan: CurriculumPlanItem, current_user: UserOut = Depends(get_current_user)):
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        # Verify batch exists
        cur.execute("SELECT 1 FROM batches WHERE batch_id = %s", (batch_id,))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Batch not found")

        cur.execute(
            """
            INSERT INTO curriculum_plans (batch_id, week_number, topic, description, resources)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING plan_id
            """,
            (batch_id, plan.week_number, plan.topic, plan.description, json.dumps(plan.resources))
        )
        conn.commit()
        return {"status": "success", "plan_id": cur.fetchone()[0]}
    finally:
        conn.close()

@router.get("/my-plan")
def get_student_curriculum(current_user: UserOut = Depends(get_current_user)):
    """Get the curriculum plan for the current student's batch"""
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        
        # Get student's batch
        cur.execute("SELECT batch_id FROM users WHERE id = %s", (current_user.id,))
        user_row = cur.fetchone()
        
        if not user_row or not user_row[0]:
            # Fallback or empty if not assigned to a batch
            return {"message": "Student not assigned to a batch", "plan": []}
            
        batch_id = user_row[0]
        
        cur.execute(
            """
            SELECT week_number, topic, description, resources 
            FROM curriculum_plans 
            WHERE batch_id = %s 
            ORDER BY week_number ASC
            """, 
            (batch_id,)
        )
        rows = cur.fetchall()
        
        return {
            "batch_id": batch_id,
            "plan": [
                {
                    "week": r[0],
                    "topic": r[1],
                    "description": r[2],
                    "resources": r[3]
                } for r in rows
            ]
        }
    finally:
        conn.close()


