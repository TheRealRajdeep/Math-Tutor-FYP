from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

class Problem(BaseModel):
    problem_id: int
    domain: List[str]  # Changed from str to List[str]
    problem: str
    solution: str
    answer: str
    difficulty_level: float
    source: str
    embedding: Optional[str]
    created_at: Optional[datetime]