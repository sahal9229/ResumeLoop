/* ═══════════════════════════════════════════════════════════════════════
   theater.js — v7: the agent loop as a CIRCLE (BAUHAUS).

   The five cycle stages sit on a ring and the flow travels clockwise —
   lap after lap, the same way around:

                        MISSION  (enters at GUARD)
                           │
              GUARD ──► BRAIN ──► TOOL
                ▲                   │
                └── DECIDE ◄── CRITIC
                      │ approved
                   HUMAN OK → COMPLETE

   A failed verification is not a jump backwards — it is simply
   CONTINUING AROUND THE CIRCLE: the DECIDE→GUARD segment lights red
   ("FAIL — SEND BACK") and the next lap begins. That is the loop,
   made literal. The lap number sits in the center of the ring.

   Node states: outline = not reached · solid stage color = running
   (inner square pulses = waiting on the model) · solid ink = done
   this cycle · solid red = the decision said "not done".

   PURE VIEW. Zero timers that advance state. Every change is
   triggered by a real event from loop.js.
   ═══════════════════════════════════════════════════════════════════════ */

import { $, el, esc, arr } from './dom.js?v=4';

const SVG_NS = 'http://www.w3.org/2000/svg';

/* Map stop codes to finish headlines + plain-language messages */
function stopHeadline(code) {
  return {
    perfect: 'ALL 9 CHECKS PASS',
    target:  'TARGET REACHED',
    max:     'OUT OF LAPS',
    plateau: 'NO PROGRESS — HALTED',
    aborted: 'STOPPED BY YOU',
    error:   'ERROR — HALTED'
  }[code] || 'LOOP COMPLETE';
}

function stopMessage(ev) {
  if (ev.code === 'perfect')  return `All 9 checks passed after ${ev.iterations} lap${ev.iterations !== 1 ? 's' : ''}. The critic found nothing left to fix.`;
  if (ev.code === 'target')   return `Score hit the target (${ev.score}). ${ev.iterations} lap${ev.iterations !== 1 ? 's' : ''} run.`;
  if (ev.code === 'max')      return `The guard stopped the loop: out of laps after ${ev.iterations}. Some checks are still open — raise max laps to continue.`;
  if (ev.code === 'plateau')  return 'The same checks failed twice with no change — this may need human input.';
  if (ev.code === 'aborted')  return `Stopped early by you. The last completed draft is shown. Score: ${ev.score}.`;
  return ev.reason || 'Loop finished.';
}

/* API stages → short labels for the live ticker */
const STAGE_LABEL = {
  jd: 'PARSER', resume: 'PARSER', verify: 'CRITIC',
  do: 'TOOL', polish: 'POLISH', gaps: 'GAPS'
};

/* The ring: five stages, clockwise. Angles in degrees, screen coords
   (0° = right, 90° = down). GUARD upper-left; BRAIN at 12 o'clock;
   the DECIDE→GUARD segment on the lower-left is the send-back lane. */
const RING = [
  { key: 'guard',  num: '02', name: 'GUARD',  desc: 'cost & time limits', a: 198 },
  { key: 'brain',  num: '03', name: 'BRAIN',  desc: 'picks the fix list', a: 270 },
  { key: 'tool',   num: '04', name: 'TOOL',   desc: 'the rewrite call',   a: 342 },
  { key: 'critic', num: '05', name: 'CRITIC', desc: '9 independent checks', a: 54 },
  { key: 'decide', num: '06', name: 'DECIDE', desc: 'all pass?',          a: 126 }
];
const RING_R = 40;   // ring radius, in viewBox units (viewBox is 0 0 100 100)

function pos(angleDeg, r = RING_R) {
  const rad = (angleDeg * Math.PI) / 180;
  return [50 + r * Math.cos(rad), 50 + r * Math.sin(rad)];
}

/* ════════════════════════════════════════════════════════════════════════
   Main factory
   ════════════════════════════════════════════════════════════════════════ */
export function createTheaterView() {
  const container = $('theater');

  let nodeEls     = {};     // key → node element
  let descEls     = {};     // key → desc element (guard shows the live ledger)
  let memChipEl   = null;
  let errChipEl   = null;
  let ringBackEl  = null;   // the red DECIDE→GUARD arc
  let sendLblEl   = null;
  let lapNumEl    = null;
  let stageNameEl = null;
  let stageLineEl = null;
  let scoreEl     = null;
  let deltaEl     = null;
  let whyEl       = null;
  let finishEl    = null;
  let feedEl      = null;
  let scoreBlockEl = null;
  let currentScore = null;
  let maxIter      = 5;

  /* node states: idle (outline) · wait (solid stage color, square pulsing)
     · on (solid red — the failed decision) · done (solid ink) */
  function setNode(key, state) {
    const n = nodeEls[key];
    if (!n) return;
    n.classList.remove('wait', 'on', 'done');
    if (state === 'wait') n.classList.add('wait');
    if (state === 'on')   n.classList.add('on');
    if (state === 'done') n.classList.add('done');
  }

  function setChip(chip, state /* 'idle'|'on' */) {
    chip?.classList.toggle('on', state === 'on');
  }

  function setLoopEdge(live) {
    ringBackEl?.classList.toggle('live', !!live);
    sendLblEl?.classList.toggle('live', !!live);
  }

  function setLap(text)   { if (lapNumEl)   lapNumEl.textContent = text; }
  function setStageName(t){ if (stageNameEl) stageNameEl.textContent = t; }
  function setLine(t)     { if (stageLineEl) stageLineEl.textContent = t; }

  function updateScore(score, prev) {
    if (!scoreEl) return;
    scoreBlockEl?.classList.remove('hidden');   // no placeholder bar — real scores only
    scoreEl.textContent = String(score);
    if (prev === null || prev === undefined) {
      deltaEl.textContent = 'BASELINE';
    } else {
      const d = score - prev;
      deltaEl.textContent = `${d >= 0 ? '+' : ''}${d}`;
    }
    currentScore = score;
  }

  /* the live ticker: one short line per real step, newest on top */
  function pushFeed(tag, text, tone = 'info') {
    if (!feedEl) return;
    const line = el('div', `feed-line feed-${tone}`);
    line.innerHTML = `<span class="feed-sq" aria-hidden="true"></span><span class="feed-tag">${esc(tag)}</span><span class="feed-txt">${esc(text)}</span>`;
    feedEl.prepend(line);
    while (feedEl.children.length > 7) feedEl.lastChild.remove();
    [...feedEl.children].forEach((c, i) => c.classList.toggle('old', i > 0));
  }

  /* ── node factory ───────────────────────────────────────────────── */
  function mkNode(key, num, name, desc) {
    const node = el('div', `node flow-${key}`);
    node.innerHTML = `
      <span class="n-top">
        <span class="n-sq" aria-hidden="true"></span>
        <span class="n-num">${num}</span>
        <span class="n-name">${name}</span>
      </span>
      ${desc ? `<span class="n-desc">${esc(desc)}</span>` : ''}`;
    nodeEls[key] = node;
    descEls[key] = node.querySelector('.n-desc');
    return node;
  }

  /* ── the ring SVG: circle + direction arrows + red send-back arc ── */
  function buildRingSVG() {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('class', 'ring-svg');
    svg.setAttribute('aria-hidden', 'true');

    const circle = document.createElementNS(SVG_NS, 'circle');
    circle.setAttribute('cx', '50'); circle.setAttribute('cy', '50');
    circle.setAttribute('r', String(RING_R));
    svg.append(circle);

    // clockwise direction arrows at the midpoint of each segment
    for (let i = 0; i < RING.length; i++) {
      const a0 = RING[i].a;
      const a1 = RING[(i + 1) % RING.length].a;
      const mid = a0 + (((a1 - a0) % 360) + 360) % 360 / 2;
      const [x, y] = pos(mid);
      const tri = document.createElementNS(SVG_NS, 'path');
      tri.setAttribute('d', 'M -2 -1.6 L 2 0 L -2 1.6 Z');
      tri.setAttribute('class', 'ring-arrow');
      tri.setAttribute('transform', `translate(${x} ${y}) rotate(${mid + 90})`);
      svg.append(tri);
    }

    // the send-back lane: DECIDE → GUARD, lights red on every loop
    const [dx, dy] = pos(126);
    const [gx, gy] = pos(198);
    const back = document.createElementNS(SVG_NS, 'path');
    back.setAttribute('d', `M ${dx} ${dy} A ${RING_R} ${RING_R} 0 0 1 ${gx} ${gy}`);
    back.setAttribute('class', 'ring-back');
    svg.append(back);
    ringBackEl = back;

    return svg;
  }

  /* ── BUILD DOM ──────────────────────────────────────────────────── */
  function buildDOM() {
    container.innerHTML = '';
    currentScore = null;
    nodeEls = {}; descEls = {};

    const grid = el('div', 'process-grid');

    // ── left column: MISSION → the ring → HUMAN OK → COMPLETE ──
    const flowCol = el('div', 'flow');

    flowCol.append(mkNode('mission', '01', 'MISSION', 'resume + job + target'));
    flowCol.append(el('div', 'conn conn-entry'));

    const wrap = el('div', 'ring-wrap');
    wrap.append(buildRingSVG());

    for (const step of RING) {
      const node = mkNode(step.key, step.num, step.name, step.desc);
      node.classList.add('ring-node');
      const [x, y] = pos(step.a);
      node.style.left = x + '%';
      node.style.top  = y + '%';
      wrap.append(node);
    }

    // TOOL's two real side-outcomes live inside the TOOL node
    const chips = el('span', 'flow-chips');
    memChipEl = el('span', 'flow-chip chip-mem', 'SAVED TO MEMORY');
    errChipEl = el('span', 'flow-chip chip-err', 'ERROR — RETRYING');
    chips.append(memChipEl, errChipEl);
    nodeEls.tool.append(chips);

    // the send-back label, inside the ring near the lower-left arc
    sendLblEl = el('span', 'send-lbl', 'FAIL — SEND BACK');
    wrap.append(sendLblEl);

    // the lap number — the center of the circle
    lapNumEl = el('div', 'ring-lap');
    lapNumEl.innerHTML = '<span class="score-label">LAP</span><span class="num-120">00</span>';
    wrap.append(lapNumEl);

    flowCol.append(wrap);

    const exitConn = el('div', 'conn conn-exit');
    exitConn.append(el('span', 'conn-lbl', 'APPROVED'));
    flowCol.append(exitConn);
    flowCol.append(mkNode('human', '07', 'HUMAN OK', 'your final click'));
    flowCol.append(el('div', 'conn conn-exit'));
    flowCol.append(mkNode('complete', '08', 'COMPLETE', ''));

    // ── right column: stage, plain line, live ticker, score ──
    const side = el('div', 'proc-side');
    stageNameEl = el('div', 'stage-name', 'STARTING');
    stageLineEl = el('div', 'stage-line', 'Reading your inputs.');

    const feedLabel = el('div', 'score-label', 'NOW');
    feedEl = el('div', 'feed');
    feedEl.setAttribute('aria-live', 'polite');

    scoreBlockEl = el('div', 'score-block hidden');
    const scoreLabel = el('div', 'score-label', 'SCORE');
    const scoreRow   = el('div', 'score-row');
    scoreEl = el('span', 'num-120', '0');
    deltaEl = el('span', 'delta-mono', '');
    scoreRow.append(scoreEl, deltaEl);
    scoreBlockEl.append(scoreLabel, scoreRow);
    side.append(stageNameEl, stageLineEl, feedLabel, feedEl, scoreBlockEl);

    grid.append(flowCol, side);
    container.append(grid);

    // the red stop-sign block, hidden until a real failed decision
    whyEl = el('div', 'why hidden');
    container.append(whyEl);

    // finish panel, hidden until the real stop event
    finishEl = el('div', 'finish hidden');
    container.append(finishEl);
  }

  function setLapNum(text) {
    const n = lapNumEl?.querySelector('.num-120');
    if (n) n.textContent = text;
  }

  function renderWhy(failed, nextLap) {
    if (!whyEl) return;
    whyEl.classList.remove('hidden');
    whyEl.innerHTML = `
      <div class="why-label">VERIFICATION FAILED — ${failed.length} CHECK${failed.length !== 1 ? 'S' : ''} OPEN</div>
      <ul>${failed.map(c =>
        `<li>${esc(c.id)} · ${esc(c.name)}${c.evidence ? ` — ${esc(c.evidence)}` : ''}</li>`
      ).join('')}</ul>
      <div class="why-kicker">THESE ${failed.length} BECOME LAP ${nextLap}'S FIX LIST</div>`;
  }
  function hideWhy() { whyEl?.classList.add('hidden'); }

  /* ── EVENT HANDLERS — real events only ──────────────────────────── */

  function onSetupStart(ev) {
    setNode('mission', 'wait');
    setStageName('MISSION');
    setLine(ev.step === 'jd' ? 'Reading the job posting.' : 'Reading your resume.');
    pushFeed('MISSION', ev.step === 'jd' ? 'Reading the job posting' : 'Reading your resume', 'info');
  }

  function onSetupDone(ev) {
    pushFeed('MISSION', ev.step === 'jd' ? 'Job posting parsed' : 'Resume parsed', 'ok');
    if (ev.step === 'resume') {
      setNode('mission', 'done');
      setLine('Mission understood. First check comes next.');
    }
  }

  function onGuardCheck(ev) {
    setNode('guard', 'done');
    if (descEls.guard) {
      descEls.guard.textContent =
        `LAP ${ev.n}/${ev.max} · ${ev.apiCalls} CALLS · ` +
        `${Math.round(ev.elapsedMs / 1000)}S · ` +
        (ev.ok ? 'WITHIN BUDGET' : 'BUDGET REACHED');
    }
    pushFeed('GUARD', `Lap ${ev.n}/${ev.max} · ${ev.apiCalls} calls · ${Math.round(ev.elapsedMs / 1000)}s — ${ev.ok ? 'within budget' : 'budget reached'}`, 'ok');
  }

  function onVerifyStart(ev) {
    setNode('critic', 'wait');
    setStageName('CRITIC');
    setLine(ev.n === 0
      ? 'Scoring the original resume against 9 named checks.'
      : 'An independent critic reads the new draft. It has no memory of the writer.');
    pushFeed('CRITIC', ev.n === 0 ? 'Scoring the original resume' : 'Checking the new draft against 9 rules', 'yellow');
  }

  function onVerifyDone(ev) {
    setNode('critic', 'done');
    const checks = arr(ev.data?.checks);
    const failed = checks.filter(c => !c.pass);
    const score  = ev.score ?? 0;
    updateScore(score, ev.n === 0 ? null : currentScore);
    setLine(ev.n === 0
      ? `The original scores ${score}. ${failed.length} of 9 checks fail — that is the starting grid.`
      : failed.length === 0
        ? `All 9 checks pass. Score ${score}.`
        : `Score ${score}. ${failed.length} check${failed.length !== 1 ? 's' : ''} still open.`);
    pushFeed('CRITIC', `Verdict: score ${score} — ${failed.length ? failed.length + ' of 9 failing' : 'all 9 pass'}`, failed.length ? 'red' : 'ok');
  }

  function onIterStart(ev) {
    maxIter = ev.max;
    hideWhy();
    setLoopEdge(false);
    // a new trip around the circle: inner stages reset to outline
    setNode('brain', 'wait');
    setNode('tool', 'idle');
    setNode('critic', 'idle');
    setNode('decide', 'idle');
    setChip(memChipEl, 'idle');
    setChip(errChipEl, 'idle');
    setLapNum(String(ev.n).padStart(2, '0'));
    setStageName(`LAP ${ev.n} OF ${ev.max}`);
    const n = arr(ev.failedChecks).length;
    setLine(`The brain takes the ${n} failed check${n !== 1 ? 's' : ''} as this lap's fix list.`);
    pushFeed('BRAIN', `Lap ${ev.n} begins — fix list: ${n} failed check${n !== 1 ? 's' : ''}`, 'blue');
  }

  function onDoStart() {
    setNode('brain', 'done');
    setNode('tool', 'wait');
    setStageName('TOOL');
    setLine('The rewrite call is running — only what the failed checks name.');
    pushFeed('TOOL', 'Rewriting the resume from the fix list', 'blue');
  }

  function onDoDone(ev) {
    setNode('tool', 'done');
    setChip(memChipEl, 'on');       // results really are saved: draft + changelog
    const changes = arr(ev.data?.changesMade);
    const first   = changes[0];
    const text    = first ? (typeof first === 'object' ? first.change : first) : 'Resume revised.';
    setLine(`${text}${changes.length > 1 ? ` (+${changes.length - 1} more changes)` : ''}`);
    pushFeed('TOOL', `Draft ready — ${changes.length || 1} change${changes.length !== 1 ? 's' : ''} saved to memory`, 'ok');
  }

  function onDecideDone(ev) {
    setStageName('DECIDE');
    const failed = arr(ev.failedChecks);

    if (ev.decision === 'stop') {
      setNode('decide', 'done');
      setLine(ev.stopReason || 'Halting.');
      pushFeed('DECIDE', ev.stopReason || 'Stop', 'ok');
    } else {
      setNode('decide', 'on');      // the red block: not done
      setLoopEdge(true);            // the send-back arc lights red
      setLine(`Not done. The critic found ${failed.length} problem${failed.length !== 1 ? 's' : ''} — they continue around the circle as the next fix list.`);
      renderWhy(failed, ev.n + 1);
      pushFeed('DECIDE', `Not done — sending ${failed.length} failure${failed.length !== 1 ? 's' : ''} back for lap ${ev.n + 1}`, 'red');
    }
  }

  function onStop(ev) {
    hideWhy();
    setLoopEdge(false);
    setNode('decide', 'done');
    const awaitingHuman = ev.code !== 'aborted' && ev.code !== 'error';
    if (awaitingHuman) setNode('human', 'wait');   // yellow = attention: your OK
    setStageName(awaitingHuman ? 'YOUR TURN' : 'HALTED');
    pushFeed('LOOP', stopHeadline(ev.code), awaitingHuman ? 'yellow' : 'red');
    setLine(stopMessage(ev));
    if (ev.iterations > 0) setLapNum(String(ev.iterations).padStart(2, '0'));
    if (finishEl) {
      finishEl.classList.remove('hidden');
      finishEl.innerHTML = `
        <div class="finish-head">${esc(stopHeadline(ev.code))}</div>
        <div class="finish-reason">${esc(stopMessage(ev))}${awaitingHuman
          ? (ev.code === 'perfect' || ev.code === 'target'
              ? ' The critic has signed off — the final OK is yours, below.'
              : ' Review what is left and give the final OK below.') : ''}</div>
        <div class="finish-journey">${arr(ev.history).map(h => h.score).join(' → ')}</div>`;
    }
  }

  function onPhaseStart(ev) {
    if (ev.phase !== 'polish') return;
    setStageName('POLISH');
    setLine('A final proofread — wording only, no new facts or keywords.');
  }
  function onPhaseDone(ev) {
    if (ev.phase !== 'polish') return;
    setLine(ev.data?.skipped ? 'Polish skipped — the last scored draft stands.' : 'Polish done. The score is unchanged.');
  }

  function onGapsStart() { setLine('Writing the honest gap report.'); }
  function onGapsDone()  { setLine('Gap report ready — it is on the result page.'); }

  function onNote(ev) { if (ev.text) setLine(ev.text); }

  /* the crashed-tool path, made visible: error captured → sent back → retry.
     Every wire event narrates itself — this IS the try/fail/retry rhythm. */
  function onApi(ev) {
    const tag = STAGE_LABEL[ev.stage] || 'API';
    if (ev.kind === 'request') {
      setChip(errChipEl, 'idle');
      pushFeed(tag, `Calling the API${ev.attempt ? ` — attempt ${ev.attempt + 1}` : ''}`, 'info');
    } else if (ev.kind === 'response' && ev.ok) {
      pushFeed(tag, `Reply received in ${(ev.ms / 1000).toFixed(1)}s`, 'ok');
    } else if (ev.kind === 'response') {
      pushFeed(tag, `Call failed — HTTP ${ev.status}`, 'red');
    } else if (ev.kind === 'retry') {
      setChip(errChipEl, 'on');
      setLine(`A call crashed (HTTP ${ev.status || '?'}). Error captured and sent back — retry ${ev.attempt} of ${ev.max}.`);
      pushFeed(tag, `Error captured — retrying in ${Math.round(ev.waitMs / 1000)}s (attempt ${ev.attempt}/${ev.max})`, 'red');
    } else if (ev.kind === 'parse-fail') {
      pushFeed(tag, 'Reply was invalid JSON — sending the error back to the model to fix', 'red');
    } else if (ev.kind === 'parsed') {
      pushFeed(tag, 'Reply is valid JSON', 'ok');
    }
  }

  /* ── PUBLIC SURFACE ─────────────────────────────────────────────── */
  return {
    reset(settings) {
      maxIter = settings.maxIterations;
      currentScore = null;
      buildDOM();
    },
    finish() {},
    /* the human's real click on "give final OK" — the diagram's last gate */
    humanApproved() {
      setNode('human', 'done');
      setNode('complete', 'done');
      setLoopEdge(false);
      pushFeed('HUMAN', 'Final OK given — task complete', 'ok');
    },
    handle(ev) {
      switch (ev.type) {
        case 'setup:start':  return onSetupStart(ev);
        case 'setup:done':   return onSetupDone(ev);
        case 'guard:check':  return onGuardCheck(ev);
        case 'api':          return onApi(ev);
        case 'verify:start': return onVerifyStart(ev);
        case 'verify:done':  return onVerifyDone(ev);
        case 'iter:start':   return onIterStart(ev);
        case 'do:start':     return onDoStart(ev);
        case 'do:done':      return onDoDone(ev);
        case 'decide:done':  return onDecideDone(ev);
        case 'stop':         return onStop(ev);
        case 'phase:start':  return onPhaseStart(ev);
        case 'phase:done':   return onPhaseDone(ev);
        case 'gaps:start':   return onGapsStart(ev);
        case 'gaps:done':    return onGapsDone(ev);
        case 'note':         return onNote(ev);
      }
    }
  };
}
