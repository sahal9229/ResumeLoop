/* ═══════════════════════════════════════════════════════════════════════
   results.js — the Result page (Page 3). BAUHAUS RE-SKIN.
   Pure view — no loop logic, no model calls.

   Before/after: two flat panels, hard rule between them.
   Lines new in the tailored resume get a solid yellow highlight;
   lines removed from the original are struck through.
   ═══════════════════════════════════════════════════════════════════════ */

import { $, el, esc, arr, show } from './dom.js?v=4';
import { buildCheckGrid } from './checklist.js?v=8';
import { CHECK_DEFS } from './prompts.js?v=5';

export function renderResults(result) {
  renderScore(result);
  renderCompare(result.originalResume, result.finalResume);
  renderChecklist(result);
  renderGaps(result.gaps);
  renderChangeLog(result.changeLog);
}

/* ── score ──────────────────────────────────────────────────────────── */
function renderScore(r) {
  $('finalScore').textContent = String(r.atsScore);
  const gain = r.atsScore - r.baseline;
  $('finalDelta').textContent = `${gain >= 0 ? '+' : ''}${gain}`;

  $('journeyLine').textContent = r.scoreHistory.length > 1
    ? r.scoreHistory.map(h => h.score).join(' → ')
    : `${r.baseline} → ${r.atsScore}`;

  $('stopNote').textContent =
    `${r.stopReason} (${r.iterations} lap${r.iterations === 1 ? '' : 's'})`
    + (r.iterations === 0
        ? ' — the loop never revised the resume. Raise max laps and re-run.'
        : '');
}

/* ── before / after panels ──────────────────────────────────────────── */
function renderCompare(originalText, finalText) {
  const before = $('beforePane');
  const after  = $('afterPane');
  before.innerHTML = '';
  after.innerHTML  = '';

  const beforeLines = String(originalText || '').replace(/\r\n?/g, '\n').split('\n');
  const afterLines  = String(finalText   || '').replace(/\r\n?/g, '\n').split('\n');

  const norm = s => s.trim().replace(/\s+/g, ' ');
  const beforeSet = new Set(beforeLines.map(norm).filter(Boolean));
  const afterSet  = new Set(afterLines.map(norm).filter(Boolean));

  for (const line of beforeLines) {
    const removed = line.trim() && !afterSet.has(norm(line));
    const node = el('span', 'line' + (removed ? ' line-del' : ''));
    node.textContent = line || ' ';
    before.append(node);
  }
  for (const line of afterLines) {
    const added = line.trim() && !beforeSet.has(norm(line));
    const node = el('span', 'line' + (added ? ' line-add' : ''));
    node.textContent = line || ' ';
    after.append(node);
  }
}

/* ── final 3×3 grid ─────────────────────────────────────────────────── */
function renderChecklist(r) {
  const box = $('dlChecklist');
  box.innerHTML = '';

  const finalChecks = arr(r.finalChecks);
  if (!finalChecks.length) {
    box.append(el('p', 'cap', 'No checklist data.'));
    return;
  }

  const passCount = finalChecks.filter(c => c.pass).length;
  const count = el('div', 'cl-count');
  count.textContent = passCount === CHECK_DEFS.length
    ? 'ALL 9 PASS'
    : `${passCount} OF ${CHECK_DEFS.length} PASS — ${CHECK_DEFS.length - passCount} OPEN`;
  count.style.marginBottom = 'var(--s2)';
  box.append(count);

  const grid = buildCheckGrid();
  grid.update(finalChecks);
  box.append(grid.root);
}

/* ── honest gaps ────────────────────────────────────────────────────── */
function renderGaps(gaps) {
  const box = $('dlGaps');
  const items = arr(gaps);

  if (!items.length) {
    box.innerHTML = '<p class="cap">Nothing material is missing — every must-have in the posting is genuinely evidenced in the resume.</p>';
    return;
  }

  box.innerHTML = items.map(g => `
    <div class="gap-item">
      <div class="gap-req">${g.mustHave ? '<span class="gap-tag">MUST-HAVE</span>' : ''}${esc(g.requirement)}</div>
      <div class="gap-why">${esc(g.why)}</div>
      <div class="gap-close"><b>To close it:</b> ${esc(g.howToActuallyCloseIt)}</div>
    </div>`).join('');
}

/* ── change log ─────────────────────────────────────────────────────── */
function renderChangeLog(log) {
  const items = arr(log);
  show($('clWrap'), items.length > 0);
  $('dlChangelog').innerHTML = items.map(c => `
    <li><span class="lap-tag">LAP ${esc(String(c.pass).padStart(2, '0'))}</span> · ${esc(c.text || c)}</li>`).join('');
}
