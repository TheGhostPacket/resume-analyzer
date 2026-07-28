"""
The entire "AI" layer of the app: one structured prompt, one API call,
JSON back. Everything else (matching %, keyword diff) is deterministic
Python in analysis.py, not the LLM's job.
"""
import json
import os
from openai import OpenAI
from analysis import enforce_dash_style

client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))
MODEL = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")

SYSTEM_PROMPT = """You are a careful resume-tailoring assistant. You help \
candidates present their REAL experience more effectively for a specific \
job description. You must follow these rules strictly:

1. NEVER invent skills, tools, employers, titles, or achievements that are \
not already present in the resume text you are given. Only rephrase, \
reorganize, and re-emphasize existing content.
2. If a skill from the job description is missing from the resume, list it \
under "missing_skills" as a suggestion to add IF the person actually has \
that experience -- do not add it to the resume itself.
3. Use a plain hyphen (-) for all lists and separators. Never use an em \
dash (—) or en dash (–) anywhere in your output.
4. Respond with ONLY valid JSON, no markdown fences, no commentary, \
matching exactly this shape:
{
  "tailored_bullets": ["rewritten bullet 1", "rewritten bullet 2", ...],
  "suggestions": ["suggestion 1", "suggestion 2", ...],
  "interview_questions": ["question 1", "question 2", ...]
}
"""


def analyze_with_llm(resume_text: str, jd_text: str, missing_skills: list[str]) -> dict:
    user_prompt = f"""RESUME TEXT:
{resume_text}

JOB DESCRIPTION:
{jd_text}

KEYWORDS PRESENT IN THE JOB DESCRIPTION BUT NOT DETECTED IN THE RESUME:
{", ".join(missing_skills) if missing_skills else "(none detected)"}

Rewrite the 4-6 weakest/most generic bullet points from the resume so they \
better reflect impact and align with the job description's language -- \
using ONLY experience already present in the resume. Then give 3-5 short \
suggestions (e.g. skills to add if the candidate genuinely has them, gaps \
to address). Then generate 5 interview questions likely for this role, \
weighted toward the missing skills above."""

    response = client.chat.completions.create(
        model=MODEL,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0.4,
        response_format={"type": "json_object"},
    )

    raw = response.choices[0].message.content
    data = json.loads(raw)

    # Deterministic enforcement layer -- do not rely on the prompt alone.
    data["tailored_bullets"] = [enforce_dash_style(b) for b in data.get("tailored_bullets", [])]
    data["suggestions"] = [enforce_dash_style(s) for s in data.get("suggestions", [])]
    data["interview_questions"] = [enforce_dash_style(q) for q in data.get("interview_questions", [])]

    return data
