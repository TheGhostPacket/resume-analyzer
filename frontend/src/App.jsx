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

export default function App() {
  const [resumeFile, setResumeFile] = useState(null);
  const [jobDescription, setJobDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [bullets, setBullets] = useState([]); // editable copy of tailored_bullets
  const [downloading, setDownloading] = useState(false);

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

  async function handleDownload(format) {
    setDownloading(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Tailored Resume Bullets",
          bullets: bullets.filter((b) => b.trim().length > 0),
          format,
        }),
      });
      if (!res.ok) throw new Error("Couldn't generate the file. Please try again.");

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = format === "docx" ? "tailored_resume.docx" : "tailored_resume.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message);
    } finally {
      setDownloading(false);
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
            Limited to 5 analyses per 2 hours per network to keep this demo available for everyone.
          </p>
        </form>

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
          </section>
        )}
      </main>
    </div>
  );
}
