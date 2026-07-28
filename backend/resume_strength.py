"""
Resume-strength checker.

Deliberately rule-based and deterministic, NOT an LLM call -- this means
it's free, instant, and every flag is explainable ("this line has no
numbers"), which matters more for a portfolio project than marginal
sophistication. It never rewrites anything itself; it only flags issues
and asks the person for real specifics, so nothing here can invent
experience the way a careless AI rewrite could.
"""
import re

# Vague, unquantified verbs/phrases that read as filler rather than impact.
# Not exhaustive -- calibrated to catch the most common weak patterns
# without over-flagging normal, reasonable language.
WEAK_PHRASES = [
    "responsible for", "involved in", "helped with", "worked on",
    "duties included", "tasked with", "assisted with", "participated in",
    "in charge of", "handled various",
]

# A bullet that already contains a number is doing better on
# "quantified impact" than one that doesn't -- simple, explainable check.
NUMBER_RE = re.compile(r"\d")

# Generic/passive openers vs. strong action verbs. This list is
# intentionally short -- broad enough to catch common patterns, not an
# exhaustive grammar engine.
WEAK_OPENERS = {
    "was", "were", "did", "helped", "worked", "responsible",
    "involved", "assisted", "participated",
}


def split_into_bullets(resume_text: str) -> list[str]:
    """
    Rough bullet/line splitter. Resumes vary a lot in formatting, so this
    is intentionally simple: split on newlines, drop very short lines
    (likely headers/dates, not real content).
    """
    lines = [l.strip(" \u2022-\t") for l in resume_text.split("\n")]
    return [l for l in lines if len(l.split()) >= 4]


def check_bullet(bullet: str) -> dict:
    """
    Returns the specific, explainable issues found in one bullet -- not a
    single opaque score. Each issue names exactly what's missing so the
    person knows what real detail to add.
    """
    issues = []
    lower = bullet.lower()

    if not NUMBER_RE.search(bullet):
        issues.append(
            "No numbers -- consider adding a concrete figure (how many, "
            "how much, how often, or % improvement) if you have one."
        )

    for phrase in WEAK_PHRASES:
        if phrase in lower:
            issues.append(
                f'Contains the vague phrase "{phrase}" -- consider naming '
                f"the specific action you took instead."
            )
            break  # one flag per bullet is enough to avoid pile-on noise

    first_word = lower.split()[0].strip(".,;:") if lower.split() else ""
    if first_word in WEAK_OPENERS:
        issues.append(
            f'Starts with a weak/passive word ("{first_word}") -- leading '
            f"with a strong action verb usually reads stronger."
        )

    if len(bullet.split()) < 6:
        issues.append(
            "Quite short -- likely light on detail; consider adding what "
            "the outcome or result was."
        )

    return {
        "text": bullet,
        "issues": issues,
        "strong": len(issues) == 0,
    }


def check_resume_strength(resume_text: str) -> dict:
    """
    Top-level entry point. Returns per-bullet feedback plus a simple
    summary -- no single "score" out of 100, since that would imply more
    precision than a rule-based checker can honestly claim.
    """
    bullets = split_into_bullets(resume_text)
    results = [check_bullet(b) for b in bullets]

    strong_count = sum(1 for r in results if r["strong"])
    flagged_count = len(results) - strong_count

    return {
        "total_bullets_checked": len(results),
        "strong_bullets": strong_count,
        "flagged_bullets": flagged_count,
        "details": results,
    }
