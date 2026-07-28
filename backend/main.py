"""
Resume Analyzer API.

No accounts, no persistence by default (per the earlier decision to skip
auth for v1) -- upload, analyze, edit, download, done. Everything is
processed in memory per-request.
"""
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
from ai import analyze_with_llm
from export import build_docx, build_pdf

limiter = Limiter(key_func=get_remote_address)
app = FastAPI(title="Resume Analyzer API")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Lock this down to your real Netlify domain before going live.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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
    except Exception:
        # Keep the deterministic match results useful even if the LLM
        # call fails (rate limit, bad API key, network blip, etc.)
        ai_result = {
            "tailored_bullets": [],
            "suggestions": ["AI suggestions are temporarily unavailable -- try again shortly."],
            "interview_questions": [],
        }

    return JSONResponse({
        **match_result,
        **ai_result,
    })


class ExportRequest(BaseModel):
    title: str = "Tailored Resume Section"
    bullets: list[str]
    format: str  # "docx" or "pdf"


@app.post("/export")
@limiter.limit("20/2hours")
async def export(request: Request, body: ExportRequest):
    if not body.bullets:
        raise HTTPException(400, "Nothing to export -- add at least one bullet.")

    if body.format == "docx":
        content = build_docx(body.title, body.bullets)
        media_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        filename = "tailored_resume.docx"
    elif body.format == "pdf":
        content = build_pdf(body.title, body.bullets)
        media_type = "application/pdf"
        filename = "tailored_resume.pdf"
    else:
        raise HTTPException(400, "format must be 'docx' or 'pdf'")

    return StreamingResponse(
        io.BytesIO(content),
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
