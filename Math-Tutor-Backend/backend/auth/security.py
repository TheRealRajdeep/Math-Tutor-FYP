# backend/auth/security.py
from passlib.context import CryptContext

# Using argon2 (no 72-byte limit, stronger defaults than bcrypt)
pwd_ctx = CryptContext(schemes=["argon2"], deprecated="auto")

def get_password_hash(password: str) -> str:
    return pwd_ctx.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_ctx.verify(plain_password, hashed_password)
