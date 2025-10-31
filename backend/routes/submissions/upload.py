from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from fastapi.responses import JSONResponse
from db import get_db_connection
import os
import json
import logging
from typing import List
from datetime import datetime
from services.mathpix_service import extract_text_from_image
from services.embedding_service import generate_embedding

router = APIRouter()
logger = logging.getLogger(__name__)


def ensure_storage_dir() -> str:
    storage_path = os.getenv("STORAGE_PATH", os.path.join(os.getcwd(), "storage"))
    os.makedirs(storage_path, exist_ok=True)
    return storage_path


@router.post("/submit_solution")
async def submit_solution(
    test_id: int = Form(...),
    problem_id: int = Form(...),
    student_id: str = Form(...),
    image_files: List[UploadFile] = File(...),
):
    if not image_files or len(image_files) == 0:
        raise HTTPException(status_code=400, detail="At least one image file is required")
    
    storage_dir = ensure_storage_dir()
    all_ocr_text = []
    all_latex = []
    image_paths = []
    timestamp = int(datetime.utcnow().timestamp())

    conn = get_db_connection()
    try:
        with conn:
            with conn.cursor() as cur:
                # Create or fetch submission_id for this test_id + student_id
                cur.execute(
                    """
                    INSERT INTO test_submissions (test_id, student_id, status)
                    VALUES (%s, %s, %s)
                    ON CONFLICT (test_id, student_id) DO UPDATE SET status = EXCLUDED.status
                    RETURNING submission_id
                    """,
                    (test_id, student_id, "processing"),
                )
                result = cur.fetchone()
                if not result:
                    # Fetch existing submission_id if insert didn't return (shouldn't happen with ON CONFLICT RETURNING)
                    cur.execute(
                        """
                        SELECT submission_id FROM test_submissions 
                        WHERE test_id = %s AND student_id = %s
                        """,
                        (test_id, student_id)
                    )
                    row = cur.fetchone()
                    if not row:
                        raise HTTPException(status_code=500, detail="Failed to get or create submission_id")
                    submission_id = row[0]
                else:
                    submission_id = result[0]

                # Process each image file
                for idx, image_file in enumerate(image_files):
                    filename = f"{student_id}_{test_id}_{problem_id}_{idx}_{timestamp}_{image_file.filename}"
                    file_path = os.path.join(storage_dir, filename)
                    
                    try:
                        # Save image file
                        with open(file_path, "wb") as out:
                            content = await image_file.read()
                            out.write(content)
                        
                        image_paths.append(file_path)
                        
                        # Run OCR via MathPix for this image
                        ocr = extract_text_from_image(file_path)
                        if ocr.get("error"):
                            logger.error(f"MathPix OCR failed for image {idx+1}: {ocr.get('error')}")
                            # Continue processing other images even if one fails
                            continue
                        
                        ocr_text = ocr.get("text", "")
                        ocr_latex = ocr.get("latex", "")
                        
                        if ocr_text:
                            all_ocr_text.append(ocr_text)
                        if ocr_latex:
                            all_latex.append(ocr_latex)
                            
                    except Exception as e:
                        logger.error(f"Error processing image {idx+1}: {str(e)}")
                        # Continue with other images
                        continue
                    finally:
                        await image_file.close()

                if not image_paths:
                    raise HTTPException(status_code=500, detail="No images were successfully processed")

                # Combine all OCR text from all pages
                if len(all_ocr_text) > 1:
                    combined_text = "\n\n".join(
                        [f"[Page {i+1}]\n\n{text}" for i, text in enumerate(all_ocr_text)]
                    )
                else:
                    combined_text = "\n\n".join(all_ocr_text) if all_ocr_text else ""
                
                combined_latex = "\n\n".join(all_latex)

                # Upsert problem submission with multiple images
                cur.execute(
                    """
                    INSERT INTO problem_submissions 
                    (submission_id, problem_id, image_url, ocr_text, latex_output, student_solution, ocr_processed_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (submission_id, problem_id)
                    DO UPDATE SET 
                        image_url = EXCLUDED.image_url,
                        ocr_text = COALESCE(EXCLUDED.ocr_text, ''),
                        latex_output = COALESCE(EXCLUDED.latex_output, ''),
                        student_solution = COALESCE(EXCLUDED.student_solution, ''),
                        ocr_processed_at = EXCLUDED.ocr_processed_at
                    """,
                    (
                        submission_id,
                        problem_id,
                        json.dumps(image_paths),  # Store as JSON array
                        combined_text,
                        combined_latex,
                        combined_text,
                        datetime.utcnow(),
                    ),
                )

        return JSONResponse(
            {
                "submission_id": submission_id,
                "problem_id": problem_id,
                "image_urls": image_paths,
                "images_processed": len(image_paths),
                "images_requested": len(image_files),
                "message": f"Upload received. {len(image_paths)} image(s) processed successfully.",
            }
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in submit_solution: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


