from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from fastapi.responses import JSONResponse
from db import get_db_connection
import os
import json
import re
import logging
from typing import List, Optional
from datetime import datetime
from services.mathpix_service import extract_text_from_image
from services.embedding_service import generate_embedding

router = APIRouter()
logger = logging.getLogger(__name__)


def ensure_storage_dir() -> str:
    storage_path = os.getenv("STORAGE_PATH", os.path.join(os.getcwd(), "storage"))
    os.makedirs(storage_path, exist_ok=True)
    return storage_path


def extract_answer_from_text(ocr_text: str) -> Optional[str]:
    """
    Extract the answer from OCR text by looking for answer keywords.
    Looks for patterns like: "ans:", "answer:", "Answer:", "Ans:", etc.
    Returns the extracted answer or None if not found.
    """
    if not ocr_text:
        return None
    
    # Normalize text: convert to lowercase for matching, but preserve original for extraction
    text_lower = ocr_text.lower()
    
    # Patterns to look for (case-insensitive)
    # Common patterns: "ans:", "answer:", "final answer:", "answer is", etc.
    patterns = [
        r'answer\s*:?\s*(.+?)(?:\n|$|\.|,|;|$)',
        r'ans\s*:?\s*(.+?)(?:\n|$|\.|,|;|$)',
        r'final\s+answer\s*:?\s*(.+?)(?:\n|$|\.|,|;|$)',
        r'answer\s+is\s*:?\s*(.+?)(?:\n|$|\.|,|;|$)',
        r'ans\s+=\s*(.+?)(?:\n|$|\.|,|;|$)',
        r'answer\s+=\s*(.+?)(?:\n|$|\.|,|;|$)',
    ]
    
    # Try each pattern (case-insensitive)
    for pattern in patterns:
        matches = re.finditer(pattern, ocr_text, re.IGNORECASE | re.MULTILINE | re.DOTALL)
        for match in matches:
            answer = match.group(1).strip()
            # Clean up common trailing punctuation and whitespace
            answer = re.sub(r'[.,;:]+\s*$', '', answer)
            answer = answer.strip()
            
            # Skip if answer is too short or empty
            if len(answer) > 0:
                # Remove common prefixes that might have been captured
                answer = re.sub(r'^(is|equals?|=\s*)', '', answer, flags=re.IGNORECASE).strip()
                if len(answer) > 0:
                    return answer
    
    # Fallback: look for patterns at the end of text (often answers are at the end)
    # Check last few lines for answer indicators
    lines = ocr_text.split('\n')
    # Check last 3 lines
    for line in reversed(lines[-3:]):
        line_lower = line.lower().strip()
        # Look for lines that start with answer keywords
        if line_lower.startswith(('ans:', 'answer:', 'ans ', 'answer ')):
            # Extract everything after the keyword
            match = re.search(r'(?:ans|answer)\s*:?\s*(.+)', line, re.IGNORECASE)
            if match:
                answer = match.group(1).strip()
                answer = re.sub(r'[.,;:]+\s*$', '', answer).strip()
                if len(answer) > 0:
                    return answer
    
    return None


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
                        
                        if ocr_text:
                            all_ocr_text.append(ocr_text)
                            
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
                
                logger.info(f"Combined OCR text length: {len(combined_text)} characters")
                
                # Extract answer from combined OCR text
                extracted_answer = extract_answer_from_text(combined_text)
                if extracted_answer:
                    logger.info(f"Extracted answer for problem {problem_id}: {extracted_answer}")
                else:
                    logger.warning(f"Could not extract answer from OCR text for problem {problem_id}")

                # Upsert problem submission with multiple images
                cur.execute(
                    """
                    INSERT INTO problem_submissions 
                    (submission_id, problem_id, image_url, ocr_text, student_solution, student_answer, ocr_processed_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (submission_id, problem_id)
                    DO UPDATE SET 
                        image_url = EXCLUDED.image_url,
                        ocr_text = COALESCE(EXCLUDED.ocr_text, problem_submissions.ocr_text),
                        student_solution = COALESCE(EXCLUDED.student_solution, problem_submissions.student_solution),
                        student_answer = COALESCE(EXCLUDED.student_answer, problem_submissions.student_answer),
                        ocr_processed_at = EXCLUDED.ocr_processed_at
                    """,
                    (
                        submission_id,
                        problem_id,
                        json.dumps(image_paths),  # Store as JSON array
                        combined_text,
                        combined_text,
                        extracted_answer,  # Store extracted answer
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


