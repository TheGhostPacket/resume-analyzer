"""
Resume Analyzer API.

No accounts, no persistence by default (per the earlier decision to skip
auth for v1) -- upload, analyze, edit, download, done. Everything is
processed in memory per-request.
"""
import logging

from fastapi import FastAPI, UploadFile, File, Form, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from pydantic import BaseModel
import io

from file_parsing import parse_resume
from analysis import compute_match
from resume_strength import check_resume_strength
from ats_check import check_ats_formatting
from ai import analyze_with_llm, generate_cover_letter
from export import build_docx, build_pdf

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("resume_analyzer")

limiter = Limiter(key_func=get_remote_address)
app = FastAPI(title="Resume Analyzer API")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Locked down to the actual deployed frontend -- no longer a wildcard.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://myresumeanalyze.netlify.app"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    """
    Used by the keep-alive ping (UptimeRobot / cron-job.org / GitHub
    Actions) to stop Render's free tier from spinning the service down.
    Deliberately tiny and DB-free so the ping itself costs nothing.
    """
    return {"status": "ok"}


@app.get("/health/ai")
def health_ai():
    """
    Confirms which AI provider keys Render can actually see, WITHOUT ever
    exposing the key values -- just true/false. Visit this in a browser
    to sanity-check your environment variables are set correctly before
    assuming the AI code itself is broken.
    """
    import os
    return {
        "gemini_key_present": bool(os.environ.get("GEMINI_API_KEY")),
        "openai_key_present": bool(os.environ.get("OPENAI_API_KEY")),
    }


@app.post("/check-strength")
@limiter.limit("10/2hours")
async def check_strength(request: Request, resume: UploadFile = File(...)):
    """
    Stands entirely on its own -- no job description needed. Flags weak,
    vague, or unquantified bullets so the person can strengthen their
    resume in general, before applying anywhere specific. Purely
    rule-based (see resume_strength.py) -- no AI call, so it's free,
    instant, and every flag is explainable.
    """
    file_bytes = await resume.read()
    try:
        resume_text = parse_resume(resume.filename, file_bytes)
    except ValueError as e:
        raise HTTPException(400, str(e))

    result = check_resume_strength(resume_text)
    return JSONResponse(result)


@app.post("/check-ats")
@limiter.limit("10/2hours")
async def check_ats(request: Request, resume: UploadFile = File(...)):
    """
    Also stands entirely on its own -- inspects the FILE STRUCTURE (not
    content) for layout patterns that commonly break real ATS parsers:
    tables, multi-column layout, embedded images, header/footer-only
    text. See ats_check.py for exactly what's checked and why.
    """
    file_bytes = await resume.read()
    result = check_ats_formatting(resume.filename, file_bytes)
    return JSONResponse(result)


@app.post("/analyze")
@limiter.limit("5/2hours")
async def analyze(
    request: Request,
    resume: UploadFile = File(...),
    job_description: str = Form(...),
):
    if not job_description or len(job_description.strip()) < 20:
        raise HTTPException(400, "Please paste a fuller job description.")

    file_bytes = await resume.read()
    try:
        resume_text = parse_resume(resume.filename, file_bytes)
    except ValueError as e:
        raise HTTPException(400, str(e))

    match_result = compute_match(resume_text, job_description)

    try:
        ai_result = analyze_with_llm(
            resume_text, job_description, match_result["missing_skills"]
        )
    except Exception as e:
        # Logged here so it's visible in Render's Logs tab -- the user
        # only ever sees the clean message below, never the raw error.
        logger.exception(f"AI call failed: {e}")
        ai_result = {
            "tailored_bullets": [],
            "suggestions": ["AI suggestions are temporarily unavailable -- try again shortly."],
            "interview_questions": [],
        }

    return JSONResponse({
        **match_result,
        **ai_result,
        "resume_text": resume_text,  # needed for inline keyword highlighting
    })


@app.post("/cover-letter")
@limiter.limit("5/2hours")
async def cover_letter(
    request: Request,
    resume: UploadFile = File(...),
    job_description: str = Form(...),
):
    if not job_description or len(job_description.strip()) < 20:
        raise HTTPException(400, "Please paste a fuller job description.")

    file_bytes = await resume.read()
    try:
        resume_text = parse_resume(resume.filename, file_bytes)
    except ValueError as e:
        raise HTTPException(400, str(e))

    try:
        result = generate_cover_letter(resume_text, job_description)
    except Exception as e:
        logger.exception(f"Cover letter AI call failed: {e}")
        raise HTTPException(503, "Cover letter generation is temporarily unavailable -- try again shortly.")

    return JSONResponse(result)


class ExportRequest(BaseModel):
    title: str = "Tailored Resume Section"
    bullets: list[str]
    format: str  # "docx" or "pdf"
    style: str = "bullets"  # "bullets" or "letter"


@app.post("/export")
@limiter.limit("20/2hours")
async def export(request: Request, body: ExportRequest):
    if not body.bullets:
        raise HTTPException(400, "Nothing to export -- add at least one item.")

    if body.format == "docx":
        content = build_docx(body.title, body.bullets, body.style)
        media_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        filename = "cover_letter.docx" if body.style == "letter" else "tailored_resume.docx"
    elif body.format == "pdf":
        content = build_pdf(body.title, body.bullets, body.style)
        media_type = "application/pdf"
        filename = "cover_letter.pdf" if body.style == "letter" else "tailored_resume.pdf"
    else:
        raise HTTPException(400, "format must be 'docx' or 'pdf'")

    return StreamingResponse(
        io.BytesIO(content),
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
