from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from fastapi.responses import JSONResponse
from db.db_connection import get_db_connection
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

    patterns = [
        r'\banswer\s*:?\s*(.+?)(?:\n|$|\.|,|;|$)',
        r'\bans\s*:?\s*(.+?)(?:\n|$|\.|,|;|$)',
        r'final\s+answer\s*:?\s*(.+?)(?:\n|$|\.|,|;|$)',
        r'\banswer\s+is\s*:?\s*(.+?)(?:\n|$|\.|,|;|$)',
        r'\bans\s+=\s*(.+?)(?:\n|$|\.|,|;|$)',
        r'\banswer\s+=\s*(.+?)(?:\n|$|\.|,|;|$)',
        # Removed aggressive equals matchers that catch equations
        r'[│┃│┌┐└┘├┤┬┴┼║╔╗╚╝╠╣╦╩╬─━═][\s]*(.+?)[\s]*[│┃│┌┐└┘├┤┬┴┼║╔╗╚╝╠╣╦╩╬─━═]',
        # Removed aggressive bracket matcher that was catching [Page 1]
        r'\|[\s]*(.+?)[\s]*\|',
    ]

    for pattern_idx, pattern in enumerate(patterns):
        matches = list(re.finditer(pattern, ocr_text, re.IGNORECASE | re.MULTILINE | re.DOTALL))

        if matches:
            match = matches[0]
        else:
            continue

        answer = match.group(1).strip()
        answer = re.sub(r'[.,;:]+\s*$', '', answer)
        answer = answer.strip()

        if len(answer) > 0:
            answer = re.sub(r'^(is|equals?|=\s*)', '', answer, flags=re.IGNORECASE).strip()
            if len(answer) > 0:
                return answer

    lines = ocr_text.split('\n')
    for line in reversed(lines[-3:]):
        line_lower = line.lower().strip()
        if line_lower.startswith(('ans:', 'answer:', 'ans ', 'answer ')):
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
                # Special handling for practice problems (test_id=0)
                if test_id == 0:
                    cur.execute(
                        """
                        SELECT test_id FROM mock_tests 
                        WHERE student_id = %s AND test_type = 'Practice Session'
                        LIMIT 1
                        """,
                        (student_id,)
                    )
                    row = cur.fetchone()

                    if row:
                        test_id = row[0]
                    else:
                        cur.execute(
                            """
                            INSERT INTO mock_tests (test_type, student_id, problems, status)
                            VALUES (%s, %s, '[]'::jsonb, 'in_progress')
                            RETURNING test_id
                            """,
                            ('Practice Session', student_id)
                        )
                        test_id = cur.fetchone()[0]

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

                for idx, image_file in enumerate(image_files):
                    filename = f"{student_id}_{test_id}_{problem_id}_{idx}_{timestamp}_{image_file.filename}"
                    file_path = os.path.join(storage_dir, filename)

                    try:
                        with open(file_path, "wb") as out:
                            content = await image_file.read()
                            out.write(content)

                        image_paths.append(file_path)

                        ocr = extract_text_from_image(file_path)
                        if ocr.get("error"):
                            logger.error(f"MathPix OCR failed for image {idx+1}: {ocr.get('error')}")
                            continue

                        ocr_text = ocr.get("text", "")

                        if ocr_text:
                            all_ocr_text.append(ocr_text)

                    except Exception as e:
                        logger.error(f"Error processing image {idx+1}: {str(e)}")
                        continue
                    finally:
                        await image_file.close()

                if not image_paths:
                    raise HTTPException(status_code=500, detail="No images were successfully processed")

                if len(all_ocr_text) > 1:
                    combined_text = "\n\n".join(
                        [f"[Page {i+1}]\n\n{text}" for i, text in enumerate(all_ocr_text)]
                    )
                else:
                    combined_text = "\n\n".join(all_ocr_text) if all_ocr_text else ""

                logger.info(f"Combined OCR text length: {len(combined_text)} characters")

                extracted_answer = extract_answer_from_text(combined_text)
                print(f"Extracted answer: {extracted_answer}")
                if extracted_answer:
                    logger.info(f"Extracted answer for problem {problem_id}: {extracted_answer}")
                else:
                    logger.warning(f"Could not extract answer from OCR text for problem {problem_id}")

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
                        json.dumps(image_paths),
                        combined_text,
                        combined_text,
                        extracted_answer,
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
