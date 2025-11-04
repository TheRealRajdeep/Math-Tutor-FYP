import torchvision
torchvision.disable_beta_transforms_warning()

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from routes.problems import problems
from routes.rag import rag
from routes.mock_test import mock_test_generation as mock_test
from routes.submissions import upload as submissions_upload
from routes.submissions import grading as submissions_grading
from fastapi.middleware.cors import CORSMiddleware
# from .routes import problems, mock_test, rag

app = FastAPI(
    title="AI Olympiad Tutor API",
    description="APIs for Omni-MATH problem retrieval, mock generation, and RAG search",
    version="1.0.0"
)
print("Server Started")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],       # <-- use specific origins in production
    allow_credentials=False,   # set True only if you need cookies/auth
    allow_methods=["*"],       # allow all HTTP methods
    allow_headers=["*"],       # allow all headers
)

# Mount static files for storage folder - reuse the same function from upload.py
storage_path = submissions_upload.ensure_storage_dir()
app.mount("/storage", StaticFiles(directory=storage_path), name="storage")

app.include_router(problems.router, prefix="/api")
app.include_router(mock_test.router, prefix="/api")
app.include_router(rag.router, prefix="/api")
app.include_router(submissions_upload.router, prefix="/api")
app.include_router(submissions_grading.router, prefix="/api")

if __name__ == "__main__":
    import uvicorn
    # Run as a module from project root: uvicorn backend.main:app --reload
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)
