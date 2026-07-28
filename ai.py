"""
The entire "AI" layer of the app: structured prompts, API calls, JSON
back. Everything else (matching %, keyword diff, resume-strength rules)
is deterministic Python elsewhere, not the LLM's job.

Provider strategy: try Gemini first (its free tier covers normal demo
traffic -- see the rate limit in main.py), fall back to OpenAI only if
Gemini's call fails (quota exhausted, network error, bad key, etc.).
Gemini goes first specifically because it's the free option; if the
order were reversed you'd pay OpenAI by default and only fall back to
free when it breaks, which defeats the purpose.
"""
import json
import logging
import os
from analysis import enforce_dash_style

logger = logging.getLogger("resume_analyzer")

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-flash-latest")
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")
OPENAI_MODEL = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")

# Shared across every prompt in this file -- the one rule that must never
# be dropped no matter which feature is calling the model.
NEVER_INVENT_RULE = """NEVER invent skills, tools, employers, titles, dates, \
or achievements that are not already present in the resume text you are \
given. Only rephrase, reorganize, and re-emphasize existing content. Use a \
plain hyphen (-) for all lists and separators -- never an em dash (\u2014) \
or en dash (\u2013) anywhere in your output."""

ANALYZE_SYSTEM_PROMPT = f"""You are a careful resume-tailoring assistant. \
You help candidates present their REAL experience more effectively for a \
specific job description. You must follow these rules strictly:

1. {NEVER_INVENT_RULE}
2. If a skill from the job description is missing from the resume, list it \
under "missing_skills" as a suggestion to add IF the person actually has \
that experience -- do not add it to the resume itself.
3. Respond with ONLY valid JSON, no markdown fences, no commentary, \
matching exactly this shape:
{{
  "tailored_bullets": ["rewritten bullet 1", "rewritten bullet 2", ...],
  "suggestions": ["suggestion 1", "suggestion 2", ...],
  "interview_questions": ["question 1", "question 2", ...]
}}
"""

COVER_LETTER_SYSTEM_PROMPT = f"""You are a careful cover-letter writing \
assistant. You help candidates write a genuine, specific cover letter \
grounded ONLY in their real resume. You must follow these rules strictly:

1. {NEVER_INVENT_RULE}
2. Do not use generic filler phrases like "I am writing to express my \
interest" or "I believe I would be a great fit" -- open with something \
specific tying the candidate's real background to this specific role.
3. Keep it to 3-4 short paragraphs. No greeting/signature block needed --
just the body paragraphs.
4. Respond with ONLY valid JSON, no markdown fences, no commentary, \
matching exactly this shape:
{{
  "paragraphs": ["paragraph 1", "paragraph 2", "paragraph 3", ...]
}}
"""


def _call_gemini(system_prompt: str, user_prompt: str) -> str:
    from google import genai
    from google.genai import types

    if not GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY not set")

    client = genai.Client(api_key=GEMINI_API_KEY)
    response = client.models.generate_content(
        model=GEMINI_MODEL,
        contents=user_prompt,
        config=types.GenerateContentConfig(
            system_instruction=system_prompt,
            temperature=0.4,
            response_mime_type="application/json",
        ),
    )
    return response.text


def _call_openai(system_prompt: str, user_prompt: str) -> str:
    from openai import OpenAI

    if not OPENAI_API_KEY:
        raise RuntimeError("OPENAI_API_KEY not set")

    client = OpenAI(api_key=OPENAI_API_KEY)
    response = client.chat.completions.create(
        model=OPENAI_MODEL,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0.4,
        response_format={"type": "json_object"},
    )
    return response.choices[0].message.content


def _call_llm_with_fallback(system_prompt: str, user_prompt: str) -> dict:
    """
    Shared Gemini-first/OpenAI-fallback logic, reused by every AI feature
    in this file so the provider strategy only lives in one place.
    """
    raw = None
    used_provider = None
    errors = {}

    for provider_name, call_fn in (("gemini", _call_gemini), ("openai", _call_openai)):
        try:
            raw = call_fn(system_prompt, user_prompt)
            used_provider = provider_name
            break
        except Exception as e:
            errors[provider_name] = str(e)
            logger.warning(f"{provider_name} call failed: {e}")
            continue

    if raw is None:
        raise RuntimeError(f"Both AI providers failed. Errors: {errors}")

    data = json.loads(raw)
    data["ai_provider_used"] = used_provider
    return data


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

    data = _call_llm_with_fallback(ANALYZE_SYSTEM_PROMPT, user_prompt)

    data["tailored_bullets"] = [enforce_dash_style(b) for b in data.get("tailored_bullets", [])]
    data["suggestions"] = [enforce_dash_style(s) for s in data.get("suggestions", [])]
    data["interview_questions"] = [enforce_dash_style(q) for q in data.get("interview_questions", [])]

    return data


def generate_cover_letter(resume_text: str, jd_text: str) -> dict:
    user_prompt = f"""RESUME TEXT:
{resume_text}

JOB DESCRIPTION:
{jd_text}

Write a specific, grounded cover letter body (3-4 short paragraphs) for \
this candidate applying to this role, using ONLY real experience from \
the resume above."""

    data = _call_llm_with_fallback(COVER_LETTER_SYSTEM_PROMPT, user_prompt)
    data["paragraphs"] = [enforce_dash_style(p) for p in data.get("paragraphs", [])]
    return data
