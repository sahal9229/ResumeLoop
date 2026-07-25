/* ═══════════════════════════════════════════════════════════════════════
   results.js — the Download page (Page 3). TERMINAL RE-SKIN:
   markup/classes only. Pure view — no loop logic, no model calls.
   ═══════════════════════════════════════════════════════════════════════ */

import { $, el, esc, arr, show } from './dom.js?v=4';
import { setGauge } from './timeline.js?v=5';
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
    `${r.stopReason} (${r.iterations} lap${r.iterations === 1 ? '' : 's'})`
    + (r.iterations === 0
        ? ' — the loop never revised the resume. raise the target and re-run.'
        : '');
}

/* ── final quality checklist ────────────────────────────────────────── */
function renderChecklist(r) {
  const finalChecks = arr(r.finalChecks);
  const box = $('dlMatched');
  box.className = 'space-y-0 mt-1';

  if (!finalChecks.length) {
    box.innerHTML = '<p class="t-small t-faint">no checklist data.</p>';
    return;
  }

  const passCount = finalChecks.filter(c => c.pass).length;
  const total     = CHECK_DEFS.length;

  // Summary line
  const summary = el('div', 'mb-2 flex items-center gap-2');
  summary.innerHTML = `
    <span class="t-tag ${passCount === total ? 't-tag-ok' : 't-tag-open'}">${passCount}/${total} PASS</span>
    <span class="t-small t-faint">${passCount === total ? 'all green' : `${total - passCount} open`}</span>`;
  box.append(summary);

  const grid = el('div', 'check-grid');
  for (const def of CHECK_DEFS) {
    const c = finalChecks.find(x => x.id === def.id) || { pass: false, evidence: '' };
    const row = el('div', `check-row-tl ${c.pass ? 'check-pass-tl' : 'check-fail-tl'}`);
    row.innerHTML = `
      <span class="check-icon-tl">[${c.pass ? '✓' : '✗'}]</span>
      <span class="check-name-tl">${esc(def.name)}</span>
      ${!c.pass && c.evidence ? `<span class="check-evid-tl">└ ${esc(c.evidence)}</span>` : ''}`;
    grid.append(row);
  }
  box.append(grid);
}

/* ── honest gaps ────────────────────────────────────────────────────── */
function renderGaps(gaps) {
  const box = $('dlGaps');
  const items = arr(gaps);

  if (!items.length) {
    box.innerHTML = '<p class="t-small">[✓] nothing material is missing — every must-have in the posting is genuinely evidenced in the resume.</p>';
    return;
  }

  box.innerHTML = items.map(g => `
    <div class="t-well px-3.5 py-3" style="border-left:2px solid #FFB000">
      <div class="t-small font-extrabold">
        ${g.mustHave ? '<span class="t-tag t-tag-open mr-1">MUST-HAVE</span>' : ''}${esc(g.requirement)}
      </div>
      <div class="mt-1 t-small t-dim">${esc(g.why)}</div>
      <div class="mt-1.5 t-small t-faint">
        <b class="t-dim">to close it:</b> ${esc(g.howToActuallyCloseIt)}
      </div>
    </div>`).join('');
}

/* ── change log ─────────────────────────────────────────────────────── */
function renderChangeLog(log) {
  const items = arr(log);
  show($('clWrap'), items.length > 0);
  $('dlChangelog').innerHTML = items.map(c => `
    <li class="flex gap-2 items-baseline">
      <span class="flex-none t-tag">LAP ${esc(String(c.pass).padStart(2, '0'))}</span>
      <span class="t-dim">${esc(c.text || c)}</span>
    </li>`).join('');
}

/* ── resume preview (built with textContent — nothing to escape) ───── */
function renderPreview(resumeText) {
  const box = $('resumePreview');
  box.innerHTML = '';
  const model = parseResumeText(resumeText);

  const add = (cls, text) => {
    const node = el('div', cls);
    node.textContent = text;
    box.append(node);
    return node;
  };

  if (model.name) add('t-preview-name', model.name);
  for (const line of model.contact) add('t-small t-dim', line);

  for (const section of model.sections) {
    add('t-preview-head', section.heading);

    let ul = null;
    for (const item of section.items) {
      if (item.type === 'bullet') {
        if (!ul) { ul = el('ul', 'space-y-1 pl-0 t-small leading-relaxed'); box.append(ul); }
        const li = el('li', 'flex gap-2');
        const marker = el('span', 't-faint flex-none'); marker.textContent = '·';
        const txt = el('span', 't-dim'); txt.textContent = item.text;
        li.append(marker, txt); ul.append(li);
      } else {
        ul = null;
        add('t-small t-dim mt-1 leading-relaxed', item.text);
      }
    }
  }

  if (!model.sections.length && !model.name) {
    add('whitespace-pre-wrap t-small t-dim leading-relaxed', resumeText);
  }
}
