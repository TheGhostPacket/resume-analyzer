"""
The entire "AI" layer of the app: one structured prompt, one API call,
JSON back. Everything else (matching %, keyword diff) is deterministic
Python in analysis.py, not the LLM's job.

Provider strategy: try Gemini first (its free tier covers normal demo
traffic -- see the rate limit in main.py), fall back to OpenAI only if
Gemini's call fails (quota exhausted, network error, bad key, etc.).
Gemini goes first specifically because it's the free option; if the
order were reversed you'd pay OpenAI by default and only fall back to
free when it breaks, which defeats the purpose.
"""
import json
import os
from analysis import enforce_dash_style

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")
OPENAI_MODEL = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")

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
dash (\u2014) or en dash (\u2013) anywhere in your output.
4. Respond with ONLY valid JSON, no markdown fences, no commentary, \
matching exactly this shape:
{
  "tailored_bullets": ["rewritten bullet 1", "rewritten bullet 2", ...],
  "suggestions": ["suggestion 1", "suggestion 2", ...],
  "interview_questions": ["question 1", "question 2", ...]
}
"""


def _build_user_prompt(resume_text: str, jd_text: str, missing_skills: list[str]) -> str:
    return f"""RESUME TEXT:
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


def _call_gemini(user_prompt: str) -> str:
    from google import genai
    from google.genai import types

    if not GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY not set")

    client = genai.Client(api_key=GEMINI_API_KEY)
    response = client.models.generate_content(
        model=GEMINI_MODEL,
        contents=user_prompt,
        config=types.GenerateContentConfig(
            system_instruction=SYSTEM_PROMPT,
            temperature=0.4,
            response_mime_type="application/json",
        ),
    )
    return response.text


def _call_openai(user_prompt: str) -> str:
    from openai import OpenAI

    if not OPENAI_API_KEY:
        raise RuntimeError("OPENAI_API_KEY not set")

    client = OpenAI(api_key=OPENAI_API_KEY)
    response = client.chat.completions.create(
        model=OPENAI_MODEL,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0.4,
        response_format={"type": "json_object"},
    )
    return response.choices[0].message.content


def analyze_with_llm(resume_text: str, jd_text: str, missing_skills: list[str]) -> dict:
    import logging
    logger = logging.getLogger("resume_analyzer")

    user_prompt = _build_user_prompt(resume_text, jd_text, missing_skills)

    raw = None
    used_provider = None
    errors = {}

    # Gemini first (free tier), OpenAI as the fallback if Gemini fails.
    for provider_name, call_fn in (("gemini", _call_gemini), ("openai", _call_openai)):
        try:
            raw = call_fn(user_prompt)
            used_provider = provider_name
            break
        except Exception as e:
            errors[provider_name] = str(e)
            logger.warning(f"{provider_name} call failed: {e}")
            continue

    if raw is None:
        # Both providers failed -- log each one's specific error (not just
        # the last), then raise a combined error for main.py's fallback.
        raise RuntimeError(f"Both AI providers failed. Errors: {errors}")

    data = json.loads(raw)
    data["ai_provider_used"] = used_provider  # handy for debugging in the UI/logs

    # Deterministic enforcement layer -- do not rely on the prompt alone.
    data["tailored_bullets"] = [enforce_dash_style(b) for b in data.get("tailored_bullets", [])]
    data["suggestions"] = [enforce_dash_style(s) for s in data.get("suggestions", [])]
    data["interview_questions"] = [enforce_dash_style(q) for q in data.get("interview_questions", [])]

    return data
