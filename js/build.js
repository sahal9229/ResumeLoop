/* ═══════════════════════════════════════════════════════════════════════
   build.js — the two-stage pipeline.

     STAGE 1  ANALYZE   job description → structured requirements
     STAGE 2  WRITE     resume + requirements → tailored resume + ATS report

   Linear, two API calls. Everything below the calls is defensive
   normalisation: the UI must never depend on the model's output shape.

   Events (for the progress line on the input page):
     stage:start  {stage:'analyze'|'write', label}
     stage:done   {stage, data}
     note         {text}          ← retry banners from llm.js
   ═══════════════════════════════════════════════════════════════════════ */

import { arr, clamp } from './dom.js?v=6';
import { askJSON } from './llm.js?v=6';
import { analyzePrompt, buildPrompt } from './prompts.js?v=6';

/**
 * Run the tailoring pipeline.
 * @param {object} settings   from settings.readSettings()
 * @param {(ev:object)=>void} emit
 * @param {AbortSignal} signal
 * @returns {Promise<object>} the result object for the Result page
 */
export async function buildResume(settings, emit, signal) {
  const originalResume = settings.resumeText;

  const ask = (prompt, stage) => askJSON(settings, prompt, signal, {
    note: text => emit({ type: 'note', stage, text })
  });

  /* ── STAGE 1 — read the posting ─────────────────────────────────── */
  emit({ type: 'stage:start', stage: 'analyze', label: 'Reading the job description' });
  const analyzed = await ask(analyzePrompt(settings.jd), 'analyze');
  const requirements = normaliseRequirements(analyzed.json);
  emit({ type: 'stage:done', stage: 'analyze', data: requirements });

  /* ── STAGE 2 — write the resume ─────────────────────────────────── */
  emit({ type: 'stage:start', stage: 'write', label: 'Rewriting your resume for this role' });
  const built = await ask(buildPrompt(originalResume, requirements), 'write');
  const out = built.json || {};

  const tailoredResume = typeof out.tailoredResume === 'string' && out.tailoredResume.trim().length > 40
    ? cleanResumeText(out.tailoredResume)
    : originalResume;

  const breakdown = normaliseBreakdown(arr(out.scoreBreakdown));

  // Trust the arithmetic, not the model's self-reported total: when the two
  // disagree the breakdown is the one the user can actually see and check.
  const summed = breakdown.reduce((t, b) => t + b.points, 0);
  const atsScore = breakdown.length
    ? clamp(summed, 0, 100)
    : clamp(out.atsScore, 0, 100);

  const result = {
    originalResume,
    tailoredResume,
    requirements,
    atsScore,
    scoreBreakdown: breakdown,
    keywordCoverage: normaliseCoverage(arr(out.keywordCoverage), requirements),
    changes: arr(out.changes)
      .map(c => typeof c === 'string' ? { what: c, why: '' } : { what: c.what || '', why: c.why || '' })
      .filter(c => c.what),
    gaps: arr(out.gaps)
      .map(g => ({
        requirement:  g.requirement || '',
        mustHave:     !!g.mustHave,
        why:          g.why || '',
        howToCloseIt: g.howToCloseIt || g.howToActuallyCloseIt || ''
      }))
      .filter(g => g.requirement)
  };

  emit({ type: 'stage:done', stage: 'write', data: result });
  return result;
}

/* ── normalisers — the model is good but the UI must never depend on it ── */

function normaliseRequirements(r) {
  const strings = v => arr(v).map(x => typeof x === 'string' ? x : (x?.name || x?.keyword || String(x)))
    .map(s => s.trim()).filter(Boolean);
  return {
    role:             (r?.role || '').trim(),
    seniority:        (r?.seniority || '').trim(),
    yearsRequired:    (r?.yearsRequired || '').trim(),
    mustHaves:        strings(r?.mustHaves),
    niceToHaves:      strings(r?.niceToHaves),
    atsKeywords:      strings(r?.atsKeywords),
    responsibilities: strings(r?.responsibilities),
    softSignals:      strings(r?.softSignals)
  };
}

/** Keep the six known areas in a fixed order so the bars never jump around. */
const SCORE_AREAS = [
  { match: /must-have|must have/i, area: 'Must-have keywords', max: 30 },
  { match: /bullet/i,              area: 'Bullet quality',     max: 25 },
  { match: /summary/i,             area: 'Summary strength',   max: 12 },
  { match: /skill|relevance/i,     area: 'Skills & relevance', max: 13 },
  { match: /ats|format/i,          area: 'ATS formatting',     max: 12 },
  { match: /nice/i,                area: 'Nice-to-have keywords', max: 8 }
];

function normaliseBreakdown(raw) {
  if (!raw.length) return [];
  return SCORE_AREAS.map(def => {
    const found = raw.find(b => def.match.test(String(b?.area || '')));
    return {
      area:   def.area,
      max:    def.max,
      points: clamp(found?.points, 0, def.max),
      note:   String(found?.note || '').trim()
    };
  });
}

/**
 * Every must-have and every ATS keyword gets a row, whether or not the model
 * remembered to report it. A keyword the model silently dropped shows as
 * "not covered" rather than vanishing from the table.
 */
function normaliseCoverage(raw, req) {
  const rows = new Map();

  for (const item of raw) {
    const keyword = String(item?.keyword || '').trim();
    if (!keyword) continue;
    rows.set(keyword.toLowerCase(), {
      keyword,
      mustHave: !!item.mustHave,
      present:  !!item.present,
      where:    String(item.where || '').trim()
    });
  }

  const ensure = (keyword, mustHave) => {
    const key = keyword.toLowerCase();
    const existing = rows.get(key);
    if (existing) {
      if (mustHave) existing.mustHave = true;
      return;
    }
    rows.set(key, { keyword, mustHave, present: false, where: '' });
  };

  req.mustHaves.forEach(k => ensure(k, true));
  req.atsKeywords.forEach(k => ensure(k, false));

  // must-haves first, then covered before uncovered, then alphabetical
  return [...rows.values()].sort((a, b) =>
    (b.mustHave - a.mustHave) ||
    (b.present - a.present) ||
    a.keyword.localeCompare(b.keyword));
}

/**
 * Strip the characters that break ATS parsers, in case the model slips.
 * Smart quotes → straight, em/en dashes → hyphen, fancy bullets → "- ".
 */
function cleanResumeText(text) {
  return String(text)
    .replace(/\r\n?/g, '\n')
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/^[•●▪·*]\s+/gm, '- ')
    .replace(/[^\S\n]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
