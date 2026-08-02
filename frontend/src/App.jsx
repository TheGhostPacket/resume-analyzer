import { useState } from "react";

// Point this at your deployed Render backend URL once live.
const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";

function KeywordPill({ label, tone }) {
  const tones = {
    matched: "bg-signal/10 text-signal border-signal/30",
    missing: "bg-flag/10 text-flag border-flag/30",
  };
  return (
    <span
      className={`inline-block text-sm px-3 py-1 rounded-full border mr-2 mb-2 ${tones[tone]}`}
    >
      {label}
    </span>
  );
}

// Renders `text` with any of `keywords` highlighted inline, wherever they
// actually appear in context -- rather than only as separate pill tags.
function HighlightedText({ text, keywords, tone }) {
  if (!text) return null;
  if (!keywords || keywords.length === 0) return <span>{text}</span>;

  const toneClass = tone === "matched" ? "bg-signal/20 text-signal font-medium" : "bg-flag/20 text-flag font-medium";

  // Build one regex matching any keyword as a whole word, case-insensitive.
  const escaped = keywords
    .filter((k) => k && k.trim().length > 0)
    .map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (escaped.length === 0) return <span>{text}</span>;

  const pattern = new RegExp(`\\b(${escaped.join("|")})\\b`, "gi");
  const parts = text.split(pattern);

  return (
    <>
      {parts.map((part, i) =>
        escaped.some((k) => k.toLowerCase() === part.toLowerCase()) ? (
          <mark key={i} className={`rounded px-0.5 ${toneClass}`}>
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

export default function App() {
  const [resumeFile, setResumeFile] = useState(null);
  const [jobDescription, setJobDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [bullets, setBullets] = useState([]); // editable copy of tailored_bullets
  const [downloading, setDownloading] = useState(false);

  // Standalone resume-strength check (no job description needed)
  const [strengthLoading, setStrengthLoading] = useState(false);
  const [strengthError, setStrengthError] = useState("");
  const [strengthResult, setStrengthResult] = useState(null);

  // Standalone ATS formatting check (no job description needed)
  const [atsLoading, setAtsLoading] = useState(false);
  const [atsError, setAtsError] = useState("");
  const [atsResult, setAtsResult] = useState(null);

  // Cover letter (needs both resume + job description)
  const [letterLoading, setLetterLoading] = useState(false);
  const [letterError, setLetterError] = useState("");
  const [letterParagraphs, setLetterParagraphs] = useState(null);
  const [letterDownloading, setLetterDownloading] = useState(false);

  // Full CV rewrite (needs both resume + job description)
  const [cvLoading, setCvLoading] = useState(false);
  const [cvError, setCvError] = useState("");
  const [cvData, setCvData] = useState(null);
  const [cvDownloading, setCvDownloading] = useState(false);

  // Whether to show highlighted resume/JD text inline
  const [showHighlights, setShowHighlights] = useState(false);

  async function handleCheckStrength() {
    setStrengthError("");
    if (!resumeFile) {
      setStrengthError("Upload a resume above first.");
      return;
    }
    setStrengthLoading(true);
    setStrengthResult(null);
    try {
      const formData = new FormData();
      formData.append("resume", resumeFile);
      const res = await fetch(`${API_BASE}/check-strength`, {
        method: "POST",
        body: formData,
      });
      if (res.status === 429) {
        setStrengthError("You've hit the limit for now -- please try again later.");
        return;
      }
      if (!res.ok) throw new Error("Couldn't check resume strength. Please try again.");
      setStrengthResult(await res.json());
    } catch (err) {
      setStrengthError(err.message);
    } finally {
      setStrengthLoading(false);
    }
  }

  async function handleCheckAts() {
    setAtsError("");
    if (!resumeFile) {
      setAtsError("Upload a resume above first.");
      return;
    }
    setAtsLoading(true);
    setAtsResult(null);
    try {
      const formData = new FormData();
      formData.append("resume", resumeFile);
      const res = await fetch(`${API_BASE}/check-ats`, {
        method: "POST",
        body: formData,
      });
      if (res.status === 429) {
        setAtsError("You've hit the limit for now -- please try again later.");
        return;
      }
      if (!res.ok) throw new Error("Couldn't check ATS formatting. Please try again.");
      setAtsResult(await res.json());
    } catch (err) {
      setAtsError(err.message);
    } finally {
      setAtsLoading(false);
    }
  }

  async function handleAnalyze(e) {
    e.preventDefault();
    setError("");

    if (!resumeFile) {
      setError("Please upload a resume (PDF or DOCX).");
      return;
    }
    if (jobDescription.trim().length < 20) {
      setError("Please paste a fuller job description.");
      return;
    }

    setLoading(true);
    setResult(null);
    setLetterParagraphs(null);

    try {
      const formData = new FormData();
      formData.append("resume", resumeFile);
      formData.append("job_description", jobDescription);

      const res = await fetch(`${API_BASE}/analyze`, {
        method: "POST",
        body: formData,
      });

      if (res.status === 429) {
        setError("You've hit the analysis limit for now -- please try again later.");
        setLoading(false);
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || "Something went wrong analyzing your resume.");
      }

      const data = await res.json();
      setResult(data);
      setBullets(data.tailored_bullets || []);
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function updateBullet(index, value) {
    setBullets((prev) => prev.map((b, i) => (i === index ? value : b)));
  }

  function removeBullet(index) {
    setBullets((prev) => prev.filter((_, i) => i !== index));
  }

  function addBullet() {
    setBullets((prev) => [...prev, ""]);
  }

  async function downloadFile(endpointBody, fallbackName) {
    const res = await fetch(`${API_BASE}/export`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(endpointBody),
    });
    if (!res.ok) throw new Error("Couldn't generate the file. Please try again.");

    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fallbackName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  }

  async function handleDownload(format) {
    setDownloading(true);
    setError("");
    try {
      await downloadFile(
        {
          title: "Tailored Resume Bullets",
          bullets: bullets.filter((b) => b.trim().length > 0),
          format,
          style: "bullets",
        },
        format === "docx" ? "tailored_resume.docx" : "tailored_resume.pdf"
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setDownloading(false);
    }
  }

  async function handleGenerateCoverLetter() {
    setLetterError("");
    if (!resumeFile || jobDescription.trim().length < 20) {
      setLetterError("Analyze a resume + job description above first.");
      return;
    }
    setLetterLoading(true);
    setLetterParagraphs(null);
    try {
      const formData = new FormData();
      formData.append("resume", resumeFile);
      formData.append("job_description", jobDescription);
      const res = await fetch(`${API_BASE}/cover-letter`, {
        method: "POST",
        body: formData,
      });
      if (res.status === 429) {
        setLetterError("You've hit the limit for now -- please try again later.");
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || "Couldn't generate a cover letter. Please try again.");
      }
      const data = await res.json();
      setLetterParagraphs(data.paragraphs || []);
    } catch (err) {
      setLetterError(err.message);
    } finally {
      setLetterLoading(false);
    }
  }

  async function handleRewriteFullCv() {
    setCvError("");
    if (!resumeFile || jobDescription.trim().length < 20) {
      setCvError("Analyze a resume + job description above first.");
      return;
    }
    setCvLoading(true);
    setCvData(null);
    try {
      const formData = new FormData();
      formData.append("resume", resumeFile);
      formData.append("job_description", jobDescription);
      const res = await fetch(`${API_BASE}/tailor-cv`, {
        method: "POST",
        body: formData,
      });
      if (res.status === 429) {
        setCvError("You've hit the limit for now -- please try again later.");
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || "Couldn't rewrite the CV. Please try again.");
      }
      setCvData(await res.json());
    } catch (err) {
      setCvError(err.message);
    } finally {
      setCvLoading(false);
    }
  }

  function updateCvField(field, value) {
    setCvData((prev) => ({ ...prev, [field]: value }));
  }

  function updateCvExperience(index, field, value) {
    setCvData((prev) => ({
      ...prev,
      experience: prev.experience.map((e, i) => (i === index ? { ...e, [field]: value } : e)),
    }));
  }

  function updateCvExperienceBullet(expIndex, bulletIndex, value) {
    setCvData((prev) => ({
      ...prev,
      experience: prev.experience.map((e, i) =>
        i === expIndex
          ? { ...e, bullets: e.bullets.map((b, j) => (j === bulletIndex ? value : b)) }
          : e
      ),
    }));
  }

  function updateCvEducation(index, field, value) {
    setCvData((prev) => ({
      ...prev,
      education: prev.education.map((e, i) => (i === index ? { ...e, [field]: value } : e)),
    }));
  }

  function updateCvSkills(value) {
    setCvData((prev) => ({ ...prev, skills: value.split(",").map((s) => s.trim()) }));
  }

  async function handleDownloadCv(format) {
    setCvDownloading(true);
    setCvError("");
    try {
      const res = await fetch(`${API_BASE}/export-cv`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cv: cvData, format }),
      });
      if (!res.ok) throw new Error("Couldn't generate the file. Please try again.");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = format === "docx" ? "tailored_cv.docx" : "tailored_cv.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setCvError(err.message);
    } finally {
      setCvDownloading(false);
    }
  }

  function updateParagraph(index, value) {
    setLetterParagraphs((prev) => prev.map((p, i) => (i === index ? value : p)));
  }

  async function handleDownloadLetter(format) {
    setLetterDownloading(true);
    setLetterError("");
    try {
      await downloadFile(
        {
          title: "Cover Letter",
          bullets: letterParagraphs.filter((p) => p.trim().length > 0),
          format,
          style: "letter",
        },
        format === "docx" ? "cover_letter.docx" : "cover_letter.pdf"
      );
    } catch (err) {
      setLetterError(err.message);
    } finally {
      setLetterDownloading(false);
    }
  }

  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="border-b border-ink/10 px-6 py-5">
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          Resume <span className="text-signal">Analyzer</span>
        </h1>
        <p className="text-sm text-ink/60 mt-1">
          Upload your resume, paste a job description, see exactly where you stand.
        </p>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10">
        <form onSubmit={handleAnalyze} className="space-y-5 bg-white/60 rounded-xl border border-ink/10 p-6">
          <div>
            <label className="block text-sm font-medium mb-2">Resume (PDF or DOCX)</label>
            <input
              type="file"
              accept=".pdf,.docx"
              onChange={(e) => setResumeFile(e.target.files?.[0] || null)}
              className="block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-signal file:text-white file:cursor-pointer"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Job description</label>
            <textarea
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
              rows={8}
              placeholder="Paste the full job description here..."
              className="w-full rounded-lg border border-ink/15 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-signal/40"
            />
          </div>

          {error && (
            <p className="text-sm text-flag border border-flag/30 bg-flag/5 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="bg-ink text-paper px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-ink/90 disabled:opacity-50"
          >
            {loading ? "Analyzing..." : "Analyze my resume"}
          </button>
          <p className="text-xs text-ink/40">
            Limited to 100 analyses per day per network -- just a backstop against bots, not a real cap for normal use.
          </p>
        </form>

        {/* Standalone checks -- neither needs a job description */}
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="bg-white/60 rounded-xl border border-ink/10 p-5">
            <h3 className="font-display text-base font-semibold">Resume strength</h3>
            <p className="text-xs text-ink/60 mt-1 mb-3">
              Flags vague or unquantified bullets, no job description needed.
            </p>
            <button
              type="button"
              onClick={handleCheckStrength}
              disabled={strengthLoading}
              className="border border-ink/20 px-4 py-2 rounded-lg text-sm font-medium hover:bg-ink/5 disabled:opacity-50 w-full"
            >
              {strengthLoading ? "Checking..." : "Check strength"}
            </button>

            {strengthError && (
              <p className="text-xs text-flag mt-3">{strengthError}</p>
            )}

            {strengthResult && (
              <div className="mt-4 space-y-2">
                <p className="text-xs text-ink/70">
                  <span className="font-semibold text-signal">{strengthResult.strong_bullets}</span> strong /{" "}
                  <span className="font-semibold text-flag">{strengthResult.flagged_bullets}</span> flagged
                </p>
                {strengthResult.details
                  .filter((d) => d.issues.length > 0)
                  .map((d, i) => (
                    <div key={i} className="border border-flag/20 bg-flag/5 rounded-lg p-2.5">
                      <p className="text-xs text-ink/80 mb-1">"{d.text}"</p>
                      <ul className="list-disc list-inside text-[11px] text-ink/60 space-y-0.5">
                        {d.issues.map((issue, j) => (
                          <li key={j}>{issue}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                {strengthResult.flagged_bullets === 0 && (
                  <p className="text-xs text-signal">No obviously weak bullets detected.</p>
                )}
              </div>
            )}
          </div>

          <div className="bg-white/60 rounded-xl border border-ink/10 p-5">
            <h3 className="font-display text-base font-semibold">ATS formatting</h3>
            <p className="text-xs text-ink/60 mt-1 mb-3">
              Checks file structure (tables, columns, images) that can break real ATS parsers.
            </p>
            <button
              type="button"
              onClick={handleCheckAts}
              disabled={atsLoading}
              className="border border-ink/20 px-4 py-2 rounded-lg text-sm font-medium hover:bg-ink/5 disabled:opacity-50 w-full"
            >
              {atsLoading ? "Checking..." : "Check ATS formatting"}
            </button>

            {atsError && <p className="text-xs text-flag mt-3">{atsError}</p>}

            {atsResult && (
              <div className="mt-4 space-y-2">
                {atsResult.clean ? (
                  <p className="text-xs text-signal">No structural ATS issues detected.</p>
                ) : (
                  atsResult.issues.map((iss, i) => (
                    <div key={i} className="border border-flag/20 bg-flag/5 rounded-lg p-2.5">
                      <p className="text-xs font-medium text-flag mb-1">{iss.issue}</p>
                      <p className="text-[11px] text-ink/60">{iss.why}</p>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        {result && (
          <section className="mt-10 space-y-8">
            <div className="flex items-baseline gap-3">
              <span className="font-display text-5xl font-semibold text-signal">
                {result.match_percentage}%
              </span>
              <span className="text-ink/60 text-sm">match to this job description</span>
            </div>

            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-ink/50 mb-2">
                Matched keywords
              </h3>
              <div>
                {result.matched_skills?.length ? (
                  result.matched_skills.map((k) => <KeywordPill key={k} label={k} tone="matched" />)
                ) : (
                  <p className="text-sm text-ink/40">None detected.</p>
                )}
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-ink/50 mb-2">
                Missing keywords
              </h3>
              <div>
                {result.missing_skills?.length ? (
                  result.missing_skills.map((k) => <KeywordPill key={k} label={k} tone="missing" />)
                ) : (
                  <p className="text-sm text-ink/40">Nothing significant missing.</p>
                )}
              </div>
            </div>

            <div>
              <button
                type="button"
                onClick={() => setShowHighlights((v) => !v)}
                className="text-xs text-signal font-medium hover:underline"
              >
                {showHighlights ? "Hide" : "Show"} keywords highlighted in context
              </button>

              {showHighlights && (
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink/50 mb-1.5">
                      Your resume (matched, in green)
                    </p>
                    <div className="text-xs leading-relaxed bg-white/60 border border-ink/10 rounded-lg p-3 max-h-72 overflow-y-auto whitespace-pre-wrap">
                      <HighlightedText text={result.resume_text} keywords={result.matched_skills} tone="matched" />
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink/50 mb-1.5">
                      Job description (missing, in orange)
                    </p>
                    <div className="text-xs leading-relaxed bg-white/60 border border-ink/10 rounded-lg p-3 max-h-72 overflow-y-auto whitespace-pre-wrap">
                      <HighlightedText text={jobDescription} keywords={result.missing_skills} tone="missing" />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {result.suggestions?.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wide text-ink/50 mb-2">
                  Suggestions
                </h3>
                <ul className="list-disc list-inside text-sm space-y-1 text-ink/80">
                  {result.suggestions.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-ink/50">
                  Tailored bullet points -- edit before you export
                </h3>
                <button
                  onClick={addBullet}
                  type="button"
                  className="text-xs text-signal font-medium hover:underline"
                >
                  + Add bullet
                </button>
              </div>
              <p className="text-xs text-ink/40 mb-3">
                Nothing downloads until you're happy with it -- edit freely below.
              </p>
              <div className="space-y-2">
                {bullets.map((bullet, i) => (
                  <div key={i} className="flex gap-2 items-start">
                    <textarea
                      value={bullet}
                      onChange={(e) => updateBullet(i, e.target.value)}
                      rows={2}
                      className="flex-1 rounded-lg border border-ink/15 p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-signal/40"
                    />
                    <button
                      onClick={() => removeBullet(i)}
                      type="button"
                      aria-label="Remove bullet"
                      className="text-ink/30 hover:text-flag text-sm px-2 py-2"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex gap-3 mt-4">
                <button
                  onClick={() => handleDownload("docx")}
                  disabled={downloading || bullets.length === 0}
                  className="border border-ink/20 px-4 py-2 rounded-lg text-sm font-medium hover:bg-ink/5 disabled:opacity-50"
                >
                  Download .docx
                </button>
                <button
                  onClick={() => handleDownload("pdf")}
                  disabled={downloading || bullets.length === 0}
                  className="border border-ink/20 px-4 py-2 rounded-lg text-sm font-medium hover:bg-ink/5 disabled:opacity-50"
                >
                  Download .pdf
                </button>
              </div>
            </div>

            {result.interview_questions?.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wide text-ink/50 mb-2">
                  Likely interview questions
                </h3>
                <ol className="list-decimal list-inside text-sm space-y-1 text-ink/80">
                  {result.interview_questions.map((q, i) => (
                    <li key={i}>{q}</li>
                  ))}
                </ol>
              </div>
            )}

            <div className="border-t border-ink/10 pt-6">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-ink/50">
                  Full CV rewrite
                </h3>
                {!cvData && (
                  <button
                    type="button"
                    onClick={handleRewriteFullCv}
                    disabled={cvLoading}
                    className="border border-ink/20 px-4 py-2 rounded-lg text-sm font-medium hover:bg-ink/5 disabled:opacity-50"
                  >
                    {cvLoading ? "Rewriting..." : "Rewrite my full CV"}
                  </button>
                )}
              </div>
              <p className="text-xs text-ink/40 mb-2">
                Reorganizes your whole resume into a clean, tailored CV -- using only your real experience, reworded for this job.
              </p>

              {cvError && (
                <p className="text-sm text-flag border border-flag/30 bg-flag/5 rounded-lg px-3 py-2 mt-2">
                  {cvError}
                </p>
              )}

              {cvData && (
                <div className="mt-3 space-y-4 bg-white/60 border border-ink/10 rounded-xl p-5">
                  <p className="text-xs text-ink/40">Edit freely before exporting -- nothing downloads until you do.</p>

                  <div>
                    <label className="block text-xs font-medium text-ink/50 mb-1">Full name</label>
                    <input
                      type="text"
                      value={cvData.full_name || ""}
                      onChange={(e) => updateCvField("full_name", e.target.value)}
                      className="w-full rounded-lg border border-ink/15 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal/40"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-ink/50 mb-1">Contact line</label>
                    <input
                      type="text"
                      value={cvData.contact_line || ""}
                      onChange={(e) => updateCvField("contact_line", e.target.value)}
                      className="w-full rounded-lg border border-ink/15 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal/40"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-ink/50 mb-1">Summary</label>
                    <textarea
                      value={cvData.summary || ""}
                      onChange={(e) => updateCvField("summary", e.target.value)}
                      rows={3}
                      className="w-full rounded-lg border border-ink/15 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal/40"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-ink/50 mb-2">Experience</label>
                    <div className="space-y-4">
                      {(cvData.experience || []).map((exp, i) => (
                        <div key={i} className="border border-ink/10 rounded-lg p-3 space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            <input
                              type="text"
                              placeholder="Title"
                              value={exp.title || ""}
                              onChange={(e) => updateCvExperience(i, "title", e.target.value)}
                              className="rounded-lg border border-ink/15 p-2 text-sm"
                            />
                            <input
                              type="text"
                              placeholder="Organization"
                              value={exp.organization || ""}
                              onChange={(e) => updateCvExperience(i, "organization", e.target.value)}
                              className="rounded-lg border border-ink/15 p-2 text-sm"
                            />
                          </div>
                          <input
                            type="text"
                            placeholder="Dates"
                            value={exp.dates || ""}
                            onChange={(e) => updateCvExperience(i, "dates", e.target.value)}
                            className="w-full rounded-lg border border-ink/15 p-2 text-sm"
                          />
                          {(exp.bullets || []).map((bullet, j) => (
                            <textarea
                              key={j}
                              value={bullet}
                              onChange={(e) => updateCvExperienceBullet(i, j, e.target.value)}
                              rows={2}
                              className="w-full rounded-lg border border-ink/15 p-2 text-sm"
                            />
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>

                  {cvData.education?.length > 0 && (
                    <div>
                      <label className="block text-xs font-medium text-ink/50 mb-2">Education</label>
                      <div className="space-y-2">
                        {cvData.education.map((edu, i) => (
                          <div key={i} className="grid grid-cols-3 gap-2">
                            <input
                              type="text"
                              placeholder="Degree"
                              value={edu.degree || ""}
                              onChange={(e) => updateCvEducation(i, "degree", e.target.value)}
                              className="rounded-lg border border-ink/15 p-2 text-sm"
                            />
                            <input
                              type="text"
                              placeholder="Institution"
                              value={edu.institution || ""}
                              onChange={(e) => updateCvEducation(i, "institution", e.target.value)}
                              className="rounded-lg border border-ink/15 p-2 text-sm"
                            />
                            <input
                              type="text"
                              placeholder="Dates"
                              value={edu.dates || ""}
                              onChange={(e) => updateCvEducation(i, "dates", e.target.value)}
                              className="rounded-lg border border-ink/15 p-2 text-sm"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-medium text-ink/50 mb-1">Skills (comma-separated)</label>
                    <input
                      type="text"
                      value={(cvData.skills || []).join(", ")}
                      onChange={(e) => updateCvSkills(e.target.value)}
                      className="w-full rounded-lg border border-ink/15 p-2 text-sm"
                    />
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={() => handleDownloadCv("docx")}
                      disabled={cvDownloading}
                      className="border border-ink/20 px-4 py-2 rounded-lg text-sm font-medium hover:bg-ink/5 disabled:opacity-50"
                    >
                      Download .docx
                    </button>
                    <button
                      onClick={() => handleDownloadCv("pdf")}
                      disabled={cvDownloading}
                      className="border border-ink/20 px-4 py-2 rounded-lg text-sm font-medium hover:bg-ink/5 disabled:opacity-50"
                    >
                      Download .pdf
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="border-t border-ink/10 pt-6">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-ink/50">
                  Cover letter
                </h3>
                {!letterParagraphs && (
                  <button
                    type="button"
                    onClick={handleGenerateCoverLetter}
                    disabled={letterLoading}
                    className="border border-ink/20 px-4 py-2 rounded-lg text-sm font-medium hover:bg-ink/5 disabled:opacity-50"
                  >
                    {letterLoading ? "Generating..." : "Generate cover letter"}
                  </button>
                )}
              </div>

              {letterError && (
                <p className="text-sm text-flag border border-flag/30 bg-flag/5 rounded-lg px-3 py-2 mt-2">
                  {letterError}
                </p>
              )}

              {letterParagraphs && (
                <div className="mt-3 space-y-3">
                  <p className="text-xs text-ink/40">Edit freely before exporting -- nothing downloads until you do.</p>
                  <div className="space-y-2">
                    {letterParagraphs.map((para, i) => (
                      <textarea
                        key={i}
                        value={para}
                        onChange={(e) => updateParagraph(i, e.target.value)}
                        rows={4}
                        className="w-full rounded-lg border border-ink/15 p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-signal/40"
                      />
                    ))}
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={() => handleDownloadLetter("docx")}
                      disabled={letterDownloading}
                      className="border border-ink/20 px-4 py-2 rounded-lg text-sm font-medium hover:bg-ink/5 disabled:opacity-50"
                    >
                      Download .docx
                    </button>
                    <button
                      onClick={() => handleDownloadLetter("pdf")}
                      disabled={letterDownloading}
                      className="border border-ink/20 px-4 py-2 rounded-lg text-sm font-medium hover:bg-ink/5 disabled:opacity-50"
                    >
                      Download .pdf
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
