/* ═══════════════════════════════════════════════════════════════════════
   theater.js — v4 Loop Theater.
   Flowchart-style visualization matching the loop engineering diagram:

     [Resume + Checks] ──► [AI Writer] ──► [Verifier] ──► ◇ All pass?
            ▲                                                │      │
            └────────── new result → try again ─────────────┘"no"  │"yes"
                        (dashed loop-back arrow)                    ▼
                                                               [Done! ✓]

   PURE VIEW. Zero setTimeout calls. Every node glow, arrow highlight,
   and caption is triggered by a real event from loop.js.
   ═══════════════════════════════════════════════════════════════════════ */

import { $, el, esc, arr } from './dom.js?v=4';

/* Map stop codes to finish-line messages (plain language) */
function stopMessage(ev) {
  if (ev.code === 'perfect')  return `✅ All 9 checks passed after ${ev.iterations} lap${ev.iterations !== 1 ? 's' : ''}. The verifier found nothing left to fix.`;
  if (ev.code === 'target')   return `🎯 Score hit the target (${ev.score}%). ${ev.iterations} lap${ev.iterations !== 1 ? 's' : ''} run.`;
  if (ev.code === 'max')      return `⏱ Ran out of laps after ${ev.iterations}. Some checks still open — raise max-iterations to continue.`;
  if (ev.code === 'plateau')  return `🔁 Same checks failed twice with no change — may need human input.`;
  if (ev.code === 'aborted')  return `Stopped early. Last completed draft shown. Score: ${ev.score}%.`;
  return ev.reason || 'Loop finished.';
}

/* ── SVG template ────────────────────────────────────────────────────── */
function buildFlowchartSVG() {
  return `<svg id="flowSVG" viewBox="0 0 700 420" class="flowchart-svg"
    xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Loop flowchart visualization">
  <defs>
    <!-- Dot-grid background -->
    <pattern id="dotGrid" x="0" y="0" width="28" height="28" patternUnits="userSpaceOnUse">
      <circle cx="14" cy="14" r="1" fill="#1B2438"/>
    </pattern>

    <!-- Arrowhead markers — one per path colour -->
    <marker id="arr-grey" markerWidth="9" markerHeight="7" refX="9" refY="3.5" orient="auto">
      <polygon points="0 0, 9 3.5, 0 7" fill="#475569"/>
    </marker>
    <marker id="arr-indigo" markerWidth="9" markerHeight="7" refX="9" refY="3.5" orient="auto">
      <polygon points="0 0, 9 3.5, 0 7" fill="#6366F1"/>
    </marker>
    <marker id="arr-indigo-bright" markerWidth="9" markerHeight="7" refX="9" refY="3.5" orient="auto">
      <polygon points="0 0, 9 3.5, 0 7" fill="#818CF8"/>
    </marker>
    <marker id="arr-green" markerWidth="9" markerHeight="7" refX="9" refY="3.5" orient="auto">
      <polygon points="0 0, 9 3.5, 0 7" fill="#10B981"/>
    </marker>
  </defs>

  <!-- Background -->
  <rect width="700" height="420" fill="#0B1120" rx="14"/>
  <rect width="700" height="420" fill="url(#dotGrid)" rx="14"/>

  <!-- ──────────────────────────────────────────────────
       LOOP-BACK DASHED ARROW (drawn behind nodes)
       Decision ─► up ─► left ─► down into Context
       ────────────────────────────────────────────────── -->
  <g id="fc-arrow-loop" class="fc-arrow fc-arrow-dim">
    <path d="M 590,133 L 590,50 L 100,50 L 100,147"
      fill="none" stroke="#6366F1" stroke-width="2.2"
      stroke-dasharray="9,5" marker-end="url(#arr-indigo)"/>
    <text x="345" y="35" text-anchor="middle" class="fc-loop-label">new result → try again</text>
  </g>

  <!-- ──────────────────────────────────────────────────
       CONNECTOR ARROWS (between nodes, dashed grey)
       ────────────────────────────────────────────────── -->
  <!-- Context → Worker -->
  <g id="fc-arrow-cw" class="fc-arrow fc-arrow-dim">
    <line x1="172" y1="185" x2="208" y2="185"
      stroke="#475569" stroke-width="2.2" stroke-dasharray="6,4"
      marker-end="url(#arr-grey)"/>
  </g>
  <!-- Worker → Verifier -->
  <g id="fc-arrow-wv" class="fc-arrow fc-arrow-dim">
    <line x1="330" y1="185" x2="378" y2="185"
      stroke="#475569" stroke-width="2.2" stroke-dasharray="6,4"
      marker-end="url(#arr-grey)"/>
  </g>
  <!-- Verifier → Decision -->
  <g id="fc-arrow-vd" class="fc-arrow fc-arrow-dim">
    <line x1="500" y1="185" x2="536" y2="185"
      stroke="#475569" stroke-width="2.2" stroke-dasharray="6,4"
      marker-end="url(#arr-grey)"/>
  </g>
  <!-- Decision → Done (YES, downward, green) -->
  <g id="fc-arrow-yes" class="fc-arrow fc-arrow-dim">
    <line x1="590" y1="237" x2="590" y2="296"
      stroke="#10B981" stroke-width="2.5"
      marker-end="url(#arr-green)"/>
    <text x="612" y="272" class="fc-label-yes">yes</text>
  </g>
  <!-- NO label on loop arrow -->
  <text id="fc-label-no" x="622" y="113" class="fc-label-no fc-arrow-dim">no</text>

  <!-- ──────────────────────────────────────────────────
       NODES
       ────────────────────────────────────────────────── -->

  <!-- 1. CONTEXT oval — "What it knows" -->
  <g id="fc-node-context" class="fc-node fc-idle" data-accent="#6366F1">
    <ellipse cx="100" cy="185" rx="72" ry="38" class="fc-shape"/>
    <text x="100" y="181" text-anchor="middle" class="fc-title">Resume</text>
    <text x="100" y="196" text-anchor="middle" class="fc-title">+ Checks</text>
    <text x="100" y="239" text-anchor="middle" class="fc-sub">goal + latest result</text>
  </g>

  <!-- 2. AI WRITER rounded rect -->
  <g id="fc-node-worker" class="fc-node fc-idle" data-accent="#8B5CF6">
    <rect x="210" y="158" width="120" height="54" rx="10" class="fc-shape"/>
    <text x="270" y="183" text-anchor="middle" class="fc-title">AI Writer</text>
    <text x="270" y="198" text-anchor="middle" class="fc-title fc-title-sm">choose next fix</text>
    <text x="270" y="230" text-anchor="middle" class="fc-sub">revises resume</text>
  </g>

  <!-- 3. VERIFIER rounded rect -->
  <g id="fc-node-verifier" class="fc-node fc-idle" data-accent="#38BDF8">
    <rect x="380" y="158" width="120" height="54" rx="10" class="fc-shape"/>
    <text x="440" y="183" text-anchor="middle" class="fc-title">Verifier</text>
    <text x="440" y="198" text-anchor="middle" class="fc-title fc-title-sm">independent check</text>
    <text x="440" y="230" text-anchor="middle" class="fc-sub">tests 9 rules</text>
  </g>

  <!-- 4. DECISION diamond — "All pass?" -->
  <g id="fc-node-decide" class="fc-node fc-idle" data-accent="#F59E0B">
    <polygon points="590,133 644,185 590,237 536,185" class="fc-shape"/>
    <text x="590" y="181" text-anchor="middle" class="fc-title fc-title-sm">need</text>
    <text x="590" y="196" text-anchor="middle" class="fc-title fc-title-sm">a fix?</text>
  </g>

  <!-- 5. DONE oval — Stop -->
  <g id="fc-node-stop" class="fc-node fc-idle" data-accent="#F43F5E">
    <ellipse cx="590" cy="330" rx="58" ry="28" class="fc-shape"/>
    <text x="590" y="326" text-anchor="middle" class="fc-title">Done!</text>
    <text x="590" y="341" text-anchor="middle" class="fc-title fc-title-sm">✓ stop</text>
    <text x="590" y="374" text-anchor="middle" class="fc-sub fc-sub-stop">stop when nothing left to fix</text>
  </g>

  <!-- Live score badge inside Context node (updates on verify:done) -->
  <g id="fc-score-badge" opacity="0">
    <rect x="55" y="205" width="90" height="18" rx="9" fill="#1B2438"/>
    <text id="fc-score-text" x="100" y="218" text-anchor="middle" class="fc-badge-text">–</text>
  </g>

</svg>`;
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
    <summary><span>💡 How to read this diagram — click to collapse</span><span>▾</span></summary>
    <div class="theater-explainer-body">
      <p>This is the loop shown as a <strong style="color:#CBD5E1">flowchart</strong> — the same style used in
      software engineering and loop-agent diagrams.</p>
      <p>Follow the arrows: the AI Writer rewrites your resume, the Verifier independently checks it against
      9 named rules, and the diamond asks "does anything still need fixing?" If yes — the dashed arrow loops
      back and the whole thing repeats. If no — Done!</p>
      <div class="theater-legend">
        <div class="theater-legend-item">
          <span class="theater-legend-icon">🟣</span>
          <span><strong style="color:#CBD5E1">Resume + Checks</strong> — the AI's current knowledge: your resume + the list of checks that failed last time</span>
        </div>
        <div class="theater-legend-item">
          <span class="theater-legend-icon">🟪</span>
          <span><strong style="color:#CBD5E1">AI Writer</strong> — rewrites specific parts of your resume to fix the failing checks</span>
        </div>
        <div class="theater-legend-item">
          <span class="theater-legend-icon">🔵</span>
          <span><strong style="color:#CBD5E1">Verifier</strong> — a completely different AI reads the new draft and scores it against all 9 rules</span>
        </div>
        <div class="theater-legend-item">
          <span class="theater-legend-icon">🟡</span>
          <span><strong style="color:#CBD5E1">Need a fix?</strong> — plain code reads the verifier's result: yes → loop again, no → done!</span>
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
  let svgEl        = null;   // the <svg> element
  let maxIter      = 5;

  /* ── DOM helpers ────────────────────────────────────────────────── */
  function getNode(id) { return svgEl?.querySelector('#' + id); }

  function setNodeState(id, state /* 'fc-idle'|'fc-active'|'fc-done'|'fc-stop-done' */) {
    const g = getNode(id);
    if (!g) return;
    g.classList.remove('fc-idle', 'fc-active', 'fc-done', 'fc-stop-done');
    g.classList.add(state);
  }

  function setArrowState(id, state /* 'fc-arrow-dim'|'fc-arrow-live'|'fc-arrow-taken' */) {
    const g = getNode(id);
    if (!g) return;
    g.classList.remove('fc-arrow-dim', 'fc-arrow-live', 'fc-arrow-taken');
    g.classList.add(state);
    // Also sync the standalone label elements (by toggling the dim class)
    const lbl = svgEl?.querySelector('#fc-label-no, #fc-label-yes');
    // handled per-event below
  }

  /* ── Score display ──────────────────────────────────────────────── */
  function updateScore(score, prev) {
    if (!scoreBigEl) return;
    scoreBigEl.textContent = score + '%';
    if (prev === null || prev === undefined) {
      scoreDeltaEl.textContent = 'baseline';
      scoreDeltaEl.className   = 'theater-score-delta flat';
    } else {
      const d = score - prev;
      scoreDeltaEl.textContent = `${d > 0 ? '▲ +' : d < 0 ? '▼ ' : '▶ '}${d}`;
      scoreDeltaEl.className   = `theater-score-delta ${d > 0 ? 'up' : d < 0 ? 'down' : 'flat'}`;
    }
    currentScore = score;
    // Update score badge inside SVG
    const badge = getNode('fc-score-badge');
    const txt   = getNode('fc-score-text');
    if (badge) badge.setAttribute('opacity', '1');
    if (txt)   txt.textContent = score + '%';
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

    // Score header
    const scoreRow = el('div', 'flex flex-col items-center gap-1 mb-4');
    scoreBigEl   = el('div', 'theater-score-big', '–');
    scoreDeltaEl = el('div', 'theater-score-delta flat', '');
    lapNumEl     = el('div', 'theater-lap-num', 'Waiting to start…');
    scoreRow.append(lapNumEl, scoreBigEl, scoreDeltaEl);
    container.append(scoreRow);

    // Flowchart SVG
    const wrap = el('div', 'flowchart-wrap');
    wrap.innerHTML = buildFlowchartSVG();
    svgEl = wrap.querySelector('#flowSVG');
    container.append(wrap);

    // Captions
    const caps = el('div', 'space-y-2 mt-3');
    workerCapEl = mkCaption('🛠 AI Writer — what it changed this lap', 'worker');
    verifyCapEl = mkCaption('🔍 Verifier — what the checker found', 'verifier');
    decideCapEl = mkCaption('⚖️ Decision — what happens next', 'decide');
    caps.append(workerCapEl, verifyCapEl, decideCapEl);
    container.append(caps);

    // Finish banner
    finishEl = el('div', 'theater-finish');
    finishEl.innerHTML = `
      <div class="theater-finish-headline">🏁 Loop Complete!</div>
      <div id="theaterFinishReason" class="theater-finish-reason"></div>`;
    container.append(finishEl);

    // Explainer
    container.append(mkExplainer());
  }

  /* ── EVENT HANDLERS ─────────────────────────────────────────────── */

  function onSetupStart() {
    // Context node lights up while reading inputs
    setNodeState('fc-node-context', 'fc-active');
    setArrowState('fc-arrow-cw',    'fc-arrow-dim');
    if (lapNumEl) lapNumEl.textContent = 'Reading your resume + job description…';
  }

  function onSetupDone(ev) {
    if (ev.step === 'resume') {
      // Both inputs ready; verifier baseline is next
      if (lapNumEl) lapNumEl.textContent = 'Running initial verification…';
    }
  }

  function onVerifyStart(ev) {
    setNodeState('fc-node-verifier', 'fc-active');
    setArrowState('fc-arrow-vd', 'fc-arrow-live');
    if (ev.n === 0) {
      if (lapNumEl) lapNumEl.textContent = 'First check — scoring the original resume…';
    }
    setCap(verifyCapEl, 'Checking…', true);
  }

  function onVerifyDone(ev) {
    const failed = arr(ev.data?.checks).filter(c => !c.pass);
    const score  = ev.score ?? 0;
    const prev   = currentScore;
    updateScore(score, ev.n === 0 ? null : prev);
    setNodeState('fc-node-verifier', 'fc-done');
    setArrowState('fc-arrow-vd',     'fc-arrow-taken');

    if (ev.n === 0) {
      setNodeState('fc-node-context', 'fc-done');
      if (lapNumEl) lapNumEl.textContent = `Baseline: ${score}% · ${failed.length} of 9 checks failing`;
      setCap(verifyCapEl,
        `Original resume scores ${score}%. The checker found ${failed.length} of 9 checks failing — that's the starting wall of ✗.`, false);
    } else {
      if (lapNumEl) lapNumEl.textContent = `Lap ${ev.n}: score ${score}%`;
      setCap(verifyCapEl,
        failed.length === 0
          ? `All 9 checks pass! Score: ${score}%.`
          : `Found ${failed.length} check${failed.length !== 1 ? 's' : ''} still failing: ${failed.slice(0, 2).map(c => c.name).join(', ')}${failed.length > 2 ? '…' : ''}.`,
        false);
    }
  }

  function onIterStart(ev) {
    maxIter = ev.max;
    // Reset nodes for new lap (except stop)
    setNodeState('fc-node-context',  'fc-active');
    setNodeState('fc-node-worker',   'fc-idle');
    setNodeState('fc-node-verifier', 'fc-idle');
    setNodeState('fc-node-decide',   'fc-idle');
    // Reset arrows
    setArrowState('fc-arrow-cw',    'fc-arrow-live');
    setArrowState('fc-arrow-wv',    'fc-arrow-dim');
    setArrowState('fc-arrow-vd',    'fc-arrow-dim');
    setArrowState('fc-arrow-yes',   'fc-arrow-dim');
    setArrowState('fc-arrow-loop',  'fc-arrow-dim');

    const noLabel = svgEl?.querySelector('#fc-label-no');
    if (noLabel) noLabel.classList.add('fc-arrow-dim');

    if (lapNumEl) lapNumEl.textContent = `Lap ${ev.n} of ${ev.max}`;
    setCap(decideCapEl, '—', false);
  }

  function onDoStart() {
    setNodeState('fc-node-context', 'fc-done');
    setNodeState('fc-node-worker',  'fc-active');
    setArrowState('fc-arrow-cw',    'fc-arrow-taken');
    setArrowState('fc-arrow-wv',    'fc-arrow-live');
    setCap(workerCapEl, 'Rewriting…', true);
  }

  function onDoDone(ev) {
    setNodeState('fc-node-worker', 'fc-done');
    setArrowState('fc-arrow-wv',   'fc-arrow-taken');
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
    setNodeState('fc-node-decide', 'fc-active');
    setArrowState('fc-arrow-vd',   'fc-arrow-taken');

    const failed = arr(ev.failedChecks);

    if (ev.decision === 'stop') {
      // YES path: down to Done
      setNodeState('fc-node-decide', 'fc-done');
      setArrowState('fc-arrow-yes',  'fc-arrow-taken');
      setArrowState('fc-arrow-loop', 'fc-arrow-dim');
      setNodeState('fc-node-stop',   'fc-active');

      const noLabel = svgEl?.querySelector('#fc-label-no');
      if (noLabel) noLabel.classList.add('fc-arrow-dim');

      const msg = ev.stopCode === 'perfect'
        ? 'All 9 checks passed — the verifier found nothing left to fix!'
        : ev.stopCode === 'target'
          ? `Score hit the target (${ev.score}%). Stopping here.`
          : ev.stopCode === 'max'
            ? `Out of laps. ${failed.length} check${failed.length !== 1 ? 's' : ''} still open.`
            : `Same problems twice — may need human input.`;
      setCap(decideCapEl, msg, false);
      if (lapNumEl) lapNumEl.textContent = `Done after ${ev.n} lap${ev.n !== 1 ? 's' : ''}`;
    } else {
      // NO path: dashed loop-back arrow
      setNodeState('fc-node-decide', 'fc-idle');
      setArrowState('fc-arrow-loop', 'fc-arrow-live');
      setArrowState('fc-arrow-yes',  'fc-arrow-dim');

      const noLabel = svgEl?.querySelector('#fc-label-no');
      if (noLabel) noLabel.classList.remove('fc-arrow-dim');

      setCap(decideCapEl,
        `Not perfect — ${failed.length} check${failed.length !== 1 ? 's' : ''} still failing. Going around again to fix them.`,
        true);
      if (lapNumEl) lapNumEl.textContent = `Lap ${ev.n} done — looping back`;
    }
  }

  function onStop(ev) {
    setNodeState('fc-node-stop', 'fc-stop-done');
    setArrowState('fc-arrow-loop', 'fc-arrow-dim');
    if (finishEl) {
      finishEl.classList.add('visible');
      const r = document.getElementById('theaterFinishReason');
      if (r) r.textContent = stopMessage(ev);
    }
    if (lapNumEl)
      lapNumEl.textContent = `${ev.iterations} lap${ev.iterations !== 1 ? 's' : ''} · final score ${ev.score}%`;
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
