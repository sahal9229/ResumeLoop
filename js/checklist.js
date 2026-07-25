/* ═══════════════════════════════════════════════════════════════════════
   checklist.js — the persistent 9-check quality panel.

   This is the single best teaching visual in the app: students watch a
   wall of red ✗ flip to green ✓ lap by lap. Each flip is triggered by
   a real verify:done event — never a timer, never synthetic.

   This view is always visible regardless of which tab (Technical View or
   Loop Theater) is active. It renders inside #checklistPanel in index.html.
   ═══════════════════════════════════════════════════════════════════════ */

import { $, el, esc } from './dom.js?v=4';
import { CHECK_DEFS, checksToScore } from './prompts.js?v=4';

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
    const header = el('div', 'flex items-center justify-between px-4 pt-3 pb-2');
    header.innerHTML = `
      <div class="text-[10px] font-bold uppercase tracking-[0.15em] text-ink-faint">Quality Checklist</div>
      <div id="clScoreWrap" class="flex items-center gap-2">
        <span id="clScore" class="font-mono text-xs font-bold text-ink-muted">–</span>
        <span class="text-[9px] text-ink-faint">/ 100</span>
      </div>`;
    panel.append(header);
    scoreEl = header.querySelector('#clScore');

    // Check rows
    const list = el('div', 'space-y-1 px-3 pb-2');
    for (const def of CHECK_DEFS) {
      const row = el('div', `cl-row cl-row-${def.id} cl-pending flex items-start gap-2.5 rounded-lg px-2 py-1.5 transition-all`);
      row.setAttribute('data-id', def.id);
      row.setAttribute('title', def.name);

      const iconWrap = el('span', 'cl-icon-wrap flex-none pt-px');
      iconWrap.textContent = '◌';

      const textWrap = el('div', 'min-w-0 flex-1');
      const nameEl   = el('div', 'cl-check-name text-[11px] font-semibold leading-tight');
      nameEl.textContent = def.name;
      const evidEl   = el('div', 'cl-evidence text-[10px] leading-snug hidden');

      textWrap.append(nameEl, evidEl);
      row.append(iconWrap, textWrap);
      list.append(row);

      rowEls[def.id] = { root: row, iconEl: iconWrap, evidenceEl: evidEl };
      checkState[def.id] = STATE.pending;
    }
    panel.append(list);

    // Verdict line
    verdictEl = el('div', 'cl-verdict px-4 pb-3 text-[10px] text-ink-faint italic');
    verdictEl.textContent = 'Waiting for first check…';
    panel.append(verdictEl);
  }

  /* ── update all checks from a verify:done event ──────────────── */
  function applyVerdict(checks, score, verdict, n) {
    iteration = n;

    // Update score display
    if (scoreEl) {
      scoreEl.textContent = score;
      scoreEl.className = score >= 80 ? 'font-mono text-xs font-bold text-emerald-300'
                        : score >= 55 ? 'font-mono text-xs font-bold text-amber-300'
                                      : 'font-mono text-xs font-bold text-rose-300';
    }

    // Animate each check row flip
    for (const check of checks) {
      const r = rowEls[check.id];
      if (!r) continue;

      const newState = check.pass ? STATE.pass : STATE.fail;
      const oldState = checkState[check.id];

      // Flip animation only when state changes (or on first verify)
      const changed = oldState !== newState || oldState === STATE.pending;

      if (changed) {
        // Add flip class to trigger CSS animation
        r.root.classList.add('cl-flipping');
        r.root.addEventListener('animationend', () => r.root.classList.remove('cl-flipping'), { once: true });
      }

      // Remove all state classes, apply new
      r.root.classList.remove('cl-pending', 'cl-pass', 'cl-fail');
      r.root.classList.add('cl-' + newState);

      // Icon
      r.iconEl.textContent = check.pass ? '✓' : '✗';
      r.iconEl.className   = check.pass
        ? 'cl-icon-wrap flex-none pt-px font-bold text-emerald-400'
        : 'cl-icon-wrap flex-none pt-px font-bold text-rose-400';

      // Evidence (show for failures, hide for passes)
      if (check.evidence && !check.pass) {
        r.evidenceEl.textContent = check.evidence;
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
        ? `Starting point: ${nFail} of 9 checks failing.`
        : nFail === 0
          ? '✅ All 9 checks pass!'
          : `After lap ${n}: ${nFail} of 9 check${nFail !== 1 ? 's' : ''} still failing. ${verdict}`;
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
