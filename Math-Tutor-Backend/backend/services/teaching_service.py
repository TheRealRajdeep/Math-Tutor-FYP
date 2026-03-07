"""
Teaching Service — Pillar 5

Handles two GPT calls:
  1. generate_lesson_plan()  — GPT-4o builds a 5-6 step structured lesson as JSON.
  2. evaluate_student_response() — GPT-4o-mini scores a student's answer to a
     practice or checkpoint step and returns feedback + a hint if wrong.

Lesson step types
-----------------
  intro      : Concept explanation.  Student just reads and continues.
  example    : Worked example.       Student just reads and continues.
  practice   : Short practice question requiring a typed answer.
  checkpoint : Harder problem at the end — the mini-test.
  summary    : Key takeaways.        Student just reads and finishes.
"""
import json
import logging
import os
from typing import Optional

from openai import OpenAI

logger = logging.getLogger(__name__)

LESSON_MODEL = os.getenv("LESSON_MODEL", "gpt-4o")
EVAL_MODEL   = os.getenv("EVAL_MODEL",   "gpt-4o-mini")
MAX_RETRIES  = 2          # failed attempts before auto-advancing a practice step


# ─── Lesson plan generation ───────────────────────────────────────────────────

LESSON_PLAN_PROMPT = """\
You are an expert math olympiad tutor creating a structured lesson for a student.

Topic  : {topic}
Domain : {domain}
Level  : Olympiad preparation (RMO / USAMO level)

Create a 5–6 step lesson plan. Rules:
- Step 1 MUST be type "intro"  — clear concept introduction with intuition.
- Include exactly 1–2 "example" steps with fully worked solutions.
- Include exactly 1–2 "practice" steps where the student must write an answer.
- Step N-1 (second to last) MUST be type "checkpoint" — a harder problem.
- Last step MUST be type "summary" — key takeaways and what to study next.
- Use LaTeX math notation: inline $...$ and display $$...$$.
- Keep "content" rich (300–600 words per step), "question" concise, "expected_answer" brief.

Return ONLY valid JSON matching exactly this schema (no extra keys, no markdown fences):
{{
  "topic": string,
  "steps": [
    {{
      "type": "intro" | "example" | "practice" | "checkpoint" | "summary",
      "title": string,
      "content": string,
      "question": string | null,
      "expected_answer": string | null
    }}
  ]
}}"""

EVAL_PROMPT = """\
You are evaluating a student's answer to a math olympiad practice question.

Question         : {question}
Expected Answer  : {expected_answer}
Student's Answer : {student_response}

Decide if the student's answer is essentially correct (mathematical equivalence counts).
Return ONLY valid JSON (no markdown fences):
{{
  "is_correct": boolean,
  "feedback": "1–2 sentences of specific, encouraging feedback",
  "hint": "A helpful hint that does NOT give away the answer (null if correct)"
}}"""

REEXPLAIN_PROMPT = """\
A student attempted the following math olympiad practice question {attempt} time(s) and got it wrong.

Question        : {question}
Student's Answer: {student_response}
Expected Answer : {expected_answer}
Previous step content:
{content}

Write a fresh, alternative explanation of the key concept that would help them answer correctly.
Use a different approach or analogy than the original explanation.
Include a short worked example if helpful.
Use LaTeX math ($...$).  Keep it under 250 words.  Do NOT give the direct answer."""


def _client() -> OpenAI:
    return OpenAI(api_key=os.getenv("OPENAI_API_KEY"))


def generate_lesson_plan(topic: str, domain: str) -> list[dict]:
    """
    Call GPT-4o to produce a structured lesson plan.
    Returns the list of step dicts on success, raises RuntimeError on failure.
    """
    prompt = LESSON_PLAN_PROMPT.format(topic=topic, domain=domain)
    try:
        resp = _client().chat.completions.create(
            model=LESSON_MODEL,
            messages=[
                {"role": "system", "content": "You are a structured math olympiad tutor. Respond with valid JSON only."},
                {"role": "user",   "content": prompt},
            ],
            response_format={"type": "json_object"},
            max_tokens=4000,
            temperature=0.6,
        )
        raw = json.loads(resp.choices[0].message.content)
        steps = raw.get("steps", [])
        if not steps:
            raise ValueError("GPT returned empty steps list")
        # Normalise — ensure required keys exist on every step
        normalised = []
        for i, s in enumerate(steps):
            normalised.append({
                "step_index":      i,
                "type":            s.get("type", "intro"),
                "title":           s.get("title", f"Step {i + 1}"),
                "content":         s.get("content", ""),
                "question":        s.get("question"),
                "expected_answer": s.get("expected_answer"),
                "status":          "pending",
            })
        logger.info("Generated lesson plan for '%s' (%d steps)", topic, len(normalised))
        return normalised
    except Exception as exc:
        logger.exception("generate_lesson_plan failed for topic '%s'", topic)
        raise RuntimeError(f"Lesson plan generation failed: {exc}") from exc


def evaluate_student_response(
    step: dict,
    student_response: str,
) -> dict:
    """
    Call GPT-4o-mini to evaluate a student's typed answer.
    Returns {"is_correct": bool, "feedback": str, "hint": str | None}.
    """
    if not student_response or not student_response.strip():
        return {
            "is_correct": False,
            "feedback":   "Please write your answer before submitting.",
            "hint":       "Try to work through the problem step by step.",
        }
    prompt = EVAL_PROMPT.format(
        question=step.get("question", ""),
        expected_answer=step.get("expected_answer", ""),
        student_response=student_response,
    )
    try:
        resp = _client().chat.completions.create(
            model=EVAL_MODEL,
            messages=[
                {"role": "system", "content": "You are a precise math evaluator. Respond with valid JSON only."},
                {"role": "user",   "content": prompt},
            ],
            response_format={"type": "json_object"},
            max_tokens=300,
            temperature=0.3,
        )
        result = json.loads(resp.choices[0].message.content)
        return {
            "is_correct": bool(result.get("is_correct", False)),
            "feedback":   result.get("feedback", ""),
            "hint":       result.get("hint"),
        }
    except Exception as exc:
        logger.warning("evaluate_student_response failed: %s", exc)
        return {
            "is_correct": False,
            "feedback":   "Could not evaluate your answer automatically. Check the expected answer below.",
            "hint":       None,
        }


def generate_reexplanation(step: dict, student_response: str, attempt: int) -> str:
    """
    When a student fails a practice step, generate an alternative explanation.
    Returns a plain-text / LaTeX string.
    """
    prompt = REEXPLAIN_PROMPT.format(
        attempt=attempt,
        question=step.get("question", ""),
        student_response=student_response,
        expected_answer=step.get("expected_answer", ""),
        content=step.get("content", "")[:800],
    )
    try:
        resp = _client().chat.completions.create(
            model=LESSON_MODEL,
            messages=[
                {"role": "system", "content": "You are a patient math tutor. Help the student understand without giving the answer directly."},
                {"role": "user",   "content": prompt},
            ],
            max_tokens=500,
            temperature=0.6,
        )
        return resp.choices[0].message.content.strip()
    except Exception as exc:
        logger.warning("generate_reexplanation failed: %s", exc)
        return "Let's look at this differently. Review the concept in the step above and try again."


def is_interactive(step: dict) -> bool:
    """True for steps where the student must type an answer."""
    return step.get("type") in ("practice", "checkpoint")
