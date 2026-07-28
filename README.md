# ResumeFit

An ATS resume builder. Paste your resume and a job posting; get back a rewritten,
ATS-safe resume, an honest score, and a straight answer about what you are missing.

No account, no backend, no build step. Everything runs in your browser, and your
resume is never uploaded anywhere — it goes to the model provider you choose and
nowhere else.

---

## How it works

Two model calls. That is the whole pipeline.

```
   YOUR RESUME  +  JOB POSTING
              │
              ▼
   ┌──────────────────────┐
   │  1. ANALYZE          │   read the posting: role, must-haves,
   │     the job posting  │   nice-to-haves, the exact ATS keywords
   └──────────┬───────────┘
              ▼
   ┌──────────────────────┐
   │  2. WRITE            │   rewrite the resume against those
   │     the resume       │   requirements, then grade the result
   └──────────┬───────────┘
              ▼
   TAILORED RESUME  ·  ATS SCORE  ·  KEYWORD COVERAGE  ·  GAPS
```

**Stage 1 — analyze.** The posting is reduced to structure: the role and seniority,
hard requirements versus preferences, and the literal keywords an ATS scans for,
spelled exactly as the posting spells them (`Node.js`, not `NodeJS`).

**Stage 2 — write.** A single call rewrites the resume against that structure and
grades its own output across six weighted areas. The score you see is the sum of
the visible breakdown, recomputed in code — if the model claims 95 while its own
breakdown adds to 79, you get 79.

---

## What makes the output good

The prompt encodes how professional resume writers actually work, not "make this
better":

- **Bullet formula** — every bullet is `strong verb + what you owned + the technology
  + the result or scope`. Bullets that open with *Responsible for*, *Worked on*, or
  *Helped with* are rewritten, and no two bullets in a role start with the same verb.
- **Evidence over adjectives** — *passionate*, *detail-oriented*, *team player* are cut
  and replaced with the fact that would make a reader conclude it.
- **Real numbers only** — every figure already in your resume is surfaced and moved to
  the end of its bullet where the eye lands. No number is ever invented.
- **Keywords inside sentences** — a must-have you genuinely have appears in a real
  sentence about real work, never as a keyword list stuffed at the bottom.
- **Structure recruiters expect** — a 2–3 line summary that names the role, skills
  grouped by category, standard uppercase headings, consistent tense per role.

### Honesty is enforced, not encouraged

The model may reframe, reorder, sharpen and quantify what is already in your resume.
It may not add an employer, title, date, degree, certification, tool, or metric that
is not there.

Anything the job requires and your resume cannot support is not written in — it goes
to the **gaps** section with a concrete way to close it for real. This is the useful
behaviour: a keyword you cannot back up gets you past the filter and then fails you
in the first screening call.

---

## What you get back

| | |
|---|---|
| **Tailored resume** | Editable in the browser before you export. Your edits are what gets exported. |
| **ATS score** | Out of 100, with all six weighted areas shown and a note on each. |
| **Keyword coverage** | Every must-have and ATS keyword, marked covered or missing. Must-haves flagged. |
| **What changed** | The substantive edits, each with the requirement or rule it serves. |
| **Gaps** | What was deliberately left out, why, and how to actually close it. |

Export as **PDF** or **TXT**. The PDF is deliberately conservative — one column, real
selectable text, standard headings, no tables, columns, graphics, or text boxes. It is
verified to extract in correct reading order, which is exactly what an ATS does to it.

---

## Running it

ES modules will not load over `file://`, so the app needs a local server.

```bash
./serve.sh          # macOS / Linux
serve.cmd           # Windows — or just double-click it
```

Then open <http://127.0.0.1:8777/>.

You will need an **OpenRouter** key from [openrouter.ai/keys](https://openrouter.ai/keys)
(it starts with `sk-or-`). It is stored in your browser's local storage and sent only
to OpenRouter.

### Models

Everything runs through OpenRouter, so one key covers every option — Anthropic, OpenAI
and Google models all use the same endpoint and the same key.

| Model | Cost (in / out per 1M) | When to pick it |
|---|---|---|
| **Claude Sonnet 5** *(default)* | $2 / $10 | Best writing quality for the price |
| Claude Haiku 4.5 | $1 / $5 | Fast and cheap; fine for a quick pass |
| Claude Opus 5 | $5 / $25 | Highest quality, when the role really matters |
| Claude Sonnet 4.5 | $3 / $15 | Previous-generation Sonnet |
| GPT-5.6 Terra | $1.25 / $7.50 | Strong non-Anthropic alternative |
| GPT-5.4 Mini | $0.75 / $4.50 | Cheapest option here |
| Gemini 3.5 Flash | $1.50 / $9 | Long-context alternative |

Pick **Custom model slug…** to use any other model from
[openrouter.ai/models](https://openrouter.ai/models) — paste its slug
(e.g. `deepseek/deepseek-chat`).

A run is two calls and a few thousand tokens, so even the expensive options cost
cents per resume.

---

## Project layout

```
index.html          two pages: input, result
css/custom.css      the whole design system
js/
  main.js           entry point, page wiring, upload handling
  build.js          the two-stage pipeline + response normalisers
  prompts.js        both prompts — the resume-writing standard lives here
  llm.js            the OpenRouter call: retries, backoff, JSON re-ask
  results.js        the result page (pure view)
  resume.js         resume text → structure → PDF
  parser.js         PDF / DOCX / TXT → plain text, in-browser
  settings.js       form snapshot + local storage
  dom.js            small shared helpers
```

`build.js` never trusts the model's output shape. Missing keywords are re-added as
uncovered rather than silently dropped, the score is recomputed from the breakdown,
legacy field names are accepted, and smart quotes, em dashes, and fancy bullet glyphs
are stripped from the resume text before it reaches the page.

---

## Notes

- Your resume and the job posting are sent to OpenRouter, which forwards them to the
  model you picked. Nothing is stored on any server belonging to this app, because
  there isn't one.
- PDF and DOCX parsing happen locally via pdf.js and mammoth.js.
- The score is a useful signal, not a guarantee. Real ATS implementations differ, and
  a human still reads the resume at the end.
