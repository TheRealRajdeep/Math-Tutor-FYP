# backend/main.py
from dotenv import load_dotenv
load_dotenv()

import logging
import os
import inngest.fast_api

try:
    import torchvision
    if hasattr(torchvision, "disable_beta_transforms_warning"):
        torchvision.disable_beta_transforms_warning()
except Exception:
    pass

from events.client import inngest_client
from events.functions import inngest_functions
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

from routes.problems import problems
from routes.rag import tutor
from routes.mock_test import mock_test_generation as mock_test
from routes.submissions import upload as submissions_upload
from routes.submissions import grading as submissions_grading
from auth import routes as auth_routes
from routes import curriculum, practice

from db.session import engine
from db.base import Base

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="AI Olympiad Tutor API",
    description="APIs for Omni-MATH problem retrieval, mock generation, and RAG search",
    version="1.0.0",
)

logger.info("Server starting...")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://math-tutor-fyp-frontend-production.up.railway.app",
        "http://localhost:3000",
        "http://localhost:5173",
    ],
    allow_origin_regex="https://.*\\.up\\.railway\\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

try:
    Base.metadata.create_all(bind=engine)
    logger.info("Database tables ensured.")
except Exception as e:
    logger.exception("Failed to create tables (if using migrations this may be expected): %s", e)

try:
    storage_path = submissions_upload.ensure_storage_dir()
    app.mount("/storage", StaticFiles(directory=storage_path), name="storage")
    logger.info("Mounted storage at %s", storage_path)
except Exception as e:
    logger.exception("Failed to mount storage directory: %s", e)

app.include_router(problems.router, prefix="/api")
app.include_router(mock_test.router, prefix="/api")
app.include_router(tutor.router, prefix="/api")
app.include_router(submissions_upload.router, prefix="/api")
app.include_router(submissions_grading.router, prefix="/api")
app.include_router(auth_routes.router)
app.include_router(curriculum.router, prefix="/api")
app.include_router(practice.router, prefix="/api")

# Inngest requires INNGEST_SIGNING_KEY (from Inngest Cloud dashboard). Skip serve when missing so the app can run locally.
if os.getenv("INNGEST_SIGNING_KEY"):
    inngest.fast_api.serve(
        app,
        inngest_client,
        inngest_functions,
    )
    logger.info("Inngest serve mounted.")
else:
    logger.warning(
        "INNGEST_SIGNING_KEY not set. Inngest endpoints disabled. Event-driven mock test generation will not run."
    )


@app.on_event("startup")
async def _preload_models():
    logger.info("Running startup preloads...")
    try:
        try:
            from services.embedding_service import get_embedding_model as _get_embedding_model
            _get_embedding_model()
            logger.info("Embedding model preloaded.")
        except Exception as e:
            logger.warning("Embedding model preload skipped / failed: %s", e)

        try:
            from services.tutor_service import _get_semantic_model as _get_tutor_model
            _get_tutor_model()
            logger.info("Tutor semantic model preloaded.")
        except Exception as e:
            logger.warning("Tutor model preload skipped / failed: %s", e)

        from dotenv import load_dotenv
        load_dotenv()
        if os.getenv("OPENAI_API_KEY"):
            logger.info("OpenAI API key detected in environment.")
        else:
            logger.warning("OpenAI API key NOT found. RAG hint generation will fail until configured.")
    except Exception as e:
        logger.exception("Error during startup preload: %s", e)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)
