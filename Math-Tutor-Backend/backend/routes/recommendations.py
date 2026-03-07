from fastapi import APIRouter, Depends, HTTPException, Query

from auth.deps import get_current_user
from schemas.auth import UserOut
from services.recommendations_service import (
    get_recommendations_for_student,
    mark_recommendation_complete,
)

router = APIRouter(prefix="/recommendations", tags=["Recommendations"])


@router.get("")
def get_recommendations(
    max_domains: int = Query(default=3, ge=1, le=6),
    current_user: UserOut = Depends(get_current_user),
):
    """
    Return personalised resource recommendations for the student's weakest domains.

    For each weak domain:
    - Resources from study_materials that match the domain (DB-stored resources).
    - Curated fallback resources from well-known platforms (AoPS, Khan Academy,
      Brilliant) when the DB is sparse — automatically inserted into study_materials
      on first call so they can be tracked.
    - A GPT-generated study tip tailored to the student's specific error themes.

    Resources the student has already completed are excluded automatically.
    """
    try:
        return get_recommendations_for_student(current_user.id, max_domains=max_domains)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Error fetching recommendations: {str(exc)}")


@router.post("/{recommendation_id}/complete")
def complete_recommendation(
    recommendation_id: int,
    current_user: UserOut = Depends(get_current_user),
):
    """Mark a resource recommendation as completed (done reading/watching)."""
    success = mark_recommendation_complete(current_user.id, recommendation_id)
    if not success:
        raise HTTPException(status_code=404, detail="Recommendation not found or not yours")
    return {"recommendation_id": recommendation_id, "is_completed": True}
