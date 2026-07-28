"""
Renders the structured CV dict (from ai.generate_full_cv) into a clean,
properly formatted document -- a real CV layout, not just a flat bullet
list. Kept separate from export.py since the input shape and template
are meaningfully different (structured sections vs. a flat bullet list).
"""
import io
from docx import Document
from docx.shared import Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from reportlab.lib.pagesizes import letter as LETTER_SIZE
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, HRFlowable
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from analysis import enforce_dash_style


def _clean(text: str) -> str:
    return enforce_dash_style(text or "")


def build_cv_docx(cv: dict) -> bytes:
    doc = Document()

    if cv.get("full_name"):
        name_p = doc.add_paragraph()
        name_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        run = name_p.add_run(_clean(cv["full_name"]))
        run.font.size = Pt(20)
        run.font.bold = True

    if cv.get("contact_line"):
        contact_p = doc.add_paragraph()
        contact_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        run = contact_p.add_run(_clean(cv["contact_line"]))
        run.font.size = Pt(10)
        run.font.color.rgb = RGBColor(0x55, 0x55, 0x55)

    if cv.get("summary"):
        doc.add_heading("Summary", level=2)
        doc.add_paragraph(_clean(cv["summary"]))

    if cv.get("experience"):
        doc.add_heading("Experience", level=2)
        for entry in cv["experience"]:
            header_p = doc.add_paragraph()
            title_run = header_p.add_run(_clean(entry.get("title", "")))
            title_run.bold = True
            org = entry.get("organization", "")
            dates = entry.get("dates", "")
            if org or dates:
                header_p.add_run(f"  {_clean(org)}" + (f"  |  {_clean(dates)}" if dates else ""))
            for bullet in entry.get("bullets", []):
                p = doc.add_paragraph(style="List Bullet")
                p.add_run(_clean(bullet)).font.size = Pt(11)

    if cv.get("education"):
        doc.add_heading("Education", level=2)
        for entry in cv["education"]:
            p = doc.add_paragraph()
            run = p.add_run(_clean(entry.get("degree", "")))
            run.bold = True
            inst = entry.get("institution", "")
            dates = entry.get("dates", "")
            if inst or dates:
                p.add_run(f"  {_clean(inst)}" + (f"  |  {_clean(dates)}" if dates else ""))

    if cv.get("skills"):
        doc.add_heading("Skills", level=2)
        doc.add_paragraph(", ".join(_clean(s) for s in cv["skills"]))

    buf = io.BytesIO()
    doc.save(buf)
    buf.seek(0)
    return buf.read()


def build_cv_pdf(cv: dict) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=LETTER_SIZE,
                             leftMargin=0.75 * inch, rightMargin=0.75 * inch,
                             topMargin=0.75 * inch, bottomMargin=0.75 * inch)
    base = getSampleStyleSheet()
    name_style = ParagraphStyle("Name", parent=base["Heading1"], alignment=1, fontSize=18)
    contact_style = ParagraphStyle("Contact", parent=base["Normal"], alignment=1,
                                    fontSize=9, textColor=colors.grey)
    section_style = ParagraphStyle("Section", parent=base["Heading2"], fontSize=13,
                                     spaceBefore=14, spaceAfter=4)
    entry_header_style = ParagraphStyle("EntryHeader", parent=base["Normal"], fontSize=11,
                                          spaceBefore=6)
    bullet_style = ParagraphStyle("Bullet", parent=base["Normal"], fontSize=10.5,
                                    leftIndent=14, spaceAfter=3)

    story = []

    if cv.get("full_name"):
        story.append(Paragraph(_clean(cv["full_name"]), name_style))
    if cv.get("contact_line"):
        story.append(Paragraph(_clean(cv["contact_line"]), contact_style))
    story.append(Spacer(1, 8))
    story.append(HRFlowable(width="100%", color=colors.lightgrey))

    if cv.get("summary"):
        story.append(Paragraph("Summary", section_style))
        story.append(Paragraph(_clean(cv["summary"]), base["Normal"]))

    if cv.get("experience"):
        story.append(Paragraph("Experience", section_style))
        for entry in cv["experience"]:
            org = _clean(entry.get("organization", ""))
            dates = _clean(entry.get("dates", ""))
            header = f"<b>{_clean(entry.get('title', ''))}</b>"
            if org or dates:
                header += f"  {org}" + (f"  |  {dates}" if dates else "")
            story.append(Paragraph(header, entry_header_style))
            for bullet in entry.get("bullets", []):
                story.append(Paragraph(f"- {_clean(bullet)}", bullet_style))

    if cv.get("education"):
        story.append(Paragraph("Education", section_style))
        for entry in cv["education"]:
            inst = _clean(entry.get("institution", ""))
            dates = _clean(entry.get("dates", ""))
            header = f"<b>{_clean(entry.get('degree', ''))}</b>"
            if inst or dates:
                header += f"  {inst}" + (f"  |  {dates}" if dates else "")
            story.append(Paragraph(header, entry_header_style))

    if cv.get("skills"):
        story.append(Paragraph("Skills", section_style))
        story.append(Paragraph(", ".join(_clean(s) for s in cv["skills"]), base["Normal"]))

    doc.build(story)
    buf.seek(0)
    return buf.read()
