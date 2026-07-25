# ResumeLoop

An ATS resume tailor whose real subject is **loop engineering**. The tailoring never happens
in one hidden call — it runs as a visible `while` loop, and the whole trace is on screen.

Three pages, like a wizard:

1. **Upload** — resume (PDF/DOCX/TXT or paste) + job description + loop settings
2. **Process** — the live loop-tracking dashboard: every iteration's Thought / Action /
   Observation, a climbing score gauge, and the exact stop condition that ended the loop
3. **Download** — the tailored resume, before→after score, honest gaps report, change log,
   and a structured **PDF export** (real selectable text via pdfmake — never an image)

## Run it

Double-click **`serve.cmd`** (Windows) or run **`./serve.sh`** (macOS/Linux). It starts a tiny
local server and opens `http://127.0.0.1:8777/`. No install, no build step — the app is plain
HTML + Tailwind (CDN) + vanilla JS modules.

> Why a server at all? Browsers refuse to load ES modules from `file://`. Opening `index.html`
> by double-clicking shows a banner explaining exactly this.

- Free Gemini key: https://aistudio.google.com/apikey (default model `gemini-2.5-flash`)
- Or pick an OpenRouter model in the dropdown: https://openrouter.ai/keys

The key is stored in `localStorage` and sent from the browser straight to the provider.
Fine for a local class demo — **not** for a public deployment. For that, move the loop behind
a server that holds the key and stream each iteration out over SSE; the front-end would barely
change, since the dashboard already consumes one event per phase.

## Project structure — one concern per file

```
index.html        the three pages + persistent 1-2-3 stepper (markup only)
css/custom.css    the few things Tailwind can't do (gauge ring, pulse, slide-in)
js/main.js        entry point + page state machine (Upload → Process → Download)
js/loop.js        THE LOOP ENGINE — emits events, never touches the DOM
js/timeline.js    renders the engine's events as the live dashboard (page 2)
js/results.js     renders the Download page (page 3)
js/resume.js      plain text → structure → pdfmake PDF / preview
js/llm.js         the ONE place we talk to a model (+ 429 retry with backoff)
js/prompts.js     the five stage prompts + honesty/ATS guardrail text
js/parser.js      PDF / DOCX / TXT → plain text, all client-side
js/settings.js    reads the form, validates, persists to localStorage
js/dom.js         tiny shared DOM helpers
serve.cmd/.sh     one-click local server
```

| What to point at in class | Where |
|---|---|
| **The single LLM call** — only file that knows a model exists | [js/llm.js](js/llm.js) `callLLM()` |
| Rate-limit resilience — exponential backoff on 429/5xx | [js/llm.js](js/llm.js) `callLLM()` retry loop |
| Defensive JSON parsing + one re-ask | [js/llm.js](js/llm.js) `askJSON()` |
| The five stage prompts (JD, parser, scorer, planner, reviser) | [js/prompts.js](js/prompts.js) |
| **The loop itself** — a plain `while(true)` | [js/loop.js](js/loop.js) `runLoop()` |
| The stop condition | the three `if (…) { stopCode = …; break; }` lines at the top of the loop |
| Engine ↔ UI decoupling — the event vocabulary | comment block at the top of [js/loop.js](js/loop.js) |
| The honesty guardrail wording | [js/prompts.js](js/prompts.js) `HONESTY` |

## The loop

State carried across every pass: `jobRequirements`, `currentResume`, `atsScore`,
`previousScore`, `gaps`, `iteration`, `changeLog`.

```
INITIALIZE   extract JD requirements → parse resume → score the original (baseline)

LOOP
  (b) DECIDE    stop if  atsScore >= targetScore
                      or iterations >= maxIterations
                      or improvement < 2               ← plateaued
  (c) THINK     pick the top 2-4 highest-impact fixes for this pass
  (d) ACT       rewrite the resume applying only those fixes
  (a) OBSERVE   re-score → new score, matched/missing keywords, weak bullets

OUTPUT       final resume + before/after + honest gap report + change log → page 3
```

Each pass costs three model calls (plan, revise, score), plus three fixed ones
(JD extract, resume parse, gap report).

The engine emits plain event objects (`iter:start`, `phase:done`, `score`, `stop`, …) and
the dashboard renders them — the loop is logic, the dashboard is a view. That separation is
itself the lesson.

## Teaching levers on the Upload page

- **Target ATS score** slider — drop it to 60 and the loop stops after one pass; raise it to
  95 and watch it grind into the plateau or the max-iterations ceiling instead.
- **Max iterations** slider — set it to 1 to show a loop that never reaches its goal.
- **Model** dropdown — same loop, different brain. The loop is the architecture; the model is
  a swappable part.
- Every card on the Process page has a **"🔍 Under the hood"** drawer showing the raw JSON the
  model returned for that stage.

## Honesty guardrails

The reviser is instructed never to invent employers, titles, dates, degrees, certifications,
or metrics, and to only weave in a keyword where the candidate's existing experience genuinely
supports it. When it refuses a planned fix it says so (`couldNotDo`), that shows up in the
Action phase as "🚫 refused to fake", and the missing requirement lands in the
**"Gaps we could not fix"** report on the Download page instead of in the resume.

Output is deliberately plain text with standard uppercase headings — single column, no tables
or graphics — and the PDF export keeps it that way (pdfmake, real text, Roboto).
