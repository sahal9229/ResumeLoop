/* ═══════════════════════════════════════════════════════════════════════
   prompts.js — v4: Worker → Verifier → Decide architecture.

   Removed: scorePrompt, planPrompt (replaced by verifyPrompt + doPrompt)
   Added:   verifyPrompt — the independent checker (separate role, separate call)
            doPrompt    — the worker, driven by failed-check to-do list
   Kept:    polishPrompt, gapsPrompt, jdPrompt, resumePrompt, HONESTY, ATS_RULES
   ═══════════════════════════════════════════════════════════════════════ */

/* Appended to any stage that can touch resume content. */
export const HONESTY = `
NON-NEGOTIABLE HONESTY RULES:
- NEVER invent employers, job titles, dates, degrees, certifications, tools, or experience the candidate does not already have.
- You may only rephrase, reprioritise, quantify and surface content that is truthfully already in the resume.
- Only weave in a keyword if the candidate's existing experience genuinely supports it. If it does not, leave it missing and report it as a gap.
- Never invent numbers or metrics. If a bullet needs a metric the resume does not contain, rewrite it to be concrete and specific WITHOUT a fabricated figure.
- Keep the candidate's real voice. No buzzword inflation.
Reply with ONE valid JSON object and nothing else.`;

export const ATS_RULES = `
ATS FORMATTING RULES for any resume text you produce:
- Plain text only. No tables, columns, graphics, images, text boxes or emoji.
- Standard uppercase section headings: SUMMARY, SKILLS, EXPERIENCE, PROJECTS, EDUCATION, CERTIFICATIONS.
- Bullets start with "- ". No fancy glyphs, no smart quotes, no em dashes — plain ASCII only.
- Keep dates in "Mon YYYY - Mon YYYY" form. Keep contact details on their own lines at the top.`;

const PROFESSIONAL_WRITING_RULES = `
PROFESSIONAL RESUME WRITING RULES — HARD REQUIREMENTS:

RULE 1 — STRONG ACTION VERBS ONLY. Every bullet opens with a powerful, specific verb.
  Good: Led, Architected, Reduced, Automated, Shipped, Optimized, Owned, Drove, Cut, Scaled,
        Engineered, Rebuilt, Launched, Accelerated, Consolidated, Designed, Implemented, Overhauled.
  NEVER: "Responsible for", "Worked on", "Helped with", "Assisted", "Involved in", passive voice.

RULE 2 — VERB VARIETY. No two bullets in the same section start with the same verb.

RULE 3 — IMPACT STRUCTURE. Every bullet:
  [Strong Verb] + [what/scope] + [using specific method or technology] + [measurable or concrete result]
  Example: "Rebuilt the checkout flow in React and TypeScript, cutting page load time by 40%."

RULE 4 — HONEST QUANTIFICATION. Use numbers already in the resume. NEVER invent figures.
  If no real number exists, express concrete scope: "owned the full checkout module" not "increased revenue 23%".

RULE 5 — NO KEYWORD STUFFING. Keywords woven into truthful sentences only. Never appended as a list.

RULE 6 — HUMAN PHRASING. Ban: "responsible for", "worked on", "helped with", "various", "different",
  "multiple tasks", "etc.", filler phrases, passive voice. One line per bullet.

RULE 7 — CONSISTENT TENSE. Past roles = past tense. Current role = present tense. Never mix within a role.

RULE 8 — TRIM RUTHLESSLY. Cut anything irrelevant to this specific JD.

RULE 9 — PROFESSIONAL SUMMARY. 2-3 lines, names target role + candidate's strongest matching qualifications.
  NOT: "Motivated developer looking for…" NOT: generic, longer than 3 lines.`;

/* ═══════════════════════════════════════════════════════════════════════
   THE 9 FIXED CHECKS — immutable IDs, consistent across all iterations.
   Score is computed from these weights; the LLM verifier never sets the score.
   ═══════════════════════════════════════════════════════════════════════ */
export const CHECK_DEFS = [
  { id: 'KW-MUSTHAVE',   name: 'All must-have JD keywords present (truthfully)',   weight: 25, icon: '🔑' },
  { id: 'KW-NICE',       name: 'Nice-to-have keywords woven in where truthful',    weight: 10, icon: '✨' },
  { id: 'BULLET-IMPACT', name: 'Every bullet: action verb + method + result',      weight: 20, icon: '💪' },
  { id: 'NO-FILLER',     name: 'No filler phrases or passive voice',               weight: 10, icon: '✂️'  },
  { id: 'SUMMARY',       name: 'Professional summary targets this exact role',     weight: 10, icon: '🎯' },
  { id: 'TENSE',         name: 'Consistent tense per role (past/present)',         weight:  5, icon: '⏱'  },
  { id: 'RELEVANCE',     name: 'All content relevant to this specific JD',         weight:  8, icon: '🎪' },
  { id: 'HONESTY',       name: 'Nothing fabricated vs. original resume',           weight:  7, icon: '🛡'  },
  { id: 'ATS-FORMAT',    name: 'ATS-safe structure and headings',                  weight:  5, icon: '📋' },
];

/**
 * Compute a deterministic score from check pass/fail results.
 * Score is always explainable: each check's contribution is (weight * pass ? 1 : 0).
 */
export function checksToScore(checks) {
  let total = 0, passing = 0;
  for (const def of CHECK_DEFS) {
    const c = checks.find(x => x.id === def.id);
    total += def.weight;
    if (c?.pass) passing += def.weight;
  }
  return total > 0 ? Math.round((passing / total) * 100) : 0;
}

/* ── INITIALIZE ─────────────────────────────────────────────────────── */

/** JD extractor → { role, hardSkills, softSkills, keywords, yearsRequired, mustHaves, niceToHaves } */
export const jdPrompt = jd => ({
  sys: `You are a technical recruiter and ATS analyst. Extract the hiring signal from a job description.
Return JSON exactly shaped:
{"role":"string","hardSkills":["..."],"softSkills":["..."],"keywords":["..."],"yearsRequired":"string","mustHaves":["..."],"niceToHaves":["..."]}
"keywords" = the literal words/phrases an ATS would scan for (12-25 of them, as written in the posting).
Reply with ONE valid JSON object and nothing else.`,
  user: `JOB DESCRIPTION:\n"""\n${jd}\n"""`
});

/** Resume parser → { sections, bullets, skills, experience } */
export const resumePrompt = resume => ({
  sys: `You parse resumes into structure.
Return JSON exactly shaped:
{"sections":["..."],"bullets":["..."],"skills":["..."],"experience":[{"title":"","company":"","dates":"","bullets":["..."]}]}
Copy content faithfully. Invent nothing.
Reply with ONE valid JSON object and nothing else.`,
  user: `RESUME:\n"""\n${resume}\n"""`
});

/* ── VERIFY (the independent checker — a SEPARATE role, never sees worker reasoning) ── */

/**
 * Verifier → { checks: [{id,name,pass,evidence}], summaryVerdict }
 *
 * CRITICAL DESIGN: This is NOT the worker. It has a completely different role.
 * It judges only what it sees in the current resume against the fixed 9 checks.
 * It NEVER sees the worker's reasoning, excuses, or change log.
 * The HONESTY check compares against the ORIGINAL resume — this is a real guardrail.
 */
export const verifyPrompt = (resume, originalResume, req) => ({
  sys: `You are a strict, skeptical resume reviewer. Your job is to evaluate a resume against a fixed checklist.
You have NOT seen any previous revision reasoning — you judge only what you see in front of you.

You must evaluate EXACTLY these 9 checks and return ALL 9, always:

CHECK ID        | What it means
----------------|--------------------------------------------------------------
KW-MUSTHAVE     | Every must-have keyword from the job requirements appears in the resume, woven into real sentences (not as a bare list). Requires ALL must-haves present.
KW-NICE         | At least 3 nice-to-have keywords appear where the candidate's experience truthfully supports them.
BULLET-IMPACT   | Every experience/project bullet follows: strong action verb + what was done + tool/method used + concrete outcome or scope. No exceptions.
NO-FILLER       | Zero instances of: "responsible for", "worked on", "helped with", "assisted", "involved in", passive voice, or vague filler like "various", "different", "multiple tasks".
SUMMARY         | The SUMMARY section (2-3 lines) explicitly names the target role, names the candidate's strongest relevant qualifications, and mentions 2+ of the JD's core technologies where truthfully applicable. No generic "motivated developer" language.
TENSE           | Past roles use past tense CONSISTENTLY throughout. The current role uses present tense CONSISTENTLY. No mixing.
RELEVANCE       | Every bullet and section serves this specific job. Nothing off-topic for this role is present.
HONESTY         | COMPARE LINE BY LINE against the ORIGINAL resume. FAIL if anything was ADDED that was NOT in the original: any employer, title, certification, tool, metric, skill, or achievement not supported by the original text.
ATS-FORMAT      | Plain text only. Standard uppercase headings. Bullets start with "- ". No tables, columns, graphics, smart quotes, em dashes, or emoji in the resume body.

RULES FOR EVIDENCE:
- Every FAILING check MUST include concrete evidence: quote or point at the specific offending text, or name the specific missing keyword.
- No vague failures like "needs improvement" or "could be better". Name the exact problem.
- Passing checks may have brief confirmation evidence ("all 8 must-haves found: React, Node.js, ...").
- The HONESTY check is binary: if you find even ONE fabricated element not in the original, it FAILS.

Return EXACTLY this JSON shape (all 9 checks, always in this order):
{
  "checks": [
    {"id": "KW-MUSTHAVE",   "name": "All must-have JD keywords present (truthfully)", "pass": true|false, "evidence": "..."},
    {"id": "KW-NICE",       "name": "Nice-to-have keywords woven in where truthful",  "pass": true|false, "evidence": "..."},
    {"id": "BULLET-IMPACT", "name": "Every bullet: action verb + method + result",    "pass": true|false, "evidence": "..."},
    {"id": "NO-FILLER",     "name": "No filler phrases or passive voice",             "pass": true|false, "evidence": "..."},
    {"id": "SUMMARY",       "name": "Professional summary targets this exact role",   "pass": true|false, "evidence": "..."},
    {"id": "TENSE",         "name": "Consistent tense per role (past/present)",       "pass": true|false, "evidence": "..."},
    {"id": "RELEVANCE",     "name": "All content relevant to this specific JD",       "pass": true|false, "evidence": "..."},
    {"id": "HONESTY",       "name": "Nothing fabricated vs. original resume",         "pass": true|false, "evidence": "..."},
    {"id": "ATS-FORMAT",    "name": "ATS-safe structure and headings",                "pass": true|false, "evidence": "..."}
  ],
  "summaryVerdict": "X of 9 checks failing: [list failing IDs]"
}
Reply with ONE valid JSON object and nothing else.`,
  user: `JOB REQUIREMENTS:\n${JSON.stringify(req, null, 1)}

ORIGINAL RESUME (use for HONESTY check — compare against this):
"""
${originalResume}
"""

CURRENT RESUME TO EVALUATE:
"""
${resume}
"""`
});

/* ── DO (the worker — driven by failed-check to-do list) ─────────────── */

/**
 * Worker → { revisedResume, changesMade: [{fixes, change}], couldNotDo }
 *
 * The worker receives the EXACT checks that failed verification as its to-do list
 * (all of them, prioritized by the engine) and must fix every one this pass.
 * Each change references which check it addresses.
 */
export const doPrompt = (failedChecks, resume, req, originalResume) => ({
  sys: `You are the revision step of an iterative resume-tailoring agent.
You have a specific to-do list: the EXACT checks that failed independent verification.
Fix EVERY check on the list in this single revision — do not leave any for a later pass.
Be thorough: if a bullet fails a rule, rewrite that bullet completely. Do not change
parts of the resume that are already passing.

${PROFESSIONAL_WRITING_RULES}

FOR EACH CHANGE YOU MAKE, you must reference WHICH check it fixes, using its exact ID.
The HONESTY check failing means something was fabricated — your job is to REVERT it to the original, not to add more content.

Return JSON exactly shaped:
{"revisedResume":"the complete revised resume as plain text",
 "changesMade":[{"fixes":"CHECK-ID","change":"short description of what you changed and why"}],
 "couldNotDo":["honest explanation if a check was impossible to fix without fabricating"]}
${ATS_RULES}
${HONESTY}`,
  user: `JOB REQUIREMENTS:\n${JSON.stringify(req, null, 1)}

ORIGINAL RESUME (reference for HONESTY — do not add anything not here):
"""
${originalResume}
"""

CHECKS THAT FAILED — YOUR TO-DO LIST (fix all of these, prioritized):
${failedChecks.map((c, i) => `${i + 1}. [${c.id}] ${c.name}\n   Evidence of failure: "${c.evidence}"`).join('\n\n')}

CURRENT RESUME TO REVISE:
"""
${resume}
"""`
});

/* ── POLISH (runs once after the scoring loop — line-edits only) ─────── */

export const polishPrompt = (resume, role) => ({
  sys: `You are a professional resume copy-editor doing a final proofreading pass.
Your ONLY job is line-editing for quality and consistency. You must NOT:
- Add new keywords or skills
- Change any fact, date, number, employer, tool, or metric
- Add experience the candidate does not have
- Change the meaning of any bullet

Your job IS to:
- Fix any grammar or spelling errors
- Ensure consistent tense (past roles = past tense; current role = present tense, throughout)
- Ensure bullet parallelism — every bullet in a section should use the same grammatical structure
- Trim any bullets that run longer than two lines
- Ensure no two bullets in the same section start with the same verb — vary if duplicates found
- Fix any formatting inconsistencies (spacing, capitalization, date formats)
- Remove any remaining filler phrases: "responsible for", "worked on", "helped with", "various", "different"
- Ensure the SUMMARY is exactly 2-3 lines, role-focused, not generic

Return JSON exactly shaped:
{"polishedResume":"the complete proofread resume as plain text","editsMade":["short description of each edit made"]}
If nothing needed editing, return an empty editsMade array and the resume unchanged.
Reply with ONE valid JSON object and nothing else.`,
  user: `TARGET ROLE: ${role || 'not specified'}

RESUME TO PROOFREAD:
"""
${resume}"""`
});

/* ── GAP REPORT (honest, post-loop) ─────────────────────────────────── */

export const gapsPrompt = (resume, req, finalVerify, stillFailingChecks) => ({
  sys: `You produce the honest "gaps we could not fix" report for a resume-tailoring agent.
List every requirement the job asks for that the candidate's resume genuinely does not evidence.
For each, say plainly why it could not be fixed and what the candidate could do in real life to close it.
Return JSON exactly shaped:
{"unfixableGaps":[{"requirement":"","mustHave":true,"why":"","howToActuallyCloseIt":""}]}
If nothing is genuinely missing, return an empty array.
Reply with ONE valid JSON object and nothing else.`,
  user: `JOB REQUIREMENTS:\n${JSON.stringify(req, null, 1)}

FINAL VERIFICATION RESULT:
${JSON.stringify(finalVerify, null, 1)}

CHECKS STILL FAILING AFTER ALL ITERATIONS:
${stillFailingChecks.length ? stillFailingChecks.map(c => `- [${c.id}] ${c.name}: ${c.evidence}`).join('\n') : '(none — all checks passed)'}

FINAL RESUME:
"""
${resume}"""`
});
