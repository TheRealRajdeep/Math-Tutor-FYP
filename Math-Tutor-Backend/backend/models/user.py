# backend/models/user.py
from sqlalchemy import Column, Integer, String, Boolean, Date, DateTime, func
from db.base import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(length=256), nullable=False)
    school = Column(String(length=256), nullable=True)
    date_of_birth = Column(Date, nullable=True)
    email = Column(String(length=320), unique=True, nullable=False, index=True)
    grade = Column(String(length=50), nullable=True)

    hashed_password = Column(String(length=512), nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
