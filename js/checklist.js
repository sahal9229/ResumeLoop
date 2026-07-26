/* ═══════════════════════════════════════════════════════════════════════
   checklist.js — the 9 checks as a 3×3 grid of squares (BAUHAUS).

   Nine checks, nine squares, one per id:
     not verified yet → ink outline, empty
     failed           → solid red
     passed           → solid ink

   Watching the grid go from red to black IS the loop's progress.
   Each flip is triggered by a real verify:done event — never a timer.
   Hover / focus a square to read the check and the checker's evidence.
   ═══════════════════════════════════════════════════════════════════════ */

import { $, el } from './dom.js?v=4';
import { CHECK_DEFS } from './prompts.js?v=5';

const IDLE_HINT = 'Hover a square to read the check and the checker’s evidence.';

function cellLabel(def, state, evidence) {
  const s = state === 'pass' ? 'passed' : state === 'fail' ? 'failed' : 'not verified yet';
  return `${def.name} — ${s}${evidence ? '. ' + evidence : ''}`;
}

/* Build one 3×3 grid + evidence readout. Returns { root, update(checks) }.
   Used live on the Process page and once more on the Result page. */
export function buildCheckGrid() {
  const root = el('div');
  const grid = el('div', 'cl-grid');
  grid.setAttribute('role', 'group');
  grid.setAttribute('aria-label', 'Nine quality checks');
  const evidence = el('div', 'cl-evidence', IDLE_HINT);

  const cells = {};
  const state = {};   // id → { state:'pending'|'pass'|'fail', evidence:'' }

  for (const def of CHECK_DEFS) {
    const cell = el('button', 'cl-cell');
    cell.type = 'button';
    cell.dataset.id = def.id;
    cell.setAttribute('aria-label', cellLabel(def, 'pending', ''));

    const reveal = () => {
      const s = state[def.id] || { state: 'pending', evidence: '' };
      const status = s.state === 'pass' ? 'PASS' : s.state === 'fail' ? 'FAIL' : 'NOT VERIFIED YET';
      evidence.innerHTML = '';
      const head = el('b');
      head.textContent = `${def.id} · ${def.name} — ${status}`;
      evidence.append(head);
      if (s.evidence) {
        evidence.append(el('div', '', ''));
        const q = el('div');
        q.textContent = s.evidence;
        evidence.append(q);
      }
    };
    cell.addEventListener('mouseenter', reveal);
    cell.addEventListener('focus', reveal);
    cell.addEventListener('click', reveal);

    grid.append(cell);
    cells[def.id] = cell;
    state[def.id] = { state: 'pending', evidence: '' };
  }

  grid.addEventListener('mouseleave', () => { evidence.textContent = IDLE_HINT; });

  root.append(grid, evidence);

  function update(checks) {
    for (const check of checks) {
      const cell = cells[check.id];
      const def  = CHECK_DEFS.find(d => d.id === check.id);
      if (!cell || !def) continue;
      const newState = check.pass ? 'pass' : 'fail';
      cell.classList.remove('pass', 'fail');
      cell.classList.add(newState);            // instant flip — no easing
      state[check.id] = { state: newState, evidence: check.evidence || '' };
      cell.setAttribute('aria-label', cellLabel(def, newState, check.evidence || ''));
    }
  }

  return { root, update };
}

export function createChecklistView() {
  const panel = $('checklistPanel');
  let gridApi  = null;
  let countEl  = null;

  function buildDOM() {
    panel.innerHTML = '';
    panel.className = 'checks-wrap';

    const head = el('div', 'cl-head');
    const title = el('span', 'sec-sub', 'THE CRITIC’S 9 CHECKS');
    title.style.margin = '0';
    title.style.borderTop = '0';
    title.style.paddingTop = '0';
    countEl = el('span', 'cl-count', 'AWAITING FIRST VERIFICATION');
    head.append(title, countEl);
    panel.append(head);

    // key: what the colors mean — one glance, no guessing
    const key = el('div', 'cl-key');
    key.innerHTML = `
      <span class="cl-key-item"><span class="cl-key-sq key-fail"></span>FAILED</span>
      <span class="cl-key-item"><span class="cl-key-sq key-pass"></span>PASSED</span>
      <span class="cl-key-item"><span class="cl-key-sq"></span>NOT CHECKED YET</span>`;
    panel.append(key);

    gridApi = buildCheckGrid();
    panel.append(gridApi.root);
  }

  function applyVerdict(checks, n) {
    gridApi?.update(checks);
    if (countEl) {
      const nFail = checks.filter(c => !c.pass).length;
      countEl.textContent = n === 0
        ? `BASELINE — ${nFail} OF 9 FAILING`
        : nFail === 0
          ? 'ALL 9 PASS'
          : `AFTER LAP ${n} — ${nFail} OF 9 OPEN`;
    }
  }

  return {
    reset() { buildDOM(); },
    finish() {},
    handle(ev) {
      if (ev.type === 'verify:done') {
        applyVerdict(ev.data?.checks || [], ev.n);
      }
    }
  };
}
