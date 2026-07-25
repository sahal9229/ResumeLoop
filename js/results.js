/* ═══════════════════════════════════════════════════════════════════════
   results.js — the Download page (Page 3).

   Renders the loop's result object: the typographic resume preview on
   the left, and the score / keywords / honest gaps / change log panel
   on the right. Pure view — no loop logic, no model calls.
   ═══════════════════════════════════════════════════════════════════════ */

import { $, el, esc, arr, show } from './dom.js?v=4';
import { chip, chips, setGauge } from './timeline.js?v=4';
import { parseResumeText } from './resume.js?v=4';
import { CHECK_DEFS } from './prompts.js?v=4';

export function renderResults(result) {
  renderScorePanel(result);
  renderChecklist(result);
  renderGaps(result.gaps);
  renderChangeLog(result.changeLog);
  renderPreview(result.finalResume);
}

/* ── score panel ────────────────────────────────────────────────────── */
function renderScorePanel(r) {
  setGauge($('gaugeF'), $('gScoreF'), r.atsScore);

  const gain = r.atsScore - r.baseline;
  $('beforeScore').textContent = r.baseline;
  $('afterScore').textContent = r.atsScore;
  $('gainBadge').textContent = (gain >= 0 ? '+' : '') + gain;

  $('journeyLine').textContent = r.scoreHistory.length > 1
    ? r.scoreHistory.map(h => h.score).join(' → ')
    : '';
  $('stopNote').textContent =
    `${r.stopReason} (${r.iterations} iteration${r.iterations === 1 ? '' : 's'})`
    + (r.iterations === 0
        ? ' — the loop never revised the resume. Raise the target score and re-run to see it improve.'
        : '');
}

/* ── final quality checklist ─────────────────────────────────────────────────────── */
function renderChecklist(r) {
  const finalChecks = arr(r.finalChecks);
  const box = $('dlMatched');
  box.className = 'space-y-1.5 mt-1';

  if (!finalChecks.length) {
    box.innerHTML = '<p class="text-xs text-ink-faint">No checklist data available.</p>';
    return;
  }

  const passCount = finalChecks.filter(c => c.pass).length;
  const total     = CHECK_DEFS.length;

  // Summary badge
  const summary = el('div', 'mb-2 flex items-center gap-2');
  summary.innerHTML = `
    <span class="rounded-full border px-2.5 py-0.5 font-mono text-[11px] font-bold
      ${passCount === total ? 'border-ok/40 bg-ok/15 text-emerald-300' : 'border-warn/40 bg-warn/10 text-amber-300'}">
      ${passCount}/${total} checks passed
    </span>
    <span class="text-[10px] text-ink-faint">${passCount === total ? '✅ All green!' : `${total - passCount} still open`}</span>`;
  box.append(summary);

  for (const def of CHECK_DEFS) {
    const c      = finalChecks.find(x => x.id === def.id) || { pass: false, evidence: '' };
    const row    = el('div', `rounded-lg border px-2.5 py-1.5 text-[11.5px]
      ${c.pass ? 'border-ok/20 bg-ok/5' : 'border-bad/20 bg-bad/5'}`);
    row.innerHTML = `
      <div class="flex items-start gap-1.5">
        <span class="flex-none font-bold ${c.pass ? 'text-emerald-400' : 'text-rose-400'}">${c.pass ? '✓' : '✗'}</span>
        <div>
          <span class="font-semibold ${c.pass ? 'text-emerald-200' : 'text-rose-200'}">${esc(def.name)}</span>
          ${!c.pass && c.evidence
            ? `<div class="mt-0.5 text-[10px] italic text-slate-400">${esc(c.evidence)}</div>`
            : ''}
        </div>
      </div>`;
    box.append(row);
  }
}

/* ── honest gaps ────────────────────────────────────────────────────── */
function renderGaps(gaps) {
  const box = $('dlGaps');
  const items = arr(gaps);

  if (!items.length) {
    box.innerHTML = '<p class="text-[13px] text-emerald-300">✅ Nothing material is missing — every must-have in the posting is genuinely evidenced in the resume.</p>';
    return;
  }

  box.innerHTML = items.map(g => `
    <div class="rounded-xl border border-bad/30 bg-bad/5 px-3.5 py-3">
      <div class="text-[13px] font-bold text-rose-300">
        ${g.mustHave ? '<span class="text-amber-300">★ MUST-HAVE</span> · ' : ''}${esc(g.requirement)}
      </div>
      <div class="mt-1 text-xs text-slate-300">${esc(g.why)}</div>
      <div class="mt-1.5 text-xs text-ink-muted">
        <b class="text-emerald-300">How to actually close it:</b> ${esc(g.howToActuallyCloseIt)}
      </div>
    </div>`).join('');
}

/* ── change log ──────────────────────────────────────────────────────────────── */
function renderChangeLog(log) {
  const items = arr(log);
  show($('clWrap'), items.length > 0);
  $('dlChangelog').innerHTML = items.map(c => `
    <li class="flex gap-2">
      <span class="mt-0.5 flex-none rounded-full border border-line bg-raised px-1.5 py-0.5 font-mono text-[10px] text-ink-faint">lap ${esc(String(c.pass))}</span>
      ${c.fixes ? `<span class="mt-0.5 flex-none rounded border border-info/30 bg-info/10 px-1 font-mono text-[9px] text-sky-300">${esc(c.fixes)}</span>` : ''}
      <span>${esc(c.text || c)}</span>
    </li>`).join('');
}

/* ── resume preview (built with textContent — nothing to escape) ───── */
function renderPreview(resumeText) {
  const box = $('resumePreview');
  box.innerHTML = '';
  const model = parseResumeText(resumeText);

  // model text goes in via textContent — nothing to escape, nothing to inject
  const add = (cls, text) => {
    const node = el('div', cls);
    node.textContent = text;
    box.append(node);
    return node;
  };

  if (model.name) add('text-xl font-bold text-ink', model.name);
  for (const line of model.contact) add('text-xs text-ink-muted', line);

  for (const section of model.sections) {
    add('mt-5 mb-2 border-b border-line pb-1 text-[11px] font-bold uppercase tracking-[0.15em] text-indigo-300',
        section.heading);

    let ul = null;
    for (const item of section.items) {
      if (item.type === 'bullet') {
        if (!ul) { ul = el('ul', 'list-disc space-y-1 pl-5 text-[13px] leading-relaxed text-slate-300'); box.append(ul); }
        const li = el('li'); li.textContent = item.text; ul.append(li);
      } else {
        ul = null;
        add('text-[13px] leading-relaxed text-slate-300 mt-1', item.text);
      }
    }
  }

  if (!model.sections.length && !model.name) {
    add('whitespace-pre-wrap font-mono text-[12.5px] leading-relaxed text-slate-300', resumeText);
  }
}
