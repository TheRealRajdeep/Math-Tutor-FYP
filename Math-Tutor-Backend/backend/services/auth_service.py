# backend/services/auth_service.py
from sqlalchemy.orm import Session
from ..models.user import User
from ..auth.security import get_password_hash, verify_password
from typing import Optional

def get_user_by_email(db: Session, email: str) -> Optional[User]:
    return db.query(User).filter(User.email == email).first()

def get_user(db: Session, user_id: int) -> Optional[User]:
    return db.query(User).filter(User.id == user_id).first()

def create_user(db: Session, *, name: str, email: str, password: str, school: str | None = None, date_of_birth=None, grade: str | None = None) -> User:
    hashed = get_password_hash(password)
    user = User(
        name=name,
        email=email,
        hashed_password=hashed,
        school=school,
        date_of_birth=date_of_birth,
        grade=grade,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user

def authenticate_user(db: Session, email: str, password: str) -> Optional[User]:
    user = get_user_by_email(db, email)
    if not user:
        return None
    if not verify_password(password, user.hashed_password):
        return None
    return user
