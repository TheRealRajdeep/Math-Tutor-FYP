import re
from typing import Dict
import numpy as np

from services.embedding_service import generate_embedding


def _cosine_sim(a, b) -> float:
    va = np.array(a)
    vb = np.array(b)
    denom = (np.linalg.norm(va) * np.linalg.norm(vb)) or 1e-8
    return float(np.dot(va, vb) / denom)


def _normalize_answer_text(text: str) -> str:
    if not text:
        return ""
    t = text.strip()
    # remove spaces around LaTeX inline markers
    t = t.replace(" ", "")
    # normalize common unicode minus
    t = t.replace("−", "-")
    return t


def verify_answer_correctness(student_answer: str, correct_answer: str) -> Dict:
    sa = _normalize_answer_text(student_answer)
    ca = _normalize_answer_text(correct_answer)

    if sa and sa == ca:
        return {"is_correct": True, "confidence": 1.0, "match_type": "exact"}

    # semantic fallback
    emb_s = generate_embedding(sa)
    emb_c = generate_embedding(ca)
    sim = _cosine_sim(emb_s, emb_c)
    return {"is_correct": sim >= 0.85, "confidence": sim, "match_type": "semantic"}


def split_into_steps(solution_text: str):
    if not solution_text:
        return []
    # naive split on newlines or sentence terminators
    parts = re.split(r"\n+|(?<=[\.;:])\s+", solution_text)
    return [p.strip() for p in parts if p and len(p.strip()) > 1]


def verify_solution_logical_flow(student_solution: str, reference_solution: str, correct_answer: str) -> Dict:
    student_steps = split_into_steps(student_solution)
    ref_steps = split_into_steps(reference_solution)

    if not student_steps:
        return {
            "logical_score": 0.0,
            "step_count": 0,
            "valid_steps": 0,
            "first_error_step_index": 0,
            "error_summary": "No solution steps found",
        }

    valid = 0
    first_error = None
    for idx, s in enumerate(student_steps):
        # compare each student step against closest reference step
        best = 0.0
        for r in ref_steps:
            best = max(best, _cosine_sim(generate_embedding(s), generate_embedding(r)))
        if best >= 0.70:
            valid += 1
        elif first_error is None:
            first_error = idx

    logical_score = valid / max(len(student_steps), 1)
    return {
        "logical_score": float(logical_score),
        "step_count": len(student_steps),
        "valid_steps": valid,
        "first_error_step_index": 0 if first_error is None else int(first_error),
        "error_summary": None if first_error is None else f"Step {first_error+1} deviates from reference",
    }


def calculate_final_score(answer_result: Dict, solution_result: Dict, max_score: float = 1.0) -> Dict:
    answer_correct = 1.0 if answer_result.get("is_correct") else 0.0
    logical_score = float(solution_result.get("logical_score", 0.0))

    if answer_correct >= 0.999:
        answer_weight, solution_weight = 0.4, 0.6
    elif logical_score > 0:
        answer_weight, solution_weight = 0.2, 0.8
    else:
        answer_weight, solution_weight = 0.5, 0.5

    final_score = answer_weight * answer_correct + solution_weight * logical_score
    percentage = max_score * final_score * 100.0
    return {
        "final_score": float(final_score),
        "max_score": float(max_score),
        "percentage": float(percentage),
    }


