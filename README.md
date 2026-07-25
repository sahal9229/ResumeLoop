# ResumeLoop v4

> **Live Demo:** [https://resume-loop.vercel.app](https://resume-loop.vercel.app)

An ATS resume tailor whose real subject is **loop engineering**. The tailoring never happens in one hidden call — it runs as a visible, deterministic `while` loop, and the whole trace is rendered live on screen.

---

## 🌐 Live Demo

Try the live application online: **[https://resume-loop.vercel.app](https://resume-loop.vercel.app)**

---

## 🔁 What is ResumeLoop v4?

ResumeLoop implements a **Worker → Verifier → Decide** agentic cycle:
1. **🛠 DO (The Worker):** Revises the resume driven strictly by a prioritized **to-do list** of failed quality checks.
2. **🔍 VERIFY (The Verifier):** An independent LLM call (separate role, zero worker reasoning context) that checks the revised draft against **9 fixed, named quality rules** and compares against the original resume for honesty.
3. **⚖️ DECIDE (Deterministic Code):** Evaluates whether all checks pass (`perfect`), iterations are exhausted (`max`), or the same checks failed twice (`plateau`).

---

## 📋 The 9 Fixed Quality Checks

Every lap checks the draft against 9 explicit rules:

| Check ID | Rule Name | Description |
|---|---|---|
| `KW-MUSTHAVE` | Must-have ATS Keywords | All essential job requirements present & woven naturally |
| `KW-NICE` | Nice-to-have Keywords | Optional keywords included where candidate's experience supports them |
| `BULLET-IMPACT` | Bullet Impact Structure | Action verb + method + concrete result |
| `NO-FILLER` | Zero Filler / Passive Voice | Ban on "responsible for", "worked on", "helped with", etc. |
| `SUMMARY` | Target Role Summary | 2-3 line role-focused summary naming core qualifications |
| `TENSE` | Tense Consistency | Past roles in past tense; current role in present tense |
| `RELEVANCE` | Target JD Alignment | Every bullet and section directly serves the job |
| `HONESTY` | Ground Truth Check | Strict line-by-line guardrail against original resume |
| `ATS-FORMAT` | ATS-Safe Layout | Plain text, standard uppercase headings, no column/table parse risk |

---

## 🎬 Dual View Dashboard

### 1. ⚙️ Technical View
- **Persistent Quality Checklist Panel:** Live 9-check board with flip animations (`cl-flip`) on `verify:done` events.
- **"Why another lap?" Card:** Highlights the exact failing checks that trigger the next iteration.
- **Under the Hood:** Expandable drawers showing raw JSON emitted by the models.

### 2. 🎬 Loop Theater (Flowchart SVG)
- Interactive, animated flowchart diagram: `Context (Resume + Checks) → AI Writer → Verifier → Decision Diamond → Loop-back Arrow`.
- Real-time node state lighting (`idle`, `active`, `done`) and marching-ants loop arrow—driven 100% by real loop events with zero synthetic timers.

---

## 🚀 How to Run Locally

### 1. Clone & Serve
```bash
git clone https://github.com/your-username/ResumeLoop.git
cd ResumeLoop
```

Double-click **`serve.cmd`** (Windows) or run **`./serve.sh`** (macOS/Linux).  
It starts a local web server and opens `http://127.0.0.1:8777/`.

> **Note:** Browsers require HTTP/HTTPS to load ES modules (`type="module"`). Opening `index.html` directly via `file://` will show a helpful warning banner.

### 2. Add API Key
- **Free Gemini API Key:** [Google AI Studio](https://aistudio.google.com/apikey) (Default model: `gemini-2.5-flash`)
- **OpenRouter Keys:** [OpenRouter](https://openrouter.ai/keys) (Select any model from the dropdown)

Your API key is saved locally in `localStorage` and sent directly from your browser to the AI provider.

---

## 📁 Project Structure

```text
index.html        Three-page container (Upload, Process, Download) + Checklist Panel
css/custom.css    Gauge ring, flowchart animations, cl-flip keyframe, check grid
js/main.js        Entry point + page state machine + tripleEmit event fanout
js/loop.js        THE LOOP ENGINE — DO-VERIFY-DECIDE state loop (pure logic)
js/checklist.js   Persistent 9-check quality board component
js/timeline.js    Technical View renderer (cards, score deltas, "Why another lap?")
js/theater.js     Flowchart SVG Loop Theater component
js/results.js     Download page renderer (final checklist, PDF export, gaps)
js/resume.js      Plain text parsing → structure → pdfmake PDF export
js/prompts.js     The 9 check defs, verifyPrompt, doPrompt, polishPrompt, gapsPrompt
js/llm.js         LLM communication module with 429 retry + backoff
js/parser.js      Client-side PDF / DOCX / TXT text extractor
js/settings.js    Form validation, settings state, localStorage persistence
js/dom.js         Shared DOM helper utilities
```

---

## 🛡️ Honesty Guardrail Architecture

ResumeLoop enforces strict honesty guardrails:
- The **Verifier** compares every revision against the **original unedited resume**.
- If a keyword or metric cannot be backed by original candidate experience, the Worker flags it (`couldNotDo`).
- Missing requirements land in the **"Gaps we could not fix"** report on the Download page, rather than fabricating experience.

---

## 📜 License

MIT License — feel free to use, modify, and learn from this project.
