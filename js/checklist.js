/* ═══════════════════════════════════════════════════════════════════════
   checklist.js — the persistent 9-check quality panel.

   The single best teaching visual in the app: a wall of [✗] flips to [✓]
   lap by lap. Each flip is triggered by a real verify:done event — never
   a timer, never synthetic. TERMINAL RE-SKIN: markup/classes only; the
   event subscription is unchanged.
   ═══════════════════════════════════════════════════════════════════════ */

import { $, el } from './dom.js?v=4';
import { CHECK_DEFS } from './prompts.js?v=4';

const STATE = { pending: 'pending', pass: 'pass', fail: 'fail' };

export function createChecklistView() {
  const panel  = $('checklistPanel');
  let rowEls   = {};   // id → { root, iconEl, evidenceEl }
  let checkState = {}; // id → 'pending'|'pass'|'fail'
  let scoreEl  = null;
  let verdictEl = null;
  let iteration = 0;

  /* ── build the panel DOM (called once on reset) ───────────────── */
  function buildDOM() {
    panel.innerHTML = '';
    rowEls     = {};
    checkState = {};
    iteration  = 0;

    // Header
    const header = el('div', 'flex items-center justify-between px-4 pt-3 pb-2 border-b border-line');
    header.innerHTML = `
      <div class="t-small font-extrabold t-caps t-faint">quality checks · 9</div>
      <div id="clScoreWrap" class="flex items-baseline gap-1">
        <span id="clScore" class="t-small font-extrabold t-dim">—</span>
        <span class="t-small t-faint">/100</span>
      </div>`;
    panel.append(header);
    scoreEl = header.querySelector('#clScore');

    // Check rows
    const list = el('div', 'px-2 py-1.5');
    for (const def of CHECK_DEFS) {
      const row = el('div', `cl-row cl-row-${def.id} cl-pending flex items-start gap-2.5 px-2 py-1`);
      row.setAttribute('data-id', def.id);
      row.setAttribute('title', def.name);

      const iconWrap = el('span', 'cl-icon-wrap flex-none t-small');
      iconWrap.textContent = '[ ]';

      const textWrap = el('div', 'min-w-0 flex-1');
      const nameEl   = el('div', 'cl-check-name t-small font-semibold leading-tight');
      nameEl.textContent = `${def.id}  ${def.name}`;
      const evidEl   = el('div', 'cl-evidence t-small hidden');

      textWrap.append(nameEl, evidEl);
      row.append(iconWrap, textWrap);
      list.append(row);

      rowEls[def.id] = { root: row, iconEl: iconWrap, evidenceEl: evidEl };
      checkState[def.id] = STATE.pending;
    }
    panel.append(list);

    // Verdict line
    verdictEl = el('div', 'cl-verdict px-4 pb-3 t-small t-faint border-t border-line pt-2');
    verdictEl.textContent = 'awaiting first verification…';
    panel.append(verdictEl);
  }

  /* ── update all checks from a verify:done event ──────────────── */
  function applyVerdict(checks, score, verdict, n) {
    iteration = n;

    // Update score display
    if (scoreEl) {
      scoreEl.textContent = score;
      scoreEl.className = 't-small font-extrabold ' + (score >= 80 ? '' : 't-acc');
      if (score >= 80) scoreEl.style.color = '#E8E8E3';
      else scoreEl.style.color = '';
    }

    // Flip each check row that changed state
    for (const check of checks) {
      const r = rowEls[check.id];
      if (!r) continue;

      const newState = check.pass ? STATE.pass : STATE.fail;
      const oldState = checkState[check.id];
      const changed = oldState !== newState || oldState === STATE.pending;

      if (changed) {
        r.root.classList.add('cl-flipping');
        r.root.addEventListener('animationend', () => r.root.classList.remove('cl-flipping'), { once: true });
      }

      r.root.classList.remove('cl-pending', 'cl-pass', 'cl-fail');
      r.root.classList.add('cl-' + newState);

      r.iconEl.textContent = check.pass ? '[✓]' : '[✗]';

      // Evidence (show for failures, hide for passes)
      if (check.evidence && !check.pass) {
        r.evidenceEl.textContent = '└ ' + check.evidence;
        r.evidenceEl.classList.remove('hidden');
      } else {
        r.evidenceEl.classList.add('hidden');
      }

      checkState[check.id] = newState;
    }

    // Verdict
    if (verdictEl) {
      const nFail = checks.filter(c => !c.pass).length;
      verdictEl.textContent = n === 0
        ? `baseline: ${nFail}/9 checks failing.`
        : nFail === 0
          ? 'all 9 checks pass.'
          : `after lap ${n}: ${nFail}/9 check${nFail !== 1 ? 's' : ''} open. ${verdict}`;
    }
  }

  /* ── public surface ───────────────────────────────────────────── */
  return {
    reset() {
      buildDOM();
    },
    finish() {},

    handle(ev) {
      if (ev.type === 'verify:done') {
        applyVerdict(ev.data?.checks || [], ev.score, ev.data?.summaryVerdict || '', ev.n);
      }
    }
  };
}
