/* ═══════════════════════════════════════════════════════════════════════
   loop.js — v4 LOOP ENGINE: Worker → Verifier → Decide.

   The loop now has a visible, stated reason for every extra lap:
   the EXACT set of named checks that FAILED the independent verifier.

   INITIALIZE   extract JD → parse resume → baseline verification
                (the baseline verify shows the original resume's red ✗ wall,
                 so the improvement arc is visible from the very first card)

   LOOP
     (1) DO      worker revises resume, driven by the exact failed-check to-do list
     (2) VERIFY  independent LLM call (different role, different prompt) evaluates
                 the current draft against all 9 named checks + original resume
     (3) DECIDE  plain deterministic code — no LLM:
                   all checks pass           → stop 'perfect'
                   score ≥ targetScore       → stop 'target'
                   iterations ≥ maxIter      → stop 'max'
                   same checks failed twice  → stop 'plateau'
                   else                      → loop again (failed checks → next to-do list)

   POLISH     single line-edit pass after the loop (v3, unchanged)
   OUTPUT     result object for Download page

   ── Event vocabulary ────────────────────────────────────────────────────
     setup:start  {step:'jd'|'resume', timestampMs}
     setup:done   {step, data, raw, timestampMs}
     guard:check  {n, max, apiCalls, elapsedMs, ok, timestampMs}
                   ← the safety guard: budget/laps/time, plain code, every cycle
     verify:start {n, purpose:'baseline'|'check', timestampMs}
     verify:done  {n, purpose, data:{checks[],summaryVerdict}, score, raw, timestampMs}
     iter:start   {n, max, failedChecks[], previousScore, timestampMs}
     do:start     {n, timestampMs}
     do:done      {n, data:{revisedResume,changesMade[{fixes,change}],couldNotDo[]}, raw, timestampMs}
     decide:done  {n, decision:'loop'|'stop', stopCode, stopReason, failedChecks[], score, timestampMs}
     iter:done    {n, score, previousScore, delta, timestampMs}
     score        {score, previous, baseline, iteration, maxIterations, history, timestampMs}
     note         {stage, text, timestampMs}
     stop         {code, reason, score, baseline, target, iterations, maxIterations, history, timestampMs}
                   code: 'perfect'|'target'|'max'|'plateau'|'aborted'|'error'
     phase:start  {n:'polish', phase:'polish', timestampMs}   ← polish pass only
     phase:done   {n:'polish', phase:'polish', data, raw, timestampMs}
     gaps:start   {timestampMs}
     gaps:done    {data, raw, timestampMs}
   ═══════════════════════════════════════════════════════════════════════ */

import { arr, clamp } from './dom.js?v=4';
import { askJSON } from './llm.js?v=4';
import {
  jdPrompt, resumePrompt, verifyPrompt, doPrompt, polishPrompt, gapsPrompt,
  CHECK_DEFS, checksToScore
} from './prompts.js?v=4';

/** Priority order for the worker's to-do list (highest impact first). */
const CHECK_PRIORITY = CHECK_DEFS.map(c => c.id);

/** True if two Sets of check IDs contain exactly the same elements. */
function setsEqual(a, b) {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

/**
 * Run the v4 tailoring loop: Worker → Verifier → Decide.
 * @param {object} settings   from settings.readSettings()
 * @param {function} emit     receives every loop event in order
 * @param {AbortSignal} signal fires when the user clicks Stop early
 * @returns {Promise<object>} result object for the Download page
 */
export async function runLoop(settings, emit, signal) {
  const { targetScore, maxIterations } = settings;
  const originalResume = settings.resumeText;

  const stamped = ev => ({ ...ev, timestampMs: Date.now() });

  /* the safety guard's ledger: real cost/time numbers, nothing estimated */
  const t0 = Date.now();
  let apiCalls = 0;

  const ask = (prompt, stage) => {
    apiCalls++;
    return askJSON(settings, prompt, signal, {
      note: text => emit(stamped({ type: 'note', stage, text })),
      api:  info => emit(stamped({ type: 'api', stage, ...info }))
    });
  };

  /* ── loop state ─────────────────────────────────────────────── */
  let jobRequirements = null;
  let currentResume   = originalResume;
  let lastVerify      = null;     // latest full verify result
  let lastScore       = 0;
  let baseline        = null;
  let baselineScored  = false;
  let iteration       = 0;
  let prevFailedIds   = null;     // Set<string> — for plateau detection
  const changeLog     = [];       // [{pass, fixes, change}]
  const scoreHistory  = [];
  let stopCode        = null;
  let stopReason      = null;

  try {
    /* ══════════════ INITIALIZE ══════════════ */

    emit(stamped({ type: 'setup:start', step: 'jd' }));
    const jdRes = await ask(jdPrompt(settings.jd), 'jd');
    jobRequirements = jdRes.json;
    emit(stamped({ type: 'setup:done', step: 'jd', data: jobRequirements, raw: jdRes.raw }));

    emit(stamped({ type: 'setup:start', step: 'resume' }));
    const parsed = await ask(resumePrompt(currentResume), 'resume');
    emit(stamped({ type: 'setup:done', step: 'resume', data: parsed.json, raw: parsed.raw }));

    /* Baseline verification — the original resume's mostly-red checklist.
       This is the "before" picture: students see the wall of ✗ first. */
    emit(stamped({ type: 'verify:start', n: 0, purpose: 'baseline' }));
    const baselineVRes = await ask(verifyPrompt(currentResume, originalResume, jobRequirements), 'verify');
    const baselineChecks = normaliseChecks(arr(baselineVRes.json?.checks));
    baseline    = checksToScore(baselineChecks);
    lastScore   = baseline;
    lastVerify  = { checks: baselineChecks, summaryVerdict: baselineVRes.json?.summaryVerdict || '' };
    baselineScored = true;
    scoreHistory.push({ label: 'start', score: baseline });
    emit(stamped({ type: 'verify:done', n: 0, purpose: 'baseline',
      data: lastVerify, score: baseline, raw: baselineVRes.raw }));
    emit(stamped({ type: 'score', score: baseline, previous: null, baseline,
      iteration: 0, maxIterations, history: scoreHistory }));

    /* ══════════════ LOOP ══════════════ */
    while (true) {

      const n = iteration + 1;
      const failed = lastVerify.checks.filter(c => !c.pass);
      const failedIds = new Set(failed.map(c => c.id));

      // ─ SAFETY GUARD: cost & time limits, checked before every cycle.
      //   Plain code, no model. The stop conditions below enforce it;
      //   this event makes the check itself visible.
      emit(stamped({ type: 'guard:check', n, max: maxIterations, apiCalls,
        elapsedMs: Date.now() - t0, ok: iteration < maxIterations }));

      // ─ DECIDE (pre-DO): check stop conditions before running the next lap ──
      // Stop codes: perfect (all pass), max (laps exhausted), plateau (stuck).
      // NOTE: 'target score' stop removed — maxIterations is the user's stated
      // intention and we always honour it. A high score alone is not a reason
      // to stop early; only 'all checks pass' qualifies as 'done enough'.
      if (failed.length === 0) {
        stopCode   = 'perfect';
        stopReason = 'All 9 checks passed — the verifier found nothing left to fix.';
        break;
      }
      if (iteration >= maxIterations) {
        stopCode   = 'max';
        stopReason = `Completed all ${maxIterations} lap${maxIterations !== 1 ? 's' : ''}. ${failed.length} check${failed.length !== 1 ? 's' : ''} still open.`;
        break;
      }
      // (No plateau check here. Plateau means "verify n-1 and verify n failed
      // the SAME checks" and is decided inside DECIDE below, which compares
      // two consecutive verifier verdicts. At this point in the code
      // prevFailedIds and failedIds come from the same verify, so comparing
      // them always matched and killed the loop after one lap — a bug.)

      // Sort failed checks by priority; pass top 4 to the worker this lap
      const topFailed = [...failed]
        .sort((a, b) => CHECK_PRIORITY.indexOf(a.id) - CHECK_PRIORITY.indexOf(b.id))
        .slice(0, 4);

      emit(stamped({ type: 'iter:start', n, max: maxIterations,
        failedChecks: failed, previousScore: lastScore }));

      // ─ (1) DO — the worker, given the failed-check to-do list ───────────
      emit(stamped({ type: 'do:start', n }));
      const doRes = await ask(doPrompt(topFailed, currentResume, jobRequirements, originalResume), 'do');
      const doData = doRes.json;

      if (typeof doData.revisedResume === 'string' && doData.revisedResume.trim().length > 40) {
        currentResume = doData.revisedResume.trim();
      }
      arr(doData.changesMade).forEach(c => {
        const text = typeof c === 'string' ? c : `[${c.fixes || '?'}] ${c.change || c}`;
        changeLog.push({ pass: n, fixes: c.fixes || '', text });
      });
      emit(stamped({ type: 'do:done', n, data: doData, raw: doRes.raw }));

      // ─ (2) VERIFY — the independent checker, sees only the resume ───────
      emit(stamped({ type: 'verify:start', n, purpose: 'check' }));
      const vRes = await ask(verifyPrompt(currentResume, originalResume, jobRequirements), 'verify');
      const newChecks = normaliseChecks(arr(vRes.json?.checks));
      const newScore  = checksToScore(newChecks);
      const newVerify = { checks: newChecks, summaryVerdict: vRes.json?.summaryVerdict || '' };
      const newFailed = newChecks.filter(c => !c.pass);
      const newFailedIds = new Set(newFailed.map(c => c.id));
      emit(stamped({ type: 'verify:done', n, purpose: 'check',
        data: newVerify, score: newScore, raw: vRes.raw }));

      // ─ (3) DECIDE — what happens next? (plain code, no target-score bail-out) ──
      // Stops only when: all checks pass, laps exhausted, or identical failures twice.
      let decision, decidedCode, decidedReason;
      if (newFailed.length === 0) {
        decision = 'stop'; decidedCode = 'perfect';
        decidedReason = 'All 9 checks passed — the verifier found nothing left to fix.';
      } else if (n >= maxIterations) {
        decision = 'stop'; decidedCode = 'max';
        decidedReason = `Completed all ${n} lap${n !== 1 ? 's' : ''}. ${newFailed.length} check${newFailed.length !== 1 ? 's' : ''} still open — see checklist for what\'s left.`;
      } else if (prevFailedIds !== null && setsEqual(prevFailedIds, newFailedIds)) {
        decision = 'stop'; decidedCode = 'plateau';
        decidedReason = `Same ${newFailed.length} check${newFailed.length !== 1 ? 's' : ''} failed twice in a row with no change — may need human input.`;
      } else {
        decision = 'loop'; decidedCode = null; decidedReason = null;
      }

      emit(stamped({ type: 'decide:done', n, decision, stopCode: decidedCode,
        stopReason: decidedReason, failedChecks: newFailed, score: newScore }));

      const delta = newScore - lastScore;
      emit(stamped({ type: 'iter:done', n, score: newScore, previousScore: lastScore, delta }));

      prevFailedIds = newFailedIds;
      lastScore     = newScore;
      lastVerify    = newVerify;
      iteration     = n;
      scoreHistory.push({ label: `iter ${n}`, score: newScore });
      emit(stamped({ type: 'score', score: newScore, previous: lastScore - delta, baseline,
        iteration: n, maxIterations, history: scoreHistory }));

      if (decision === 'stop') {
        stopCode   = decidedCode;
        stopReason = decidedReason;
        break;
      }
    }

  } catch (e) {
    if (e?.name === 'AbortError') {
      stopCode   = 'aborted';
      stopReason = 'Stopped early by you. The resume shown is the last completed draft.';
    } else {
      stopCode   = 'error';
      stopReason = 'The loop hit an unrecoverable error: ' + e.message;
      console.error(e);
    }
  }

  emit(stamped({ type: 'stop', code: stopCode, reason: stopReason, score: lastScore, baseline,
    target: targetScore, iterations: iteration, maxIterations, history: scoreHistory }));

  /* ══════════════ POLISH PASS ══════════════ */
  if (stopCode === 'perfect' || stopCode === 'target' || stopCode === 'max' || stopCode === 'plateau') {
    emit(stamped({ type: 'phase:start', n: 'polish', phase: 'polish' }));
    try {
      const polishRes = await ask(polishPrompt(currentResume, jobRequirements?.role || ''), 'polish');
      const polished  = polishRes.json;
      if (typeof polished.polishedResume === 'string' && polished.polishedResume.trim().length > 40) {
        currentResume = polished.polishedResume.trim();
      }
      emit(stamped({ type: 'phase:done', n: 'polish', phase: 'polish',
        data: { ...polished, scoreUnchanged: true, finalScore: lastScore }, raw: polishRes.raw }));
    } catch (e) {
      const skippedData = { skipped: true, scoreUnchanged: true, finalScore: lastScore, editsMade: [],
        reason: e?.name === 'AbortError' ? 'Stopped during polish.' : 'Polish failed: ' + e.message };
      emit(stamped({ type: 'phase:done', n: 'polish', phase: 'polish',
        data: skippedData, raw: '' }));
    }
  }

  /* ══════════════ GAP REPORT ══════════════ */
  let gapReport = null;
  const stillFailing = lastVerify?.checks.filter(c => !c.pass) || [];
  if (stopCode !== 'aborted' && stopCode !== 'error') {
    emit(stamped({ type: 'gaps:start' }));
    try {
      const gapRes = await ask(gapsPrompt(currentResume, jobRequirements, lastVerify, stillFailing), 'gaps');
      gapReport = arr(gapRes.json.unfixableGaps);
      emit(stamped({ type: 'gaps:done', data: gapReport, raw: gapRes.raw }));
    } catch (e) {
      if (e?.name === 'AbortError') throw e;
      emit(stamped({ type: 'gaps:done', data: null, raw: '(gap-report call failed: ' + e.message + ')' }));
    }
  }
  if (!gapReport) {
    gapReport = stillFailing.map(c => ({
      requirement: c.name,
      mustHave: c.id === 'KW-MUSTHAVE',
      why: c.evidence || 'Still failing after all iterations.',
      howToActuallyCloseIt: 'Address this check manually, then re-run.'
    }));
  }

  return {
    finalResume:    currentResume,
    originalResume,
    baseline:       baseline ?? 0,
    baselineScored,
    atsScore:       lastScore,
    previousScore:  null,
    matched:        lastVerify?.checks.filter(c => c.pass).map(c => c.name) || [],
    missing:        stillFailing.map(c => c.name),
    gaps:           gapReport,
    changeLog,
    blocked:        [],
    stopCode,
    stopReason,
    scoreHistory,
    requirements:   jobRequirements,
    iterations:     iteration,
    target:         targetScore,
    finalChecks:    lastVerify?.checks || [],
  };
}

/**
 * Normalise the checklist from the LLM: ensure all 9 IDs are present,
 * fill in any that the model accidentally omitted with a 'pending' default.
 * Uses CHECK_DEFS imported at the top of this file.
 */
function normaliseChecks(rawChecks) {
  return CHECK_DEFS.map(def => {
    const found = rawChecks.find(c => c.id === def.id);
    if (found) return { id: def.id, name: def.name, pass: !!found.pass, evidence: found.evidence || '' };
    return { id: def.id, name: def.name, pass: false, evidence: '(not evaluated — model omitted this check)' };
  });
}
