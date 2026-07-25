# ResumeLoop

**Live demo → [https://resume-loop.vercel.app](https://resume-loop.vercel.app/)**

An ATS resume tailor whose real subject is **loop engineering**. The tailoring never happens
in one hidden call — it runs as a visible, deterministic `while` loop, and the entire trace is
rendered live on screen: every model call, every verification, every decision to go around again.

The resume is the by-product. **The loop is the product.**

---

## What it does

Upload a resume, paste a job description, set a target — then watch a
**DO → VERIFY → DECIDE** agent cycle run in real time:

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│ 01 CONTEXT   │───►│ 02 WRITE     │───►│ 03 VERIFY    │───►│ 04 DECIDE    │
│ resume+todo  │    │ apply fixes  │    │ 9 rule check │    │ all pass?    │
└──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘
        ▲                                                          │
        │       no · failed checks become the next lap's todo      │
        └──────────────────────────◄───────────────────────────────┤
                                                                   │ yes
                                                            ┌──────▼───────┐
                                                            │ 05 HALT  [✓] │
                                                            └──────────────┘
```

1. **DO (the Worker)** — revises the resume, driven strictly by a prioritized to-do list of
   failed quality checks. Each change cites the check ID it fixes.
2. **VERIFY (the Verifier)** — an independent LLM call with zero access to the worker's
   reasoning. It grades the draft against **9 fixed, named quality rules** and compares it
   line-by-line against the *original* resume for honesty.
3. **DECIDE (deterministic code)** — no model involved. Plain JavaScript reads the verdict:
   all checks pass → halt (`perfect`) · laps exhausted → halt (`max`) · same checks failed
   twice with no change → halt (`plateau`) · otherwise → loop again.

After the loop halts, a single **Final Polish** pass line-edits the winner — grammar, tense,
bullet parallelism — with an explicit instruction to change no facts and add no keywords.

## The 9 fixed quality checks

Every lap, the verifier must return a verdict on all nine — students watch a wall of `[✗]`
flip to `[✓]` lap by lap:

| ID | Rule |
|---|---|
| `KW-MUSTHAVE` | Every must-have JD keyword present, woven into real sentences |
| `KW-NICE` | Nice-to-have keywords included where the candidate's experience truthfully supports them |
| `BULLET-IMPACT` | Every bullet: strong action verb + method/tool + concrete result |
| `NO-FILLER` | Zero "responsible for", "worked on", "helped with", passive voice, or vague filler |
| `SUMMARY` | 2–3 line summary naming the target role and strongest matching qualifications |
| `TENSE` | Past roles in past tense, current role in present tense — consistently |
| `RELEVANCE` | Every bullet and section serves this specific job |
| `HONESTY` | Line-by-line comparison against the original — nothing fabricated, ever |
| `ATS-FORMAT` | Plain text, standard uppercase headings, single column, parser-safe |

## Two views, one event stream

The Process page renders the same live event stream through two lenses — switching tabs
mid-run never restarts or replays anything:

- **TECHNICAL LOG** — every phase as a log panel: the lap's `[TODO]`, what the worker changed,
  the full 9-check verdict with evidence, the deterministic decision, a **"why another lap?"**
  card, and an **API wire log** per call (`→ POST … · worker (5.6KB)` / `← 200 OK in 3.1s` /
  `[✓] json valid`), including live `429 → retry` sequences.
- **LOOP DIAGRAM** — the flowchart above, live: nodes light as their phase actually runs,
  captions are generated from the real JSON the models returned, and the halt banner states
  which stop condition fired, in plain language.

Nothing on screen is simulated. There are no timer-driven animations and no scripted
progress — every visual state change is triggered by a real event emitted by the engine at
the moment that phase completed. The fan-out in `main.js` is the structural guarantee:
both views (plus the persistent checklist panel) subscribe to one `emit` stream.

## Honesty guardrails

- The verifier's `HONESTY` check compares every draft against the **original unedited resume**;
  a single fabricated employer, metric, tool, or title fails the lap.
- When a fix is impossible without lying (a must-have skill the candidate simply lacks), the
  worker refuses and says so — the refusal is shown in the log.
- Those requirements land in the **"Gaps / not fixed"** report on the Download page, with an
  honest note on how to actually close each one in real life. Never in the resume.

## Run it locally

```bash
git clone <this repo>
cd ResumeLoop
```

Double-click **`serve.cmd`** (Windows) or run **`./serve.sh`** (macOS/Linux). It starts a tiny
static server and opens `http://127.0.0.1:8777/`. No install, no build step — plain HTML +
JS modules. (A server is required because browsers refuse to load ES modules from `file://`;
opening `index.html` directly shows a banner explaining exactly this.)

Then add an API key on the Upload page:

- **Gemini (free tier):** [aistudio.google.com/apikey](https://aistudio.google.com/apikey) — default model `gemini-2.5-flash`
- **OpenRouter:** [openrouter.ai/keys](https://openrouter.ai/keys) — pick a preset or paste any
  model slug from [openrouter.ai/models](https://openrouter.ai/models)

The key is stored in `localStorage` and sent from your browser straight to the provider —
fine for a local demo, not a pattern for production.

## Project structure — one concern per file

```
index.html        the three pages + persistent [1][2][3] stepper (markup only)
css/custom.css    the design system: terminal palette, type scale, every component
js/main.js        entry point + page state machine + the event fan-out to all views
js/loop.js        THE LOOP ENGINE — DO-VERIFY-DECIDE, emits events, never touches the DOM
js/prompts.js     the 9 check definitions + verify/do/polish/gaps prompts + guardrail text
js/llm.js         the ONE place a model is called (+ 429 retry with exponential backoff)
js/checklist.js   the persistent 9-check panel — the [✗]→[✓] wall
js/timeline.js    TECHNICAL LOG renderer
js/theater.js     LOOP DIAGRAM renderer (live ASCII flowchart)
js/results.js     Download page renderer
js/resume.js      plain text → structure → pdfmake PDF (selectable text, ATS-safe)
js/parser.js      PDF / DOCX / TXT → plain text, all client-side
js/settings.js    form state, validation, localStorage
js/dom.js         tiny DOM helpers
serve.cmd/.sh     one-click local server
```

## What to point at in class

| Teaching beat | Where |
|---|---|
| The single model call — only file that knows an LLM exists | `js/llm.js` · `callLLM()` |
| Rate-limit resilience — backoff on 429/5xx, visible in the wire log | `js/llm.js` retry loop |
| The loop itself — a plain `while (true)` | `js/loop.js` · `runLoop()` |
| The three halt conditions | the `perfect` / `max` / `plateau` breaks in `js/loop.js` |
| Worker/verifier separation — why the checker can't grade its own homework | `js/prompts.js` · `verifyPrompt` vs `doPrompt` |
| Deterministic DECIDE — the step with no model in it | `js/loop.js` decide block |
| The honesty guardrail wording | `js/prompts.js` · `HONESTY` |
| Live teaching levers | target-score + max-iterations sliders on the Upload page |

## License

MIT — use it, modify it, teach with it.
