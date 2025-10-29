from fastapi import FastAPI
from .routes import problems  

app = FastAPI(
    title="AI Olympiad Tutor API",
    description="APIs for fetching Omni-MATH problems by topic and difficulty",
    version="1.0.0"
)

app.include_router(problems.router, prefix="/api")
