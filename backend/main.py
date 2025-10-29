from fastapi import FastAPI
from routes import problems, mock_test, rag
# from .routes import problems, mock_test, rag

app = FastAPI(
    title="AI Olympiad Tutor API",
    description="APIs for Omni-MATH problem retrieval, mock generation, and RAG search",
    version="1.0.0"
)

app.include_router(problems.router, prefix="/api")
app.include_router(mock_test.router, prefix="/api")
app.include_router(rag.router, prefix="/api")
