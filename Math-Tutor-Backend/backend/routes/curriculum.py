from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from datetime import date, datetime, timedelta
import json
from db.db_connection import get_db_connection
from auth.deps import get_current_user
from schemas.auth import UserOut
from services.curriculum_service import generate_daily_tasks, regenerate_daily_tasks_if_needed

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


# New Curriculum Selection and Daily Tasks Endpoints

class CurriculumSelectionRequest(BaseModel):
    duration_months: int  # 1, 3, 6, or 12


@router.post("/select")
def select_curriculum(
    selection: CurriculumSelectionRequest,
    current_user: UserOut = Depends(get_current_user)
):
    """User selects curriculum duration (one-time selection)"""
    if selection.duration_months not in [1, 3, 6, 12]:
        raise HTTPException(status_code=400, detail="Duration must be 1, 3, 6, or 12 months")
    
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        
        # Check if user already has a selection
        cur.execute("""
            SELECT selection_id FROM user_curriculum_selections 
            WHERE student_id = %s
        """, (current_user.id,))
        
        if cur.fetchone():
            raise HTTPException(
                status_code=400, 
                detail="You have already selected a curriculum plan. This is a one-time selection."
            )
        
        # Calculate end date
        start_date = date.today()
        if selection.duration_months == 1:
            end_date = start_date + timedelta(days=30)
        elif selection.duration_months == 3:
            end_date = start_date + timedelta(days=90)
        elif selection.duration_months == 6:
            end_date = start_date + timedelta(days=180)
        else:  # 12 months
            end_date = start_date + timedelta(days=365)
        
        # Insert selection
        cur.execute("""
            INSERT INTO user_curriculum_selections 
            (student_id, duration_months, start_date, end_date)
            VALUES (%s, %s, %s, %s)
            RETURNING selection_id, duration_months, start_date, end_date, selected_at
        """, (current_user.id, selection.duration_months, start_date, end_date))
        
        row = cur.fetchone()
        conn.commit()
        
        # Generate initial daily tasks for the first week
        for i in range(7):
            task_date = start_date + timedelta(days=i)
            generate_daily_tasks(current_user.id, selection.duration_months, task_date)
        
        return {
            "selection_id": row[0],
            "duration_months": row[1],
            "start_date": row[2],
            "end_date": row[3],
            "selected_at": row[4],
            "message": "Curriculum plan selected successfully. Daily tasks have been generated for the first week."
        }
        
    finally:
        conn.close()


@router.get("/my-selection")
def get_my_curriculum_selection(current_user: UserOut = Depends(get_current_user)):
    """Get user's current curriculum selection"""
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        
        cur.execute("""
            SELECT selection_id, duration_months, start_date, end_date, selected_at
            FROM user_curriculum_selections
            WHERE student_id = %s
        """, (current_user.id,))
        
        row = cur.fetchone()
        
        if not row:
            return {"message": "No curriculum selection found", "has_selection": False}
        
        # Calculate progress
        start_date = row[2]
        end_date = row[3]
        today = date.today()
        
        total_days = (end_date - start_date).days
        days_elapsed = (today - start_date).days if today >= start_date else 0
        days_remaining = max(0, (end_date - today).days)
        progress_percentage = min(100, max(0, (days_elapsed / total_days * 100) if total_days > 0 else 0))
        
        return {
            "has_selection": True,
            "selection_id": row[0],
            "duration_months": row[1],
            "start_date": row[2],
            "end_date": row[3],
            "selected_at": row[4],
            "progress": {
                "days_elapsed": days_elapsed,
                "days_remaining": days_remaining,
                "total_days": total_days,
                "progress_percentage": round(progress_percentage, 2)
            }
        }
        
    finally:
        conn.close()


@router.get("/daily-tasks")
def get_daily_tasks(
    task_date: Optional[date] = None,
    current_user: UserOut = Depends(get_current_user)
):
    """Get daily tasks for the user. Defaults to today if no date provided."""
    if task_date is None:
        task_date = date.today()
    
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        
        # Check if user has a curriculum selection
        cur.execute("""
            SELECT duration_months FROM user_curriculum_selections
            WHERE student_id = %s
        """, (current_user.id,))
        
        selection = cur.fetchone()
        if not selection:
            return {
                "message": "No curriculum selection found. Please select a curriculum plan first.",
                "tasks": []
            }
        
        duration_months = selection[0]
        
        # Check if tasks exist for this date
        cur.execute("""
            SELECT task_id, task_type, task_content, is_completed
            FROM daily_tasks
            WHERE student_id = %s AND task_date = %s
            ORDER BY task_type, task_id
        """, (current_user.id, task_date))
        
        rows = cur.fetchall()
        
        # If no tasks exist, generate them
        if not rows:
            tasks = generate_daily_tasks(current_user.id, duration_months, task_date)
        else:
            tasks = [
                {
                    "task_id": r[0],
                    "task_type": r[1],
                    "task_content": r[2] if isinstance(r[2], dict) else json.loads(r[2]) if isinstance(r[2], str) else r[2],
                    "is_completed": r[3]
                }
                for r in rows
            ]
        
        return {
            "task_date": task_date,
            "tasks": tasks,
            "total_tasks": len(tasks),
            "completed_tasks": sum(1 for t in tasks if t.get("is_completed", False))
        }
        
    finally:
        conn.close()


@router.post("/daily-tasks/{task_id}/complete")
def complete_task(
    task_id: int,
    current_user: UserOut = Depends(get_current_user)
):
    """Mark a daily task as completed"""
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        
        # Verify task belongs to user
        cur.execute("""
            SELECT task_id, is_completed FROM daily_tasks
            WHERE task_id = %s AND student_id = %s
        """, (task_id, current_user.id))
        
        task = cur.fetchone()
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")
        
        if task[1]:  # Already completed
            return {"message": "Task already completed", "task_id": task_id}
        
        # Mark as completed
        cur.execute("""
            UPDATE daily_tasks
            SET is_completed = TRUE
            WHERE task_id = %s AND student_id = %s
        """, (task_id, current_user.id))
        
        conn.commit()
        
        # Check if regeneration is needed
        regenerate_daily_tasks_if_needed(current_user.id)
        
        return {
            "message": "Task marked as completed",
            "task_id": task_id
        }
        
    finally:
        conn.close()


@router.get("/daily-tasks/history")
def get_task_history(
    limit: int = 30,
    current_user: UserOut = Depends(get_current_user)
):
    """Get task history for the user"""
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        
        cur.execute("""
            SELECT task_id, task_date, task_type, task_content, is_completed, created_at
            FROM daily_tasks
            WHERE student_id = %s
            ORDER BY task_date DESC, task_id
            LIMIT %s
        """, (current_user.id, limit))
        
        rows = cur.fetchall()
        
        return {
            "tasks": [
                {
                    "task_id": r[0],
                    "task_date": r[1],
                    "task_type": r[2],
                    "task_content": r[3] if isinstance(r[3], dict) else json.loads(r[3]) if isinstance(r[3], str) else r[3],
                    "is_completed": r[4],
                    "created_at": r[5]
                }
                for r in rows
            ],
            "total": len(rows)
        }
        
    finally:
        conn.close()


