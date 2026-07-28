# Resume Analyzer

No accounts. Upload a resume (PDF/DOCX) + paste a job description →
get a match %, missing keywords, AI-tailored bullet points (editable
before download), and likely interview questions. Export to .docx or
.pdf once you're happy with the edits.

## Project structure

```
backend/     FastAPI app (parsing, matching, AI call, export, rate limit)
frontend/    React + Vite + Tailwind UI
.github/workflows/keep-alive.yml   free keep-alive ping (see below)
```

## Run it locally

**Backend:**
```bash
cd backend
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # then add your real OPENAI_API_KEY
uvicorn main:app --reload
```
Runs at http://localhost:8000. Check http://localhost:8000/health.

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```
Runs at http://localhost:5173, talking to the backend at localhost:8000
by default (see `VITE_API_BASE` in App.jsx).

## Deploy: backend on Render, frontend on Netlify

**1. Push this whole folder to your private GitHub repo.**

**2. Backend on Render:**
- New → Web Service → connect your repo, set root directory to `backend`
- Render will detect the Dockerfile automatically
- Add environment variable `OPENAI_API_KEY` (and `OPENAI_MODEL` if you
  want something other than gpt-4o-mini) under Environment
- Deploy. Note the URL it gives you, e.g. `https://your-app.onrender.com`

**3. Frontend on Netlify:**
- New site from Git → connect the same repo, base directory `frontend`
- Build command: `npm run build`, publish directory: `dist`
- Add environment variable `VITE_API_BASE` = your Render backend URL
  from step 2
- Deploy

**4. Lock down CORS:** in `backend/main.py`, replace `allow_origins=["*"]`
with your actual Netlify URL once you have it, so random sites can't
call your API.

## Keep-alive ping (free, no third-party account needed)

`.github/workflows/keep-alive.yml` is already set up to ping your
backend's `/health` endpoint every 10 minutes using GitHub Actions --
which is free on private repos (well within the free monthly minutes
for a ping this small).

**Before it works, you must:**
1. Open `.github/workflows/keep-alive.yml`
2. Replace `YOUR-BACKEND.onrender.com` with your real Render URL from
   the deploy step above
3. Commit and push -- GitHub will start running it on schedule
   automatically (Actions are enabled by default on new repos)
4. Optional: go to the Actions tab on GitHub and manually run it once
   ("Run workflow" button) to confirm it hits your backend successfully

This keeps the service warm 24/7 without paying for Render's Starter
tier, and without creating an account on a third-party uptime service.

## Notes on the design decisions made along the way

- **No accounts/DB in v1** -- everything is processed in memory per
  request. Simpler, and nothing to secure or leak.
- **Match % is a transparent keyword-overlap ratio** (see
  `analysis.py`), not a black-box AI score -- defensible in an
  interview: you can point to exactly how it's computed.
- **The AI never edits the match score or invents experience** -- the
  system prompt in `ai.py` explicitly forbids inventing skills; it can
  only rephrase what's already in the resume.
- **Two AI providers with fallback** -- Gemini is tried first (its free
  tier -- 1,000 requests/day -- easily covers demo traffic), and OpenAI
  is only called if Gemini's request fails for any reason (quota, key
  issue, network blip). Set `GEMINI_API_KEY` and, optionally,
  `OPENAI_API_KEY` as a safety net. If you only set one, that's fine --
  the other is simply skipped.
- **Dash style (`-` not `—`) is enforced twice**: once via prompt
  instruction, once via a deterministic `.replace()` pass in code after
  the AI responds -- prompting alone isn't reliable enough for a rule
  like this.
- **Downloads only ever come from the edited text on screen**, never
  directly from raw AI output -- the edit step is the safety net against
  AI mistakes.
- **Rate limit (5 analyses / 2 hours) is IP-based**, which is a basic
  abuse guard, not real access control -- good enough for a portfolio
  demo, not something to oversell as robust in an interview.
