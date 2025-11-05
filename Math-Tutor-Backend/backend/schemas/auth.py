# backend/schemas/auth.py
from pydantic import BaseModel, EmailStr
from datetime import date
from typing import Optional

class UserCreate(BaseModel):
    name: str
    school: Optional[str] = None
    date_of_birth: Optional[date] = None
    email: EmailStr
    grade: Optional[str] = None
    password: str

class UserOut(BaseModel):
    id: int
    name: str
    school: Optional[str] = None
    date_of_birth: Optional[date] = None
    email: EmailStr
    grade: Optional[str] = None
    is_active: bool

    class Config:
        orm_mode = True

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"

class TokenPayload(BaseModel):
    sub: int | None = None  # user id
    exp: int | None = None
