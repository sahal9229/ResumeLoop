# ResumeLoop

**Live app → [https://resume-loop.vercel.app](https://resume-loop.vercel.app/)**

An ATS resume tailor whose real subject is **loop engineering**. The tailoring never happens
in one hidden call — it runs as a visible agent loop, drawn as a literal circle on screen.
Every model call, every rule check, every "not good enough, go around again" is rendered
live, the moment it actually happens.

The resume is the by-product. **The loop is the product.**

---

## The loop, in plain words

Upload a resume, paste a job description, set how many laps the loop may run — then watch
the flow travel clockwise around a circle:

```
                     01 START
              your resume + the job post
                        │
                        ▼
        ┌────────► 02 SAFETY CHECK ─────────┐
        │          laps · calls · time      │
        │                                   ▼
   FAILED — GO                          03 PLAN
   AROUND AGAIN                    pick what to fix
        │                                   │
        ▼                                   ▼
     06 PASS? ◄──── 05 CHECK ◄──── 04 REWRITE
   all 9 rules      a second AI      AI rewrites
       ok?           · 9 rules       the resume
        │
        │ all rules pass
        ▼
     07 YOUR OK  —  you approve the result
        │
        ▼
     08 DONE
```

| Stage | What actually happens |
|---|---|
| **START** | Your resume and the job post are read and parsed (client-side, then one extraction call each). |
| **SAFETY CHECK** | Plain code, no model: laps used, API calls made, seconds elapsed. Visible on every cycle. |
| **PLAN** | The failed rules from the last check become this lap's complete to-do list. |
| **REWRITE** | One model call rewrites only what the failed rules name. The draft is saved to memory. |
| **CHECK** | A *different* model call — a checker that never talks to the writer — grades the draft against 9 fixed rules and compares it line-by-line with the original for honesty. |
| **PASS?** | Deterministic JavaScript, no model: all rules pass → exit. Otherwise the failures go around the circle again as the next lap's to-do list — the red arc lights up. |
| **YOUR OK** | Human in the loop: the run stops, and a real click from you is the final gate. |
| **DONE** | The result page: before/after diff, final rules scorecard, honest gap report, PDF export. |

Nothing on screen is simulated. There are no timer-driven animations and no scripted
progress — every visual state change is triggered by a real event emitted by the engine at
the moment it happened. The only continuous motion is a 1-second pulse that means "still
waiting on the model", never fake progress.

## The live ticker

A **NOW** feed narrates every real step as it fires, newest on top:

```
■ MEMORY   Draft scored 38 < best 83 — kept the best draft
■ PASS?    Not done — 2 failures go around again as lap 3's to-do list
■ CHECK    Result: score 83 — 2 of 9 failing
□ CHECK    Calling the API
■ REWRITE  New draft ready — 4 changes saved to memory
■ REWRITE  Error captured — retrying in 2s (attempt 1/3)
■ SAFETY   Lap 2/5 · 8 calls · 34s — ok to continue
```

That includes the two retry loops that make agent loops robust in the real world, shown
honestly whenever they actually occur:

- **Crashed call** → error captured → exponential backoff → retry (429s on free tiers make
  this a live demo, not a slide).
- **Malformed JSON** → the parse error is sent back to the model with instructions to fix it.

## Score stability — keep the best

The engine is a hill-climber with memory:

- All calls run at **temperature 0**, so the checker's nine pass/fail verdicts don't flip on
  sampling noise between laps.
- Every verified draft is compared against the **best draft so far**. A rewrite that scores
  worse is discarded — the next lap rebuilds from the best draft, and the final answer is
  always the best-scoring draft, never merely the last one. Reverts are announced in the
  ticker (`MEMORY: kept the best draft`).

## The 9 fixed rules

Every check must return a verdict on all nine. The score is computed deterministically from
their weights — the model never invents a number:

| ID | Rule | Weight |
|---|---|---|
| `KW-MUSTHAVE` | Every must-have JD keyword present, woven into real sentences | 25 |
| `BULLET-IMPACT` | Every bullet: strong action verb + method/tool + concrete result | 20 |
| `KW-NICE` | Nice-to-have keywords included where truthfully supported | 10 |
| `NO-FILLER` | Zero "responsible for", "worked on", passive voice, vague filler | 10 |
| `SUMMARY` | 2–3 line summary naming the target role and strongest matching qualifications | 10 |
| `RELEVANCE` | Every bullet and section serves this specific job | 8 |
| `HONESTY` | Line-by-line comparison against the original — nothing fabricated, ever | 7 |
| `TENSE` | Past roles in past tense, current role in present tense — consistently | 5 |
| `ATS-FORMAT` | Plain text, standard uppercase headings, single column, parser-safe | 5 |

**Stop conditions** (all in plain code): all 9 rules pass (`perfect`) · out of laps (`max`) ·
two consecutive drafts fail the identical rule set (`plateau` — the AI is stuck, a human
should look).

## Honesty guardrails

- The `HONESTY` rule compares every draft against the **original unedited resume**; a single
  fabricated employer, metric, tool, or title fails the lap.
- When a fix is impossible without lying (a must-have skill the candidate simply lacks), it
  lands in the **GAPS — NOT FIXED** report on the result page, with an honest note on how to
  close it in real life. Never in the resume.
- This puts a truthfulness ceiling on the score by design: a resume genuinely missing
  must-haves cannot reach 100, and the app says so instead of lying.

## Event vocabulary

The engine (`js/loop.js`) emits a typed event stream; the UI is a pure subscriber and can
never show anything the loop didn't do:

```
setup:start / setup:done      reading the job post and resume
guard:check                   the safety ledger: lap, calls, elapsed, within budget
iter:start                    a lap begins, with its failed-rule to-do list
do:start / do:done            the rewrite call
verify:start / verify:done    the checker's 9-rule verdict + deterministic score
decide:done                   loop or stop, with the reason
revert                        this lap's draft scored worse — best draft kept
iter:done · score · note      bookkeeping + human-readable notes
api                           wire telemetry: request / response / retry / parse-fail
stop                          the loop halted: perfect | max | plateau | aborted | error
phase:start/done (polish)     one line-edit pass after the loop (no new facts)
gaps:start / gaps:done        the honest gap report
```

## Run it locally

```bash
git clone https://github.com/sahal9229/ResumeLoop
cd ResumeLoop
```

Double-click **`serve.cmd`** (Windows) or run **`./serve.sh`** (macOS/Linux). It starts a tiny
static server and opens `http://127.0.0.1:8777/`. No install, no build step — plain HTML +
ES modules. (A server is required because browsers refuse to load ES modules from `file://`;
opening `index.html` directly shows a banner explaining exactly this.)

Then add an API key on the Input page:

- **Gemini (free tier):** [aistudio.google.com/apikey](https://aistudio.google.com/apikey) —
  default model `gemini-2.5-flash` (prefer it over `-lite` for better rewrites)
- **OpenRouter:** [openrouter.ai/keys](https://openrouter.ai/keys) — pick a preset or paste any
  model slug from [openrouter.ai/models](https://openrouter.ai/models)

Everything is client-side: files are parsed in the browser, and the key is stored in
`localStorage` and sent from your browser straight to the provider. Fine for a demo, not a
pattern for production.

## Design

Bauhaus: paper background, ink structure, and three primaries assigned to meaning and never
swapped — **blue = doing**, **yellow = checking / your attention**, **red = failure / go
around again**, ink-filled = done. Geometry is squares and circles only, no shadows, no
gradients; state changes are instant. Type is Jost (display) + IBM Plex Mono (machine
values). The 120px number in the center of the circle is the lap counter.

## Project structure — one concern per file

```
index.html        the three pages + clickable 01/02/03 stepper (markup only)
css/custom.css    the design system: palette, type scale, the ring, every component
js/main.js        entry point, page state machine, event fan-out, navigation gates
js/loop.js        THE LOOP ENGINE — guard, plan, rewrite, check, decide, keep-the-best;
                  emits events, never touches the DOM
js/prompts.js     the 9 rule definitions + rewrite/check/polish/gaps prompts + guardrails
js/llm.js         the ONE place a model is called (temperature 0, 429 backoff, JSON re-ask)
js/theater.js     the circular loop view + NOW ticker + red go-around arc (pure view)
js/checklist.js   the 3×3 rules grid used on the result page
js/results.js     result page: before/after diff, scorecard, gaps, change log
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
| Retry with backoff — the crashed-tool path, live in the ticker | `js/llm.js` retry loop |
| JSON self-repair — sending the model its own error to fix | `js/llm.js` · `askJSON()` |
| The loop itself — a plain `while (true)` | `js/loop.js` · `runLoop()` |
| The safety guard — budget checked every cycle, no model | `guard:check` in `js/loop.js` |
| Keep-the-best memory — discard regressions, ship the best draft | the `revert` block in `js/loop.js` |
| Writer/checker separation — no grading your own homework | `js/prompts.js` · `verifyPrompt` vs `doPrompt` |
| Deterministic PASS? — the step with no model in it | the decide block in `js/loop.js` |
| The honesty guardrail wording | `js/prompts.js` · `HONESTY` |
| Human in the loop — the final OK is a real click | `YOUR OK` on the Process page |

## License

MIT — use it, modify it, teach with it.
