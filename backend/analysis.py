"""
Core resume <-> job-description analysis logic.

Kept deliberately separate from main.py so the matching logic can be
unit-tested and reasoned about on its own (this is the part an interviewer
will actually poke at, per the earlier discussion).
"""
import re
from collections import Counter

# A small, extensible stopword list so raw keyword overlap isn't polluted
# by common English words. Not exhaustive on purpose -- good enough for
# a portfolio-grade signal, not a production NLP pipeline.
STOPWORDS = {
    "the", "a", "an", "and", "or", "of", "in", "on", "for", "to", "with",
    "is", "are", "as", "at", "by", "be", "this", "that", "will", "your",
    "you", "we", "our", "their", "it", "its", "from", "as", "using", "use",
    "experience", "skills", "job", "role", "work", "working", "years",
    "year", "team", "ability", "including", "etc", "such", "who", "have",
    "has", "into", "about", "these", "those", "can", "must", "should",
    "looking", "seeking", "candidate", "candidates", "responsibilities",
    "requirements", "required", "preferred", "strong", "excellent",
}

WORD_RE = re.compile(r"[a-zA-Z][a-zA-Z0-9+/#.\-]{1,}")


def tokenize(text: str) -> list[str]:
    """Lowercase word tokens, stripped of stopwords and short noise."""
    raw_words = WORD_RE.findall(text.lower())
    # Strip trailing punctuation BEFORE the stopword check, or something
    # like "experience." slips past the "experience" stopword entry.
    stripped = [w.strip(".-") for w in raw_words]
    return [w for w in stripped if w not in STOPWORDS and len(w) > 1]


def extract_keywords(text: str, top_n: int = 40) -> list[str]:
    """
    Frequency-based keyword extraction. This is the naive-but-honest
    version discussed earlier: it does NOT use embeddings. It's good
    enough to compute overlap and defensible to explain in an interview
    ("here's exactly how the score is computed"), which matters more
    for a portfolio project than marginal accuracy gains.
    """
    tokens = tokenize(text)
    counts = Counter(tokens)
    return [w for w, _ in counts.most_common(top_n)]


def compute_match(resume_text: str, jd_text: str) -> dict:
    """
    Returns match percentage + matched/missing keyword lists.

    Score = (keywords in both resume and JD) / (total distinct JD keywords)
    This is a simple, explainable overlap ratio -- not a black box.
    """
    resume_keywords = set(extract_keywords(resume_text, top_n=100))
    jd_keywords = extract_keywords(jd_text, top_n=60)

    if not jd_keywords:
        return {"match_percentage": 0, "matched_skills": [], "missing_skills": []}

    jd_keyword_set = set(jd_keywords)
    matched = sorted(jd_keyword_set & resume_keywords)
    missing = [k for k in jd_keywords if k not in resume_keywords]

    match_pct = round(100 * len(matched) / len(jd_keyword_set))

    return {
        "match_percentage": match_pct,
        "matched_skills": matched,
        "missing_skills": missing[:15],  # cap for readability
    }


def enforce_dash_style(text: str) -> str:
    """
    Deterministic cleanup pass: replace em-dash and en-dash with a plain
    hyphen. This runs AFTER the LLM response, on top of prompt
    instructions -- prompting alone is not reliable enough for a rule
    like this, so it's enforced here in code as the source of truth.
    """
    return text.replace("\u2014", "-").replace("\u2013", "-")
