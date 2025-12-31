# backend/auth/routes.py
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from db.session import get_db
from schemas.auth import UserCreate, UserOut, Token
from services.auth_service import get_user_by_email, create_user, authenticate_user
from .jwt_utils import create_access_token
from .deps import get_current_user

router = APIRouter(tags=["auth"], prefix="/auth")


@router.post(
    "/signup",
    response_model=UserOut,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new user account",
)
def signup(*, db: Session = Depends(get_db), in_user: UserCreate) -> UserOut:
    """
    Create a new user. Returns the created user (without password).
    """
    existing = get_user_by_email(db, in_user.email)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered",
        )

    user = create_user(
        db,
        name=in_user.name,
        email=in_user.email,
        password=in_user.password,
        school=in_user.school,
        date_of_birth=in_user.date_of_birth,
        grade=in_user.grade,
    )
    return user


@router.post(
    "/login",
    response_model=Token,
    summary="Login and receive an access token (OAuth2 password grant)",
)
def login(
    form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)
) -> Any:
    """
    Login endpoint that accepts form-encoded fields:
      - username: user's email
      - password: user's password

    Returns:
      - access_token and token_type ("bearer")
    Note: OAuth2PasswordRequestForm expects application/x-www-form-urlencoded.
    """
    # OAuth2PasswordRequestForm uses `username` and `password` fields.
    user = authenticate_user(db, email=form_data.username, password=form_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token = create_access_token(subject=user.id)
    return {"access_token": access_token, "token_type": "bearer"}


@router.get("/me", response_model=UserOut, summary="Get current authenticated user")
def me(current_user=Depends(get_current_user)) -> UserOut:
    """
    Returns the currently authenticated user (derived from the Bearer token).
    """
    return current_user
