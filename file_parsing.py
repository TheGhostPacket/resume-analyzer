"""
Resume file parsing: PDF and DOCX -> raw text.
Kept isolated from main.py since this is the part most likely to break
on real-world messy resumes (as flagged earlier: test this on actual
varied resumes, not just clean sample ones).
"""
import io
import pdfplumber
from docx import Document


def parse_pdf(file_bytes: bytes) -> str:
    text_parts = []
    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text()
            if page_text:
                text_parts.append(page_text)
    return "\n".join(text_parts)


def parse_docx(file_bytes: bytes) -> str:
    doc = Document(io.BytesIO(file_bytes))
    return "\n".join(p.text for p in doc.paragraphs if p.text.strip())


def parse_resume(filename: str, file_bytes: bytes) -> str:
    lower = filename.lower()
    if lower.endswith(".pdf"):
        text = parse_pdf(file_bytes)
    elif lower.endswith(".docx"):
        text = parse_docx(file_bytes)
    else:
        raise ValueError("Unsupported file type. Please upload a PDF or DOCX.")

    if not text.strip():
        raise ValueError(
            "Couldn't extract any text from this file. It may be a scanned "
            "image rather than real text -- try a text-based PDF or DOCX."
        )
    return text
