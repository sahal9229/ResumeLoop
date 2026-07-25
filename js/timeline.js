/* ═══════════════════════════════════════════════════════════════════════
   timeline.js — v4 Technical Log (Page 2, TECHNICAL LOG tab).

   TERMINAL RE-SKIN: markup and class names only. Event subscriptions,
   handler logic and render triggers are byte-for-byte the same shape
   as before — this file is a lens on the event stream, never a source.

   Each lap renders: [LAP N panel]
                       [DO]     — what the worker fixed
                       [VERIFY] — the 9-check verdict with evidence
                       [DECIDE] — the deterministic decision
                     [WHY ANOTHER LAP?] panel (only if decision === 'loop')
   ═══════════════════════════════════════════════════════════════════════ */

import { $, el, esc, arr, clamp } from './dom.js?v=4';
import { CHECK_DEFS } from './prompts.js?v=4';

/* per-phase presentation — bracketed labels, one accent */
const PHASE_META = {
  do:     { label: '[DO]',     cls: 't-acc'  },
  verify: { label: '[VERIFY]', cls: 't-dim'  },
  decide: { label: '[DECIDE]', cls: 't-dim'  },
  polish: { label: '[POLISH]', cls: 't-dim'  }
};

const SETUP_META = {
  jd:     { running: 'PARSING JOB DESCRIPTION', done: 'JOB DESCRIPTION PARSED' },
  resume: { running: 'PARSING RESUME',          done: 'RESUME PARSED'          }
};

const STAGE_LABEL = {
  jd: 'jd-extractor', resume: 'resume-parser',
  verify: 'verifier', do: 'worker', polish: 'polisher', gaps: 'gap-report'
};

const kb = bytes => (bytes / 1024).toFixed(1) + 'KB';

/* bracket tags replace pill chips */
export function chip(text, tone = 'neutral') {
  const cls = tone === 'ok' ? 't-tag t-tag-ok' : tone === 'bad' || tone === 'warn' ? 't-tag t-tag-open'
            : tone === 'gained' ? 't-tag t-tag-acc' : 't-tag';
  return `<span class="${cls}">${esc(text)}</span>`;
}
export function chips(list, tone, limit = 40) {
  const items = arr(list).slice(0, limit);
  if (!items.length) return '<span class="t-small t-faint">none</span>';
  return `<div class="flex flex-wrap gap-1">${items.map(k => chip(k, tone)).join('')}</div>`;
}

/* score meter — text blocks, real value only */
const METER_W = 24;
export function setGauge(gaugeEl, scoreEl, score) {
  const s = clamp(score, 0, 100);
  scoreEl.textContent = String(s).padStart(3, '0');
  const blocks = gaugeEl.querySelector('.t-meter-blocks');
  if (blocks) {
    const on = Math.round((s / 100) * METER_W);
    blocks.innerHTML = esc('█'.repeat(on)) + `<span class="off">${esc('░'.repeat(METER_W - on))}</span>`;
  }
}

/* ── 9-check grid for verify panels ──────────────────────────────── */
function checksHTML(checks) {
  if (!checks?.length) return '<p class="t-small t-faint">no check data.</p>';
  return `<div class="check-grid">${checks.map(c => `
    <div class="check-row-tl ${c.pass ? 'check-pass-tl' : 'check-fail-tl'}" title="${esc(c.evidence || '')}">
      <span class="check-icon-tl">[${c.pass ? '✓' : '✗'}]</span>
      <span class="check-name-tl">${esc(c.name)}</span>
      ${!c.pass && c.evidence ? `<span class="check-evid-tl">└ ${esc(c.evidence)}</span>` : ''}
    </div>`).join('')}</div>`;
}

/* ── score delta line — mono blocks, no gradients ────────────────── */
function deltaBar(prev, now) {
  const delta = now - prev;
  const isFirst = prev === null;
  const on = Math.round((clamp(now, 0, 100) / 100) * METER_W);
  return `
    <div class="flex items-center gap-3 t-small">
      ${isFirst ? '<span class="t-faint">BASELINE</span>'
                : `<span class="t-faint">${prev}</span><span class="t-faint">→</span>`}
      <span class="t-body font-extrabold">${now}</span>
      ${isFirst ? '' : `<span class="t-tag ${delta >= 0 ? 't-tag-ok' : 't-tag-open'}">${delta >= 0 ? '+' : ''}${delta}</span>`}
    </div>
    <div class="t-meter-blocks mt-1" aria-hidden="true">${esc('█'.repeat(on))}<span class="off">${esc('░'.repeat(METER_W - on))}</span></div>`;
}

const pulseLine = text =>
  el('div', 'flex items-center gap-2 t-small t-acc',
    `<span class="pulse-dot" aria-hidden="true"></span>${esc(text)}`);

/* ═══════════════════════════════════════════════════════════════════════
   createProcessView — the Technical Log
   ═══════════════════════════════════════════════════════════════════════ */
export function createProcessView() {
  const timeline = $('timeline');
  let maxIterations = 5;
  let setupCards = {};
  let iterCards  = {};    // n → card
  let baselineCard = null;
  let polishCard   = null;
  let stopCard     = null;
  let noteEl       = null;
  let currentBody  = null;

  /* ── panel factory ─────────────────────────────────────────────── */
  function makeCard({ title, sub }) {
    const root = el('article', 'card-in t-panel');
    const head = el('div', 'flex items-center gap-3 border-b border-line px-4 py-2.5');
    const stateSlot = el('span', 'ml-auto flex items-center gap-2');
    head.append(
      el('div', 'min-w-0', `
        <div class="truncate t-small font-extrabold t-caps">${esc(title)}</div>
        ${sub ? `<div class="t-small t-faint">${esc(sub)}</div>` : ''}`),
      stateSlot
    );
    const body = el('div', 'space-y-3 px-4 py-3.5');
    root.append(head, body);
    timeline.append(root);
    root.scrollIntoView({ block: 'end', behavior: 'smooth' });
    const card = { root, head, stateSlot, body, drawer: null, titleEl: head.children[0] };
    setRunning(card);
    return card;
  }

  function setRunning(card) {
    card.root.classList.add('t-running');
    card.root.style.borderColor = '#FFB000';
    card.stateSlot.innerHTML = '<span class="t-tag t-tag-open">RUN</span>';
    currentBody = card.body;
  }
  function setDone(card, badgeHTML = '') {
    card.root.classList.remove('t-running');
    card.root.style.borderColor = '';
    card.stateSlot.innerHTML = badgeHTML + '<span class="t-tag t-tag-ok">[✓]</span>';
  }
  function setFailed(card) {
    if (!card || !card.root.classList.contains('t-running')) return;
    card.root.classList.remove('t-running');
    card.root.style.borderColor = '#FFB000';
    card.stateSlot.innerHTML = '<span class="t-tag t-tag-open">[✗]</span>';
    card.body.querySelectorAll('.pulse-dot').forEach(d => d.parentElement?.remove());
  }

  function addRaw(card, label, raw) {
    if (!card.drawer) {
      card.drawer = el('details', 'hood',
        '<summary class="px-3 py-2 t-small">[+] raw model json</summary>');
      card.body.append(card.drawer);
    }
    card.drawer.append(el('div', 'border-t border-line px-3 py-2', `
      <div class="mb-1 t-small t-faint t-caps">${esc(label)}</div>
      <pre class="nice-scroll max-h-64 overflow-auto whitespace-pre-wrap break-words t-small t-dim">${esc(String(raw))}</pre>`));
    card.body.append(card.drawer);
  }

  function phaseBlock(card, kind) {
    const meta = PHASE_META[kind];
    const block = el('div', 'border-l-2 pl-3.5 border-line');
    if (kind === 'do') block.style.borderLeftColor = '#FFB000';
    block.innerHTML = `<div class="mb-1.5 t-small font-extrabold ${meta.cls}">${esc(meta.label)}</div>`;
    const content = el('div', 't-small leading-relaxed');
    block.append(content);
    card.drawer ? card.body.insertBefore(block, card.drawer) : card.body.append(block);
    block._content = content;
    return block;
  }

  /* ── wire log ─────────────────────────────────────────────────── */
  function apiLog(ev) {
    if (!currentBody) return;
    let log = currentBody.querySelector(':scope > .api-log');
    if (!log) {
      log = el('div', 'api-log space-y-0.5 px-3 py-2 t-small t-faint');
      log.innerHTML = '<div class="t-small t-faint t-caps">── api wire ──</div>';
      currentBody.append(log);
    }
    const stage = STAGE_LABEL[ev.stage] || ev.stage;
    let line = '';
    if (ev.kind === 'request')    line = `<span class="t-acc">→</span> POST ${esc(ev.provider)} · ${esc(ev.model)} · ${esc(stage)} (${kb(ev.bytes)})${ev.attempt ? ` · attempt ${ev.attempt + 1}` : ''}`;
    else if (ev.kind === 'response' && ev.ok) line = `<span class="t-dim">←</span> ${ev.status} OK in ${(ev.ms/1000).toFixed(1)}s · ${kb(ev.bytes)}`;
    else if (ev.kind === 'response') line = `<span class="t-acc">←</span> HTTP ${ev.status} in ${(ev.ms/1000).toFixed(1)}s`;
    else if (ev.kind === 'retry')  line = `<span class="t-acc">⟳</span> retry in ${Math.round(ev.waitMs/1000)}s (attempt ${ev.attempt}/${ev.max})`;
    else if (ev.kind === 'parsed') line = `<span class="t-dim">[✓]</span> json valid — ${esc(ev.fields)}`;
    else if (ev.kind === 'parse-fail') line = `<span class="t-acc">[✗]</span> invalid json — re-asking`;
    else return;
    log.append(el('div', '', line));
    const allCards = [...Object.values(setupCards), baselineCard, ...Object.values(iterCards), polishCard, stopCard];
    const ownerCard = allCards.filter(Boolean).find(c => c.body === currentBody);
    if (ownerCard?.drawer) currentBody.append(ownerCard.drawer);
  }

  function showNote(text) {
    clearNote();
    if (!currentBody) return;
    noteEl = el('div', 'flex items-center gap-2 t-well px-3 py-2 t-small',
      `<span class="t-acc">[WAIT]</span><span class="t-dim">${esc(text)}</span>`);
    noteEl.style.borderColor = '#FFB000';
    currentBody.append(noteEl);
  }
  function clearNote() { noteEl?.remove(); noteEl = null; }

  /* ── sticky status bar ────────────────────────────────────────── */
  function setStatus(text, tone = 'run') {
    const dot = $('statusDot');
    dot.className = 'pulse-dot';
    dot.style.animationPlayState = tone === 'run' ? 'running' : 'paused';
    dot.style.background = tone === 'run' ? '#FFB000' : tone === 'ok' ? '#E8E8E3' : '#FFB000';
    $('statusText').textContent = text;
  }
  function setIterProgress(n) {
    $('iterLabel').textContent = `LAP ${n}/${maxIterations}`;
    $('iterBar').style.width = clamp((n / maxIterations) * 100, 0, 100) + '%';
  }

  /* ── event handlers ───────────────────────────────────────────── */

  const onSetupStart = ev => {
    const meta = SETUP_META[ev.step];
    if (!meta) return;
    setupCards[ev.step] = makeCard({ title: meta.running, sub: 'setup — runs once, before the loop' });
    setStatus(meta.running);
  };

  const onSetupDone = ev => {
    const card = setupCards[ev.step];
    const meta = SETUP_META[ev.step];
    if (!card || !meta) return;
    card.titleEl.querySelector('div').textContent = meta.done;
    clearNote();
    if (ev.step === 'jd') {
      const d = ev.data;
      card.body.prepend(el('div', 'space-y-2.5 t-small', `
        <p><b>${esc(d.role || 'ROLE')}</b> <span class="t-dim">· experience asked: ${esc(d.yearsRequired || 'n/a')}</span></p>
        <div><div class="mb-1 t-small t-faint t-caps">must-haves</div>${chips(d.mustHaves, 'warn')}</div>
        <div><div class="mb-1 t-small t-faint t-caps">ats keywords</div>${chips(d.keywords, 'neutral', 25)}</div>`));
    }
    if (ev.step === 'resume') {
      const d = ev.data;
      card.body.prepend(el('div', 'space-y-2 t-small', `
        <p class="t-dim">${arr(d.sections).length} sections · ${arr(d.bullets).length} bullets · ${arr(d.skills).length} skills</p>
        ${chips(d.sections, 'neutral')}`));
    }
    addRaw(card, meta.done, ev.raw);
    setDone(card);
  };

  /* Baseline and iteration verify share one handler */
  const onVerifyStart = ev => {
    if (ev.n === 0) {
      baselineCard = makeCard({ title: 'VERIFY 00 — ORIGINAL RESUME',
        sub: 'the starting wall of [✗] — laps exist to flip these' });
      setStatus('CHECKING ORIGINAL…');
    } else {
      const card = iterCards[ev.n];
      if (!card) return;
      const block = phaseBlock(card, 'verify');
      block._content.append(pulseLine('independent verifier reading the new draft…'));
      card._verify = block;
      setStatus('VERIFYING…');
    }
  };

  const onVerifyDone = ev => {
    clearNote();
    const checks = arr(ev.data?.checks);
    const score  = ev.score ?? 0;
    const failed = checks.filter(c => !c.pass);

    if (ev.n === 0) {
      if (!baselineCard) return;
      baselineCard.titleEl.querySelector('div').textContent = 'VERIFY 00 — ORIGINAL RESUME';
      baselineCard.body.prepend(el('div', 'space-y-3 t-small', `
        ${deltaBar(null, score)}
        <p class="t-faint">${failed.length}/9 checks failing. each lap exists to flip [✗] to [✓].</p>
        ${checksHTML(checks)}`));
      addRaw(baselineCard, 'verifier · baseline', ev.raw);
      setDone(baselineCard, `<span class="t-tag mr-1">${score}</span>`);
      setGauge($('gaugeP'), $('gScoreP'), score);
      setStatus(`BASELINE ${score} · ${failed.length}/9 FAILING`);
    } else {
      const card = iterCards[ev.n];
      if (!card?._verify) return;
      card._verify._content.innerHTML = '';
      card._verify._content.innerHTML = checksHTML(checks);
      addRaw(card, `verifier · lap ${ev.n}`, ev.raw);
      setGauge($('gaugeP'), $('gScoreP'), score);
    }
  };

  const onIterStart = ev => {
    const card = makeCard({ title: `LAP ${String(ev.n).padStart(2, '0')}/${String(ev.max).padStart(2, '0')}`,
      sub: `${ev.failedChecks?.length || 0} checks to fix` });
    iterCards[ev.n] = card;
    setIterProgress(ev.n - 1);
    const toDo = arr(ev.failedChecks);
    if (toDo.length) {
      card.body.append(el('div', 'border-l-2 border-line pl-3.5', `
        <div class="mb-1.5 t-small font-extrabold t-dim">[TODO]</div>
        <ul class="space-y-1 t-small">${toDo.map(c =>
          `<li class="flex gap-2"><span class="t-acc font-extrabold">✗</span><span><b>${esc(c.id)}</b> <span class="t-dim">${esc(c.name)}${c.evidence ? ' — ' + esc(c.evidence) : ''}</span></span></li>`
        ).join('')}</ul>`));
    }
  };

  const onDoStart = ev => {
    const card = iterCards[ev.n];
    if (!card) return;
    const block = phaseBlock(card, 'do');
    block._content.append(pulseLine('worker revising the resume…'));
    card._do = block;
    setStatus('REVISING…');
  };

  const onDoDone = ev => {
    const card = iterCards[ev.n];
    if (!card?._do) return;
    clearNote();
    const changes = arr(ev.data?.changesMade);
    const refused = arr(ev.data?.couldNotDo);
    card._do._content.innerHTML = `
      <ul class="list-none space-y-1">
        ${changes.map(c => {
          const fixId  = typeof c === 'object' ? (c.fixes || '') : '';
          const change = typeof c === 'object' ? (c.change || c) : c;
          return `<li class="flex gap-2 t-small">
            ${fixId ? `<span class="t-tag flex-none">${esc(fixId)}</span>` : ''}
            <span>${esc(String(change))}</span></li>`;
        }).join('')}
      </ul>
      ${refused.length ? `<p class="mt-1.5 t-small t-acc">[REFUSED — would be fabrication] ${refused.map(esc).join(' · ')}</p>` : ''}`;
    addRaw(card, `worker · lap ${ev.n}`, ev.raw);
  };

  const onDecideDone = ev => {
    const card = iterCards[ev.n];
    if (!card) return;

    const block = phaseBlock(card, 'decide');
    const failed = arr(ev.failedChecks);
    if (ev.decision === 'stop') {
      block._content.innerHTML = `<p class="font-bold">[HALT] ${esc(ev.stopReason)}</p>`;
    } else {
      block._content.innerHTML = `
        <p class="t-dim">loop again — ${failed.length} check${failed.length !== 1 ? 's' : ''} open:</p>
        <ul class="mt-1 space-y-0.5 t-small">${failed.map(c =>
          `<li class="flex gap-2"><span class="t-acc font-extrabold">✗</span><span><b>${esc(c.id)}</b> <span class="t-dim">${esc(c.evidence || c.name)}</span></span></li>`
        ).join('')}</ul>`;
    }

    setIterProgress(ev.n);
    const delta = ev.score - (card._prevScore ?? ev.score);
    setDone(card, `<span class="t-tag ${delta >= 0 ? 't-tag-ok' : 't-tag-open'} mr-1">${delta >= 0 ? '+' : ''}${delta}</span>`);

    // "Why another lap?" — a separate panel between iteration groups
    if (ev.decision === 'loop' && failed.length > 0) {
      const whyCard = el('article', 'card-in t-well px-4 py-3');
      whyCard.style.borderLeft = '2px solid #FFB000';
      whyCard.innerHTML = `
        <div class="mb-2 t-small font-extrabold t-acc t-caps">why another lap?</div>
        <ul class="space-y-1 t-small">${failed.map(c =>
          `<li class="flex gap-2">
            <span class="flex-none t-acc font-extrabold">✗</span>
            <span><b>${esc(c.name)}</b>${c.evidence ? ` <span class="t-dim">— ${esc(c.evidence)}</span>` : ''}</span>
          </li>`
        ).join('')}</ul>
        <p class="mt-2.5 t-small t-dim">
          these ${failed.length} failure${failed.length !== 1 ? 's' : ''} are lap ${ev.n + 1}'s to-do list. that is the loop.
        </p>`;
      timeline.append(whyCard);
      whyCard.scrollIntoView({ block: 'end', behavior: 'smooth' });
    }
  };

  const onIterDone = ev => {
    const card = iterCards[ev.n];
    if (card) card._prevScore = ev.previousScore;
    setStatus(ev.delta > 0 ? 'IMPROVING' : ev.delta < 0 ? 'DIPPED' : 'HOLDING');
  };

  const onScore = ev => {
    setGauge($('gaugeP'), $('gScoreP'), ev.score);
    if (ev.previous === null) setStatus(`BASELINE ${ev.score}`);
  };

  const onStop = ev => {
    clearNote();
    Object.values(setupCards).forEach(setFailed);
    Object.values(iterCards).forEach(setFailed);
    if (baselineCard && baselineCard.root.classList.contains('t-running')) setFailed(baselineCard);

    const style = {
      perfect: { tone: 'ok',  head: 'HALT — ALL 9 CHECKS PASS' },
      target:  { tone: 'ok',  head: 'HALT — TARGET SCORE REACHED' },
      max:     { tone: 'run', head: 'HALT — MAX ITERATIONS' },
      plateau: { tone: 'run', head: 'HALT — NO PROGRESS, SAME CHECKS TWICE' },
      aborted: { tone: 'bad', head: 'HALT — STOPPED BY OPERATOR' },
      error:   { tone: 'bad', head: 'HALT — ERROR' }
    }[ev.code] || { tone: 'bad', head: 'HALT' };

    stopCard = makeCard({ title: style.head,
      sub: `${ev.iterations} lap${ev.iterations !== 1 ? 's' : ''} run` });
    stopCard.root.style.borderColor = ev.code === 'perfect' || ev.code === 'target' ? '#E8E8E3' : '#FFB000';
    stopCard.body.append(el('div', 't-small space-y-2', `
      <p class="font-bold">${esc(ev.reason)}</p>
      <p class="t-dim">score journey: ${ev.history.map(h => h.score).join(' → ')}
        <span class="t-tag t-tag-ok ml-1">${ev.score - (ev.baseline ?? 0) >= 0 ? '+' : ''}${ev.score - (ev.baseline ?? 0)} overall</span></p>`));

    setDone(stopCard);
    setStatus(style.head, style.tone);
    setGauge($('gaugeP'), $('gScoreP'), ev.score);
    $('stopBtn').disabled = true;
  };

  /* Polish phase (unchanged behavior) */
  const onPhaseStart = ev => {
    if (ev.phase !== 'polish') return;
    polishCard = makeCard({ title: 'FINAL POLISH',
      sub: 'proofreading only — grammar, tense, parallelism. no new facts or keywords.' });
    setStatus('POLISHING…');
  };
  const onPhaseDone = ev => {
    if (ev.phase !== 'polish') return;
    if (!polishCard) return;
    clearNote();
    const d = ev.data || {};
    const edits = arr(d.editsMade);
    const skipped = !!d.skipped;
    polishCard.body.append(el('div', 'space-y-3 t-small', `
      <div class="border-l-2 border-line pl-3.5">
        <div class="mb-1.5 t-small font-extrabold t-dim">[POLISH]</div>
        ${skipped
          ? `<p class="t-acc">[SKIPPED] ${esc(d.reason || '')} — resume is the last scored draft.</p>`
          : edits.length
            ? `<ul class="list-none space-y-1">${edits.map(e => `<li class="flex gap-2"><span class="t-faint">·</span><span>${esc(e)}</span></li>`).join('')}</ul>`
            : '<p class="t-faint">no edits needed — draft was already clean.</p>'}
        <p class="mt-2 t-well px-3 py-2 t-small t-dim">
          score unchanged at ${esc(String(d.finalScore ?? '—'))} — polish edits wording only. no re-scoring.
        </p>
      </div>`));
    addRaw(polishCard, 'polisher · final pass', ev.raw);
    setDone(polishCard, `<span class="t-tag mr-1">${skipped ? 'SKIPPED' : 'POLISH'}</span>`);
  };

  const onGapsStart = () => {
    if (!stopCard) return;
    stopCard._gapsPulse = pulseLine('writing the honest gap report…');
    stopCard.drawer ? stopCard.body.insertBefore(stopCard._gapsPulse, stopCard.drawer) : stopCard.body.append(stopCard._gapsPulse);
  };
  const onGapsDone = ev => {
    if (!stopCard) return;
    stopCard._gapsPulse?.remove();
    const n = arr(ev.data).length;
    const line = el('p', 't-small t-dim',
      ev.data === null ? 'gap-report call failed — raw missing checks listed on the next page.'
        : `gap report ready — ${n === 0 ? 'no unfixable gaps' : `${n} gap${n !== 1 ? 's' : ''}`} on the next page.`);
    stopCard.drawer ? stopCard.body.insertBefore(line, stopCard.drawer) : stopCard.body.append(line);
    addRaw(stopCard, 'gap report', ev.raw);
  };

  /* ── public surface ───────────────────────────────────────────── */
  return {
    reset(settings) {
      maxIterations = settings.maxIterations;
      setupCards = {}; iterCards = {}; baselineCard = null; polishCard = null; stopCard = null;
      noteEl = null; currentBody = null;
      timeline.innerHTML = '';
      timeline.setAttribute('aria-busy', 'true');
      setGauge($('gaugeP'), $('gScoreP'), 0);
      $('gScoreP').textContent = '—';
      $('iterBar').style.width = '0%';
      $('iterLabel').textContent = `LAP 0/${maxIterations}`;
      setStatus('STARTING…');
      $('stopBtn').disabled = false;
    },
    finish() { timeline.setAttribute('aria-busy', 'false'); },
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
        case 'iter:done':    return onIterDone(ev);
        case 'score':        return onScore(ev);
        case 'api':          return apiLog(ev);
        case 'note':         return showNote(ev.text);
        case 'stop':         return onStop(ev);
        case 'phase:start':  return onPhaseStart(ev);
        case 'phase:done':   return onPhaseDone(ev);
        case 'gaps:start':   return onGapsStart(ev);
        case 'gaps:done':    return onGapsDone(ev);
      }
    }
  };
}
