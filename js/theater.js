/* ═══════════════════════════════════════════════════════════════════════
   theater.js — v4 Loop Diagram (TERMINAL RE-SKIN).

   The loop as a live ASCII flowchart:

     01 CONTEXT ──► 02 WRITE ──► 03 VERIFY ──► 04 DECIDE ──yes──► 05 HALT
         ▲                                        │no
         └──────── failed checks → next todo ─────┘

   PURE VIEW. Zero setTimeout calls. Every node highlight, arrow state
   and caption is triggered by a real event from loop.js — the same
   event stream the Technical Log renders. Node spans snap between
   states instantly; machines don't ease.
   ═══════════════════════════════════════════════════════════════════════ */

import { $, el, esc, arr } from './dom.js?v=4';

/* Map stop codes to finish-line messages (plain language, no decoration) */
function stopMessage(ev) {
  if (ev.code === 'perfect')  return `All 9 checks passed after ${ev.iterations} lap${ev.iterations !== 1 ? 's' : ''}. The verifier found nothing left to fix.`;
  if (ev.code === 'target')   return `Score hit the target (${ev.score}). ${ev.iterations} lap${ev.iterations !== 1 ? 's' : ''} run.`;
  if (ev.code === 'max')      return `Ran out of laps after ${ev.iterations}. Some checks still open — raise max iterations to continue.`;
  if (ev.code === 'plateau')  return `Same checks failed twice with no change — may need human input.`;
  if (ev.code === 'aborted')  return `Stopped early by you. Last completed draft shown. Score: ${ev.score}.`;
  return ev.reason || 'Loop finished.';
}

/* ── the ASCII diagram ──────────────────────────────────────────────────
   Each node's box segments share a class (tnc/tnw/tnv/tnd/tns) so a
   single class toggle lights the whole box. Arrows likewise
   (tac/tav/tad/tay/tal). Composed line by line; widths are fixed.    */
function buildDiagram() {
  const C = (cls, s) => `<span class="tn ${cls}">${s}</span>`;
  const A = (cls, s) => `<span class="ta ${cls}">${s}</span>`;
  const G = '    ';                       // gap between boxes on border lines

  const l1 = C('tnc', '┌──────────────┐') + G + C('tnw', '┌──────────────┐') + G + C('tnv', '┌──────────────┐') + G + C('tnd', '┌──────────────┐');
  const l2 = C('tnc', '│ 01 CONTEXT   │') + A('tac', '───►') + C('tnw', '│ 02 WRITE     │') + A('tav', '───►') + C('tnv', '│ 03 VERIFY    │') + A('tad', '───►') + C('tnd', '│ 04 DECIDE    │');
  const l3 = C('tnc', '│ resume+todo  │') + G + C('tnw', '│ apply fixes  │') + G + C('tnv', '│ 9 rule check │') + G + C('tnd', '│ all pass?    │');
  const l4 = C('tnc', '└──────────────┘') + G + C('tnw', '└──────────────┘') + G + C('tnv', '└──────────────┘') + G + C('tnd', '└──────────────┘');

  const l5 = A('tal', '        ▲') + ' '.repeat(58) + A('tay', '│');
  const l6 = A('tal', '        │      no · failed checks become the next lap’s todo   ') + A('tay', '│');
  const l7 = A('tal', '        └────────────────────────◄──────────────────────────') + A('tay', '┤');
  const l8 = ' '.repeat(67) + A('tay', '│ yes');
  const l9  = ' '.repeat(52) + C('tns', '┌──────────────▼┐');
  const l10 = ' '.repeat(52) + C('tns', '│ 05 HALT   [✓] │');
  const l11 = ' '.repeat(52) + C('tns', '└───────────────┘');

  return [l1, l2, l3, l4, l5, l6, l7, l8, l9, l10, l11].join('\n');
}

/* ── caption panels ─────────────────────────────────────────────────── */
function mkCaption(label, id) {
  const w = el('div', 'theater-caption');
  w.innerHTML = `<div class="theater-caption-label">${label}</div><div class="theater-cap-body theater-cap-${id}">—</div>`;
  return w;
}

function mkExplainer() {
  const d = el('details', 'theater-explainer');
  d.setAttribute('open', '');
  d.innerHTML = `
    <summary><span>what is this diagram?</span><span aria-hidden="true">▾</span></summary>
    <div class="theater-explainer-body">
      <p>This is a loop: the machine checks its own work, fixes what failed, then checks
      again — until nothing is left to fix or it runs out of laps.</p>
      <p>Follow the arrows. WRITE rewrites your resume. VERIFY — a separate model with no
      memory of the writer — tests the draft against 9 named rules. DECIDE is plain code:
      any check still failing sends the draft around again.</p>
      <div class="theater-legend">
        <div class="theater-legend-item">
          <span class="theater-legend-icon">01</span>
          <span>CONTEXT — what the machine knows: your resume + the checks that failed last lap</span>
        </div>
        <div class="theater-legend-item">
          <span class="theater-legend-icon">02</span>
          <span>WRITE — rewrites only what the failed checks name</span>
        </div>
        <div class="theater-legend-item">
          <span class="theater-legend-icon">03</span>
          <span>VERIFY — an independent model scores the draft against all 9 rules</span>
        </div>
        <div class="theater-legend-item">
          <span class="theater-legend-icon">04</span>
          <span>DECIDE — deterministic code: still failing? loop. all pass? halt.</span>
        </div>
      </div>
    </div>`;
  return d;
}

/* ════════════════════════════════════════════════════════════════════════
   Main factory
   ════════════════════════════════════════════════════════════════════════ */
export function createTheaterView() {
  const container = $('theater');

  let lapNumEl     = null;
  let scoreBigEl   = null;
  let scoreDeltaEl = null;
  let workerCapEl  = null;
  let verifyCapEl  = null;
  let decideCapEl  = null;
  let finishEl     = null;
  let currentScore = null;
  let diagramEl    = null;   // the <pre> element
  let maxIter      = 5;

  /* ── DOM helpers ────────────────────────────────────────────────── */
  function setNodeState(cls, state /* 'idle'|'active'|'done' */) {
    diagramEl?.querySelectorAll('.' + cls).forEach(s => {
      s.classList.remove('tn-active', 'tn-done');
      if (state === 'active') s.classList.add('tn-active');
      if (state === 'done')   s.classList.add('tn-done');
    });
  }

  function setArrowState(cls, state /* 'dim'|'live'|'taken' */) {
    diagramEl?.querySelectorAll('.' + cls).forEach(s => {
      s.classList.remove('ta-live', 'ta-taken');
      if (state === 'live')  s.classList.add('ta-live');
      if (state === 'taken') s.classList.add('ta-taken');
    });
  }

  /* ── Score display ──────────────────────────────────────────────── */
  function updateScore(score, prev) {
    if (!scoreBigEl) return;
    scoreBigEl.textContent = String(score).padStart(3, '0');
    if (prev === null || prev === undefined) {
      scoreDeltaEl.textContent = 'BASELINE';
      scoreDeltaEl.className   = 't-readout-delta';
    } else {
      const d = score - prev;
      scoreDeltaEl.textContent = `${d > 0 ? '▲+' : d < 0 ? '▼' : '='}${d === 0 ? '' : d}`;
      scoreDeltaEl.className   = `t-readout-delta ${d > 0 ? 'up' : d < 0 ? 'down' : ''}`;
    }
    currentScore = score;
  }

  /* ── Caption helpers ────────────────────────────────────────────── */
  function setCap(panelEl, text, active = false) {
    if (!panelEl) return;
    const b = panelEl.querySelector('.theater-cap-body');
    if (b) b.textContent = text;
    panelEl.classList.toggle('active', active);
  }

  /* ── BUILD DOM ──────────────────────────────────────────────────── */
  function buildDOM() {
    container.innerHTML = '';
    currentScore = null;

    // Score readout row
    const readout = el('div', 't-readout');
    scoreBigEl   = el('span', 't-readout-score', '—');
    scoreDeltaEl = el('span', 't-readout-delta', '');
    lapNumEl     = el('span', 't-readout-lap', 'awaiting start');
    readout.append(el('span', 't-small t-faint t-caps', 'score'), scoreBigEl, scoreDeltaEl, lapNumEl);
    container.append(readout);

    // ASCII diagram
    const wrap = el('div', 't-diagram');
    const pre  = el('pre');
    pre.innerHTML = buildDiagram();
    wrap.append(pre);
    diagramEl = pre;
    container.append(wrap);

    // Captions
    const caps = el('div', 'mt-2');
    workerCapEl = mkCaption('[WRITE] — this lap’s changes', 'worker');
    verifyCapEl = mkCaption('[VERIFY] — what the checker found', 'verifier');
    decideCapEl = mkCaption('[DECIDE] — what happens next', 'decide');
    caps.append(workerCapEl, verifyCapEl, decideCapEl);
    container.append(caps);

    // Finish readout
    finishEl = el('div', 'theater-finish');
    finishEl.innerHTML = `
      <div class="theater-finish-headline">loop complete</div>
      <div id="theaterFinishReason" class="theater-finish-reason"></div>`;
    container.append(finishEl);

    // Explainer
    container.append(mkExplainer());
  }

  /* ── EVENT HANDLERS — same triggers as before, new rendering ────── */

  function onSetupStart() {
    setNodeState('tnc', 'active');
    setArrowState('tac', 'dim');
    if (lapNumEl) lapNumEl.textContent = 'reading resume + job description…';
  }

  function onSetupDone(ev) {
    if (ev.step === 'resume') {
      if (lapNumEl) lapNumEl.textContent = 'running initial verification…';
    }
  }

  function onVerifyStart(ev) {
    setNodeState('tnv', 'active');
    setArrowState('tad', 'live');
    if (ev.n === 0) {
      if (lapNumEl) lapNumEl.textContent = 'first check — scoring the original…';
    }
    setCap(verifyCapEl, 'checking…', true);
  }

  function onVerifyDone(ev) {
    const failed = arr(ev.data?.checks).filter(c => !c.pass);
    const score  = ev.score ?? 0;
    const prev   = currentScore;
    updateScore(score, ev.n === 0 ? null : prev);
    setNodeState('tnv', 'done');
    setArrowState('tad', 'taken');

    if (ev.n === 0) {
      setNodeState('tnc', 'done');
      if (lapNumEl) lapNumEl.textContent = `baseline ${score} · ${failed.length}/9 failing`;
      setCap(verifyCapEl,
        `Original resume scores ${score}. ${failed.length} of 9 checks fail — that is the starting wall of [✗].`, false);
    } else {
      if (lapNumEl) lapNumEl.textContent = `lap ${ev.n}: score ${score}`;
      setCap(verifyCapEl,
        failed.length === 0
          ? `All 9 checks pass. Score: ${score}.`
          : `${failed.length} check${failed.length !== 1 ? 's' : ''} still failing: ${failed.slice(0, 2).map(c => c.name).join(', ')}${failed.length > 2 ? '…' : ''}.`,
        false);
    }
  }

  function onIterStart(ev) {
    maxIter = ev.max;
    setNodeState('tnc', 'active');
    setNodeState('tnw', 'idle');
    setNodeState('tnv', 'idle');
    setNodeState('tnd', 'idle');
    setArrowState('tac', 'live');
    setArrowState('tav', 'dim');
    setArrowState('tad', 'dim');
    setArrowState('tay', 'dim');
    setArrowState('tal', 'dim');

    if (lapNumEl) lapNumEl.textContent = `lap ${ev.n}/${ev.max}`;
    setCap(decideCapEl, '—', false);
  }

  function onDoStart() {
    setNodeState('tnc', 'done');
    setNodeState('tnw', 'active');
    setArrowState('tac', 'taken');
    setArrowState('tav', 'live');
    setCap(workerCapEl, 'rewriting…', true);
  }

  function onDoDone(ev) {
    setNodeState('tnw', 'done');
    setArrowState('tav', 'taken');
    const changes = arr(ev.data?.changesMade);
    const first   = changes[0];
    const text    = first
      ? (typeof first === 'object' ? first.change : first)
      : 'Resume revised.';
    setCap(workerCapEl,
      `${text}${changes.length > 1 ? ` (+${changes.length - 1} more)` : ''}`,
      false);
  }

  function onDecideDone(ev) {
    setNodeState('tnd', 'active');
    setArrowState('tad', 'taken');

    const failed = arr(ev.failedChecks);

    if (ev.decision === 'stop') {
      setNodeState('tnd', 'done');
      setArrowState('tay', 'taken');
      setArrowState('tal', 'dim');
      setNodeState('tns', 'active');

      const msg = ev.stopCode === 'perfect'
        ? 'All 9 checks passed — nothing left to fix.'
        : ev.stopCode === 'target'
          ? `Score hit the target (${ev.score}). Halting.`
          : ev.stopCode === 'max'
            ? `Out of laps. ${failed.length} check${failed.length !== 1 ? 's' : ''} still open.`
            : 'Same problems twice — may need human input.';
      setCap(decideCapEl, msg, false);
      if (lapNumEl) lapNumEl.textContent = `done after ${ev.n} lap${ev.n !== 1 ? 's' : ''}`;
    } else {
      setNodeState('tnd', 'idle');
      setArrowState('tal', 'live');
      setArrowState('tay', 'dim');

      setCap(decideCapEl,
        `Not done — ${failed.length} check${failed.length !== 1 ? 's' : ''} still failing. Looping back.`,
        true);
      if (lapNumEl) lapNumEl.textContent = `lap ${ev.n} done — looping back`;
    }
  }

  function onStop(ev) {
    setNodeState('tns', 'done');
    setArrowState('tal', 'dim');
    if (finishEl) {
      finishEl.classList.add('visible');
      const r = document.getElementById('theaterFinishReason');
      if (r) r.textContent = stopMessage(ev);
    }
    if (lapNumEl)
      lapNumEl.textContent = `${ev.iterations} lap${ev.iterations !== 1 ? 's' : ''} · final ${ev.score}`;
  }

  /* ── PUBLIC SURFACE ─────────────────────────────────────────────── */
  return {
    reset(settings) {
      maxIter = settings.maxIterations;
      currentScore = null;
      buildDOM();
    },
    finish() {},
    handle(ev) {
      switch (ev.type) {
        case 'setup:start':  return onSetupStart(ev);
        case 'setup:done':   return onSetupDone(ev);
        case 'verify:start': return onVerifyStart(ev);
        case 'verify:done':  return onVerifyDone(ev);
        case 'iter:start':   return onIterStart(ev);
        case 'do:start':     return onDoStart(ev);
        case 'do:done':      return onDoDone(ev);
        case 'decide:done':  return onDecideDone(ev);
        case 'stop':         return onStop(ev);
      }
    }
  };
}
