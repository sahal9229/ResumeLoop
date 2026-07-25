/* ═══════════════════════════════════════════════════════════════════════
   timeline.js — v4 Technical View (Page 2, ⚙️ Technical View tab).

   Handles the new v4 event stream: do:start/done, verify:start/done,
   decide:done — plus the unchanged setup, polish, gaps, stop handlers.

   Each lap renders: [Iteration N card]
                       🛠 Do — what the worker fixed
                       🔍 Verify — the 9-check verdict with evidence
                       ⚖️ Decide — the deterministic decision
                     [Why another lap? card] (only if decision === 'loop')
   ═══════════════════════════════════════════════════════════════════════ */

import { $, el, esc, arr, clamp } from './dom.js?v=4';
import { CHECK_DEFS } from './prompts.js?v=4';

/* per-phase styling */
const PHASE_META = {
  do:     { label: '🛠 Do',     border: 'border-warn',           text: 'text-amber-300'   },
  verify: { label: '🔍 Verify', border: 'border-info',           text: 'text-sky-300'     },
  decide: { label: '⚖️ Decide', border: 'border-brand-violet',   text: 'text-violet-300'  },
  polish: { label: '✨ Final Polish', border: 'border-fuchsia-400/60', text: 'text-fuchsia-300' }
};

const SETUP_META = {
  jd:       { icon: '📄', running: 'Parsing job description…',    done: 'Job description parsed' },
  resume:   { icon: '🧾', running: 'Parsing resume…',              done: 'Resume understood'      },
};

const STAGE_LABEL = {
  jd: 'JD extractor', resume: 'Resume parser',
  verify: 'Verifier', do: 'Worker', polish: 'Polisher', gaps: 'Gap report'
};

const kb     = bytes => (bytes / 1024).toFixed(1) + ' KB';
const CHIP   = {
  ok:      'border-ok/30 bg-ok/10 text-emerald-300',
  bad:     'border-bad/30 bg-bad/10 text-rose-300',
  warn:    'border-warn/30 bg-warn/10 text-amber-300',
  info:    'border-info/30 bg-info/10 text-sky-300',
  neutral: 'border-line bg-raised text-ink-muted',
  gained:  'border-ok bg-ok font-bold text-slate-900'
};

export function chip(text, tone = 'neutral') {
  return `<span class="inline-flex items-center rounded-full border px-2.5 py-0.5 font-mono text-[11px] ${CHIP[tone]}">${esc(text)}</span>`;
}
export function chips(list, tone, limit = 40) {
  const items = arr(list).slice(0, limit);
  if (!items.length) return '<span class="text-xs text-ink-faint">none</span>';
  return `<div class="flex flex-wrap gap-1.5">${items.map(k => chip(k, tone)).join('')}</div>`;
}
export function scoreColor(score) {
  return score >= 80 ? '#10B981' : score >= 55 ? '#F59E0B' : '#F43F5E';
}
export function setGauge(gaugeEl, scoreEl, score) {
  gaugeEl.style.setProperty('--p', clamp(score, 0, 100));
  gaugeEl.style.setProperty('--c', scoreColor(score));
  scoreEl.textContent = score;
}

/* ── 9-check grid for verify cards ───────────────────────────────── */
function checksHTML(checks) {
  if (!checks?.length) return '<p class="text-xs text-ink-faint">No check data.</p>';
  return `<div class="check-grid">${checks.map(c => `
    <div class="check-row-tl ${c.pass ? 'check-pass-tl' : 'check-fail-tl'}" title="${esc(c.evidence || '')}">
      <span class="check-icon-tl">${c.pass ? '✓' : '✗'}</span>
      <span class="check-name-tl">${esc(c.name)}</span>
      ${!c.pass && c.evidence ? `<span class="check-evid-tl">${esc(c.evidence)}</span>` : ''}
    </div>`).join('')}</div>`;
}

/* ── score delta bar ──────────────────────────────────────────────── */
function deltaBar(prev, now) {
  const delta = now - prev;
  const isFirst = prev === null;
  return `
    <div class="flex items-center gap-2.5 font-mono text-xs">
      ${isFirst ? '<span class="text-ink-faint">starting at</span>'
                : `<span class="text-ink-faint">${prev}</span><span class="text-ink-faint">→</span>`}
      <span class="text-base font-bold text-emerald-300">${now}</span>
      ${isFirst ? '' : `<span class="rounded-full border px-2 py-0.5 text-[11px] font-bold
          ${delta >= 0 ? 'border-ok/30 bg-ok/10 text-emerald-300' : 'border-bad/30 bg-bad/10 text-rose-300'}">
          ${delta >= 0 ? '+' : ''}${delta}</span>`}
    </div>
    <div class="relative mt-2 h-2 overflow-hidden rounded-full bg-raised">
      ${isFirst ? '' : `<div class="absolute inset-y-0 left-0 rounded-full bg-slate-600/50" style="width:${clamp(prev,0,100)}%"></div>`}
      <div class="bar-fill relative h-full rounded-full bg-gradient-to-r from-ok to-info" style="width:${clamp(now,0,100)}%"></div>
    </div>`;
}

const pulseLine = text =>
  el('div', 'flex items-center gap-2 font-mono text-xs text-amber-300',
    `<span class="pulse-dot h-2 w-2 rounded-full bg-warn"></span>${esc(text)}`);

/* ═══════════════════════════════════════════════════════════════════════
   createProcessView — the Technical View (tab ⚙️)
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

  /* ── card factory ──────────────────────────────────────────────── */
  function makeCard({ icon, title, sub, accent = '' }) {
    const root = el('article', `card-in overflow-hidden rounded-2xl border border-line bg-surface shadow-lg shadow-black/20 transition-all ${accent}`);
    const head = el('div', 'flex items-center gap-3 border-b border-line bg-raised/60 px-4 py-3');
    const stateSlot = el('span', 'ml-auto flex items-center gap-2');
    head.append(
      el('span', 'text-lg leading-none', icon),
      el('div', 'min-w-0', `
        <div class="truncate text-sm font-semibold">${esc(title)}</div>
        ${sub ? `<div class="font-mono text-[11px] text-ink-faint">${esc(sub)}</div>` : ''}`),
      stateSlot
    );
    const body = el('div', 'space-y-3 px-4 py-3.5');
    root.append(head, body);
    timeline.append(root);
    root.scrollIntoView({ block: 'end', behavior: 'smooth' });
    const card = { root, head, stateSlot, body, drawer: null, titleEl: head.children[1] };
    setRunning(card);
    return card;
  }

  function setRunning(card) {
    card.root.classList.add('border-warn/50');
    card.stateSlot.innerHTML = '<span class="h-4 w-4 animate-spin rounded-full border-2 border-warn border-t-transparent" role="status"></span>';
    currentBody = card.body;
  }
  function setDone(card, badgeHTML = '') {
    card.root.classList.remove('border-warn/50');
    card.stateSlot.innerHTML = badgeHTML + '<span class="flex h-5 w-5 items-center justify-center rounded-full bg-ok/15 text-xs font-bold text-emerald-300">✓</span>';
  }
  function setFailed(card) {
    if (!card || !card.root.classList.contains('border-warn/50')) return;
    card.root.classList.remove('border-warn/50');
    card.root.classList.add('border-bad/40');
    card.stateSlot.innerHTML = '<span class="flex h-5 w-5 items-center justify-center rounded-full bg-bad/15 text-xs font-bold text-rose-300">✕</span>';
    card.body.querySelectorAll('.pulse-dot').forEach(d => d.parentElement?.remove());
  }

  function addRaw(card, label, raw) {
    if (!card.drawer) {
      card.drawer = el('details', 'hood rounded-xl border border-line bg-page/60',
        '<summary class="px-3 py-2 font-mono text-[11px] text-ink-faint transition-colors hover:text-info">🔍 Under the hood — raw model JSON</summary>');
      card.body.append(card.drawer);
    }
    card.drawer.append(el('div', 'border-t border-line px-3 py-2', `
      <div class="mb-1 font-mono text-[10px] uppercase tracking-widest text-ink-faint">${esc(label)}</div>
      <pre class="nice-scroll max-h-64 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-slate-400">${esc(String(raw))}</pre>`));
    card.body.append(card.drawer);
  }

  function phaseBlock(card, kind) {
    const meta = PHASE_META[kind];
    const block = el('div', `border-l-2 pl-3.5 ${meta.border}`);
    block.innerHTML = `<div class="mb-1.5 text-[11px] font-bold uppercase tracking-[0.12em] ${meta.text}">${meta.label}</div>`;
    const content = el('div', 'text-[13px] leading-relaxed text-slate-300');
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
      log = el('div', 'api-log space-y-0.5 rounded-lg border border-line bg-page/70 px-3 py-2 font-mono text-[10.5px] leading-relaxed text-ink-faint');
      log.innerHTML = '<div class="text-[9.5px] uppercase tracking-[0.15em] text-ink-faint/70">📡 API wire log</div>';
      currentBody.append(log);
    }
    const stage = STAGE_LABEL[ev.stage] || ev.stage;
    let line = '';
    if (ev.kind === 'request')    line = `<span class="text-sky-300">→</span> POST ${esc(ev.provider)} · ${esc(ev.model)} · ${esc(stage)} (${kb(ev.bytes)})${ev.attempt ? ` · attempt ${ev.attempt + 1}` : ''}`;
    else if (ev.kind === 'response' && ev.ok) line = `<span class="text-emerald-300">←</span> ${ev.status} OK in ${(ev.ms/1000).toFixed(1)}s · ${kb(ev.bytes)}`;
    else if (ev.kind === 'response') line = `<span class="text-rose-300">←</span> HTTP ${ev.status} in ${(ev.ms/1000).toFixed(1)}s`;
    else if (ev.kind === 'retry')  line = `<span class="text-amber-300">⟳</span> retrying in ${Math.round(ev.waitMs/1000)}s (attempt ${ev.attempt}/${ev.max})`;
    else if (ev.kind === 'parsed') line = `<span class="text-emerald-300">✓</span> JSON valid — ${esc(ev.fields)}`;
    else if (ev.kind === 'parse-fail') line = `<span class="text-rose-300">✗</span> reply was not valid JSON — re-asking`;
    else return;
    log.append(el('div', 'whitespace-nowrap overflow-hidden text-ellipsis', line));
    const allCards = [...Object.values(setupCards), baselineCard, ...Object.values(iterCards), polishCard, stopCard];
    const ownerCard = allCards.filter(Boolean).find(c => c.body === currentBody);
    if (ownerCard?.drawer) currentBody.append(ownerCard.drawer);
  }

  function showNote(text) {
    clearNote();
    if (!currentBody) return;
    noteEl = el('div', 'flex items-center gap-2 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 font-mono text-[11.5px] text-amber-300',
      `<span>⏳</span>${esc(text)}`);
    currentBody.append(noteEl);
  }
  function clearNote() { noteEl?.remove(); noteEl = null; }

  /* ── sticky status bar ────────────────────────────────────────── */
  function setStatus(text, tone = 'run') {
    $('statusDot').className = 'h-2.5 w-2.5 flex-none rounded-full ' + (
      tone === 'run' ? 'pulse-dot bg-warn' : tone === 'ok' ? 'bg-ok' : tone === 'bad' ? 'bg-bad' : 'bg-info');
    $('statusText').textContent = text;
  }
  function setIterProgress(n) {
    $('iterLabel').textContent = `Iteration ${n} / ${maxIterations}`;
    $('iterBar').style.width = clamp((n / maxIterations) * 100, 0, 100) + '%';
  }

  /* ── event handlers ───────────────────────────────────────────── */

  const onSetupStart = ev => {
    const meta = SETUP_META[ev.step];
    if (!meta) return;
    setupCards[ev.step] = makeCard({ icon: meta.icon, title: meta.running, sub: 'setup — runs once, before the loop' });
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
      card.body.prepend(el('div', 'space-y-2.5 text-[13px] text-slate-300', `
        <p><b class="text-ink">${esc(d.role || 'Role')}</b> · experience asked for: ${esc(d.yearsRequired || 'n/a')}</p>
        <div><div class="mb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Must-haves</div>${chips(d.mustHaves,'warn')}</div>
        <div><div class="mb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">ATS keywords</div>${chips(d.keywords,'info',25)}</div>`));
    }
    if (ev.step === 'resume') {
      const d = ev.data;
      card.body.prepend(el('div', 'space-y-2 text-[13px] text-slate-300', `
        <p>Resume understood — ${arr(d.sections).length} sections · ${arr(d.bullets).length} bullets · ${arr(d.skills).length} skills.</p>
        ${chips(d.sections,'neutral')}`));
    }
    addRaw(card, meta.done, ev.raw);
    setDone(card);
  };

  /* Baseline and iteration verify share one handler */
  const onVerifyStart = ev => {
    if (ev.n === 0) {
      // baseline: stand-alone card
      baselineCard = makeCard({ icon: '🔍', title: 'Initial Verification — original resume',
        sub: 'This is the starting wall of ✗. Watch them flip to ✓ lap by lap.' });
      setStatus('Checking the original resume…');
    } else {
      // iteration verify: block inside the iter card
      const card = iterCards[ev.n];
      if (!card) return;
      const block = phaseBlock(card, 'verify');
      block._content.append(pulseLine('Independent verifier checking the new draft…'));
      card._verify = block;
      setStatus('Verifying…');
    }
  };

  const onVerifyDone = ev => {
    clearNote();
    const checks = arr(ev.data?.checks);
    const score  = ev.score ?? 0;
    const verdict = ev.data?.summaryVerdict || '';
    const failed = checks.filter(c => !c.pass);

    if (ev.n === 0) {
      // Baseline card
      if (!baselineCard) return;
      baselineCard.titleEl.querySelector('div').textContent = 'Initial Verification — original resume';
      baselineCard.body.prepend(el('div', 'space-y-3 text-[13px]', `
        ${deltaBar(null, score)}
        <p class="text-xs text-ink-faint">${failed.length} of 9 checks failing — the red wall of ✗ above. Each iteration exists to flip these to ✓.</p>
        ${checksHTML(checks)}`));
      addRaw(baselineCard, 'Verifier · baseline', ev.raw);
      setDone(baselineCard,
        `<span class="rounded-full border border-info/40 bg-info/10 px-2 py-0.5 font-mono text-[11px] text-sky-300 mr-1">${score}%</span>`);
      setGauge($('gaugeP'), $('gScoreP'), score);
      setStatus(`Baseline: ${score}% · ${failed.length} check${failed.length !== 1 ? 's' : ''} failing`);
    } else {
      // Iteration verify block
      const card = iterCards[ev.n];
      if (!card?._verify) return;
      card._verify._content.innerHTML = '';
      card._verify._content.innerHTML = checksHTML(checks);
      addRaw(card, `Verifier · iteration ${ev.n}`, ev.raw);
      setGauge($('gaugeP'), $('gScoreP'), score);
    }
  };

  const onIterStart = ev => {
    const card = makeCard({ icon: '🔁', title: `Lap ${ev.n}`, sub: `of max ${ev.max} · ${ev.failedChecks?.length || 0} checks to fix` });
    iterCards[ev.n] = card;
    setIterProgress(ev.n - 1);
    // Show the incoming to-do list at the top of the card
    const toDo = arr(ev.failedChecks);
    if (toDo.length) {
      card.body.append(el('div', 'border-l-2 border-info pl-3.5', `
        <div class="mb-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-sky-300">📋 This lap's to-do list</div>
        <ul class="space-y-1 text-[12px] text-slate-300">${toDo.map(c =>
          `<li class="flex gap-2"><span class="text-rose-400">✗</span><span><b class="font-mono">[${esc(c.id)}]</b> ${esc(c.name)}: <i class="text-ink-faint">${esc(c.evidence || '')}</i></span></li>`
        ).join('')}</ul>`));
    }
  };

  const onDoStart = ev => {
    const card = iterCards[ev.n];
    if (!card) return;
    const block = phaseBlock(card, 'do');
    block._content.append(pulseLine('Worker revising the resume…'));
    card._do = block;
    setStatus('Revising…');
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
          return `<li class="flex gap-2 text-[12px]">
            ${fixId ? `<span class="flex-none rounded border border-info/30 bg-info/10 px-1.5 py-0.5 font-mono text-[9px] text-sky-300">${esc(fixId)}</span>` : ''}
            <span>${esc(String(change))}</span></li>`;
        }).join('')}
      </ul>
      ${refused.length ? `<p class="mt-1.5 text-xs italic text-rose-300">🚫 refused to fake: ${refused.map(esc).join(' · ')}</p>` : ''}`;
    addRaw(card, `Worker · iteration ${ev.n}`, ev.raw);
  };

  const onDecideDone = ev => {
    const card = iterCards[ev.n];
    if (!card) return;

    const block = phaseBlock(card, 'decide');
    const failed = arr(ev.failedChecks);
    if (ev.decision === 'stop') {
      const icons = { perfect:'✅', target:'🎯', max:'⏱', plateau:'🔁' };
      block._content.innerHTML = `
        <p class="font-semibold text-ink">${icons[ev.stopCode] || '🛑'} ${esc(ev.stopReason)}</p>`;
    } else {
      block._content.innerHTML = `
        <p class="text-ink-muted text-xs">Going around again. ${failed.length} check${failed.length !== 1 ? 's' : ''} still failing:</p>
        <ul class="mt-1 space-y-0.5 text-[12px]">${failed.map(c =>
          `<li class="flex gap-2"><span class="text-rose-400">✗</span><span><b class="font-mono">[${esc(c.id)}]</b> ${esc(c.evidence || c.name)}</span></li>`
        ).join('')}</ul>`;
    }

    setIterProgress(ev.n);
    const delta = ev.score - (card._prevScore ?? ev.score);
    setDone(card, `<span class="rounded-full border px-2 py-0.5 font-mono text-[11px] font-bold mr-1
      ${delta >= 0 ? 'border-ok/30 bg-ok/10 text-emerald-300' : 'border-bad/30 bg-bad/10 text-rose-300'}">
      ${delta >= 0 ? '+' : ''}${delta}</span>`);

    // "Why another lap?" — a separate, prominent card between iteration groups
    if (ev.decision === 'loop' && failed.length > 0) {
      const whyCard = el('article', `card-in rounded-2xl border border-brand-violet/40 bg-brand-violet/5 px-4 py-3 shadow shadow-brand-violet/10`);
      whyCard.innerHTML = `
        <div class="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-violet-300">🔁 Going around again — here's why:</div>
        <ul class="space-y-1 text-[12.5px]">${failed.map(c =>
          `<li class="flex gap-2">
            <span class="flex-none text-rose-400 font-bold">✗</span>
            <span><b>${esc(c.name)}</b> — <i class="text-ink-faint">${esc(c.evidence || '')}</i></span>
          </li>`
        ).join('')}</ul>
        <p class="mt-2.5 text-xs text-violet-300 font-medium">
          These ${failed.length} problem${failed.length !== 1 ? 's' : ''} become the fix-list for Lap ${ev.n + 1}. That's why the loop exists.
        </p>`;
      timeline.append(whyCard);
      whyCard.scrollIntoView({ block: 'end', behavior: 'smooth' });
    }
  };

  const onIterDone = ev => {
    const card = iterCards[ev.n];
    if (card) card._prevScore = ev.previousScore;
    setStatus(ev.delta > 0 ? 'Improving…' : ev.delta < 0 ? 'Dipped…' : 'Holding steady…');
  };

  const onScore = ev => {
    setGauge($('gaugeP'), $('gScoreP'), ev.score);
    if (ev.previous === null) setStatus(`Baseline: ${ev.score}`);
  };

  const onStop = ev => {
    clearNote();
    Object.values(setupCards).forEach(setFailed);
    Object.values(iterCards).forEach(setFailed);
    if (baselineCard && baselineCard.root.classList.contains('border-warn/50')) setFailed(baselineCard);

    const style = {
      perfect: { border: 'border-ok/60',   tone: 'ok',  head: '✅ Loop finished — all checks passed!' },
      target:  { border: 'border-ok/50',   tone: 'ok',  head: '🎯 Loop finished — score target reached' },
      max:     { border: 'border-warn/50', tone: 'run', head: '⏱ Loop finished — max iterations reached' },
      plateau: { border: 'border-warn/50', tone: 'run', head: '🔁 Loop stopped — no progress on remaining checks' },
      aborted: { border: 'border-line',    tone: 'bad', head: '⏹ Loop stopped early by you' },
      error:   { border: 'border-bad/60',  tone: 'bad', head: '❌ Loop stopped — error' }
    }[ev.code] || { border: 'border-line', tone: 'bad', head: 'Loop stopped' };

    stopCard = makeCard({ icon: ev.code === 'perfect' ? '🏆' : '🛑', title: style.head,
      sub: `${ev.iterations} iteration${ev.iterations !== 1 ? 's' : ''} run` });
    stopCard.root.classList.remove('border-warn/50');
    stopCard.root.classList.add(...style.border.split(' '));
    stopCard.body.append(el('div', 'text-[13px] text-slate-300 space-y-2', `
      <p class="font-semibold text-ink">${esc(ev.reason)}</p>
      <p class="font-mono text-xs text-ink-muted">Score journey: ${ev.history.map(h => h.score).join(' → ')}
        <span class="text-emerald-300">(${ev.score - (ev.baseline ?? 0) >= 0 ? '+' : ''}${ev.score - (ev.baseline ?? 0)} overall)</span></p>`));

    setDone(stopCard);
    setStatus(style.head, style.tone);
    setGauge($('gaugeP'), $('gScoreP'), ev.score);
    $('stopBtn').disabled = true;
  };

  /* Polish phase (unchanged from v3) */
  const onPhaseStart = ev => {
    if (ev.phase !== 'polish') return;
    polishCard = makeCard({ icon: '✨', title: 'Final Polish',
      sub: 'Proofreading — grammar, tense, bullet parallelism. No new keywords or facts.' });
    polishCard.root.classList.add('border-fuchsia-400/30');
    setStatus('Final Polish…');
  };
  const onPhaseDone = ev => {
    if (ev.phase !== 'polish') return;
    if (!polishCard) return;
    clearNote();
    const d = ev.data || {};
    const edits = arr(d.editsMade);
    const skipped = !!d.skipped;
    polishCard.body.append(el('div', 'space-y-3 text-[13px]', `
      <div class="border-l-2 border-fuchsia-400/60 pl-3.5">
        <div class="mb-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-fuchsia-300">✨ Final Polish</div>
        ${skipped
          ? `<p class="text-amber-300 text-xs italic">⚠️ Skipped — ${esc(d.reason || '')}. Resume is the last scored draft.</p>`
          : edits.length
            ? `<ul class="list-disc space-y-1 pl-4 text-slate-300">${edits.map(e => `<li>${esc(e)}</li>`).join('')}</ul>`
            : '<p class="text-ink-faint text-xs italic">No edits needed — the resume was already clean.</p>'}
        <p class="mt-2 rounded-lg border border-fuchsia-400/20 bg-fuchsia-900/10 px-3 py-2 text-[11px] text-fuchsia-200">
          📊 Score unchanged at ${esc(String(d.finalScore ?? '–'))} — polish only edits wording, grammar and tense. No re-scoring.
        </p>
      </div>`));
    addRaw(polishCard, 'Polisher · final pass', ev.raw);
    setDone(polishCard,
      `<span class="rounded-full border ${skipped ? 'border-warn/40 bg-warn/10 text-amber-300' : 'border-fuchsia-400/40 bg-fuchsia-900/30 text-fuchsia-300'} px-2 py-0.5 font-mono text-[11px] mr-1">${skipped ? 'skipped' : 'polish'}</span>`);
  };

  const onGapsStart = () => {
    if (!stopCard) return;
    stopCard._gapsPulse = pulseLine('Writing the honest gap report…');
    stopCard.drawer ? stopCard.body.insertBefore(stopCard._gapsPulse, stopCard.drawer) : stopCard.body.append(stopCard._gapsPulse);
  };
  const onGapsDone = ev => {
    if (!stopCard) return;
    stopCard._gapsPulse?.remove();
    const n = arr(ev.data).length;
    const line = el('p', 'text-[13px] text-slate-300',
      ev.data === null ? '⚖️ Gap report call failed — raw missing checks listed on the next page.'
        : `⚖️ Gap report ready — ${n === 0 ? 'no unfixable gaps' : `${n} gap${n !== 1 ? 's' : ''}`} on the next page.`);
    stopCard.drawer ? stopCard.body.insertBefore(line, stopCard.drawer) : stopCard.body.append(line);
    addRaw(stopCard, 'Gap report', ev.raw);
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
      $('gScoreP').textContent = '–';
      $('iterBar').style.width = '0%';
      $('iterLabel').textContent = `Iteration 0 / ${maxIterations}`;
      setStatus('Starting…');
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
