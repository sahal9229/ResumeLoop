/* ═══════════════════════════════════════════════════════════════════════
   results.js — the Result page. Pure view: no model calls, no logic.

     · the ATS score and its six-part breakdown
     · keyword coverage, must-haves first
     · the tailored resume, editable, next to the original
     · what changed, and what is honestly still missing
   ═══════════════════════════════════════════════════════════════════════ */

import { $, el, esc, arr, show } from './dom.js?v=6';

export function renderResults(result) {
  renderScore(result);
  renderBreakdown(result.scoreBreakdown);
  renderKeywords(result.keywordCoverage);
  renderResume(result);
  renderChanges(result.changes);
  renderGaps(result.gaps);
}

/* ── headline score ─────────────────────────────────────────────────── */
function renderScore(r) {
  $('finalScore').textContent = String(r.atsScore);

  const covered = r.keywordCoverage.filter(k => k.mustHave);
  const hit = covered.filter(k => k.present).length;
  $('scoreCaption').textContent = covered.length
    ? `${hit} of ${covered.length} must-have requirement${covered.length === 1 ? '' : 's'} covered`
    : 'Tailored against the posting';

  $('roleLine').textContent = r.requirements.role
    ? `TAILORED FOR — ${r.requirements.role.toUpperCase()}`
    : 'TAILORED RESUME';
}

/* ── score breakdown bars ───────────────────────────────────────────── */
function renderBreakdown(breakdown) {
  const box = $('breakdown');
  const items = arr(breakdown);
  show($('breakdownWrap'), items.length > 0);
  if (!items.length) return;

  box.innerHTML = items.map(b => {
    const pct = b.max ? Math.round((b.points / b.max) * 100) : 0;
    return `
      <div class="bd-row">
        <div class="bd-head">
          <span class="bd-area">${esc(b.area)}</span>
          <span class="bd-num">${b.points}<span class="bd-max">/${b.max}</span></span>
        </div>
        <div class="bd-track"><span class="bd-fill" style="width:${pct}%"></span></div>
        ${b.note ? `<div class="bd-note">${esc(b.note)}</div>` : ''}
      </div>`;
  }).join('');
}

/* ── keyword coverage ───────────────────────────────────────────────── */
function renderKeywords(coverage) {
  const box = $('keywords');
  const items = arr(coverage);
  show($('keywordsWrap'), items.length > 0);
  if (!items.length) return;

  box.innerHTML = items.map(k => `
    <span class="kw ${k.present ? 'kw-in' : 'kw-out'}${k.mustHave ? ' kw-must' : ''}"
          title="${esc(k.where || (k.present ? 'Present in the tailored resume' : 'Not evidenced in your resume'))}">
      ${k.mustHave ? '<span class="kw-star" aria-hidden="true">*</span>' : ''}${esc(k.keyword)}
    </span>`).join('');

  const missingMust = items.filter(k => k.mustHave && !k.present).length;
  $('kwLegend').textContent = missingMust
    ? `* = must-have · filled = in your resume · ${missingMust} must-have${missingMust === 1 ? '' : 's'} could not be included truthfully — see gaps below`
    : '* = must-have · filled = in your resume · every must-have is covered';
}

/* ── the resume itself, editable ─────────────────────────────────────── */
function renderResume(r) {
  $('resumeOut').value = r.tailoredResume;
  autosize($('resumeOut'));

  const before = $('beforePane');
  before.innerHTML = '';
  for (const line of String(r.originalResume || '').split('\n')) {
    const node = el('span', 'line');
    node.textContent = line || ' ';
    before.append(node);
  }
}

/* The editable output grows with its content — no inner scrollbar to fight. */
export function autosize(node) {
  node.style.height = 'auto';
  node.style.height = Math.max(480, node.scrollHeight + 4) + 'px';
}

/* ── what changed ───────────────────────────────────────────────────── */
function renderChanges(changes) {
  const items = arr(changes);
  show($('changesWrap'), items.length > 0);
  if (!items.length) return;

  $('changes').innerHTML = items.map(c => `
    <li>
      <span class="ch-what">${esc(c.what)}</span>
      ${c.why ? `<span class="ch-why">${esc(c.why)}</span>` : ''}
    </li>`).join('');
}

/* ── honest gaps ────────────────────────────────────────────────────── */
function renderGaps(gaps) {
  const items = arr(gaps);
  const box = $('gaps');

  if (!items.length) {
    box.innerHTML = '<p class="cap">Nothing material is missing — every requirement in the posting is genuinely evidenced in your resume.</p>';
    return;
  }

  box.innerHTML = items.map(g => `
    <div class="gap-item">
      <div class="gap-req">${g.mustHave ? '<span class="gap-tag">MUST-HAVE</span>' : ''}${esc(g.requirement)}</div>
      <div class="gap-why">${esc(g.why)}</div>
      ${g.howToCloseIt ? `<div class="gap-close"><b>To close it:</b> ${esc(g.howToCloseIt)}</div>` : ''}
    </div>`).join('');
}
