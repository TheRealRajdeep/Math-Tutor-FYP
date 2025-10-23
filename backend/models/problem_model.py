from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

class Problem(BaseModel):
    problem_id: int
    domain: str
    problem: str
    solution: str
    answer: str
    difficulty_level: float
    source: str
    embedding: Optional[str]  # Assuming this might be a string representation
    created_at: Optional[datetime]