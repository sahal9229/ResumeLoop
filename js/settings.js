/* ═══════════════════════════════════════════════════════════════════════
   settings.js — read the Upload form once, remember it between runs.

   Keeping this here means llm.js never touches the DOM: main.js reads a
   settings snapshot, then hands provider/model/key down to callLLM().
   ═══════════════════════════════════════════════════════════════════════ */

import { $, clamp } from './dom.js?v=4';

const PREFIX = 'rl2_';
const REMEMBERED = ['apiKey', 'modelSel', 'customModel', 'targetScore', 'maxIterations'];

/** Snapshot of the form at the moment "Tailor My Resume" was clicked. */
export function readSettings() {
  const [p, ...m] = $('modelSel').value.split(':');
  const provider = p || 'openrouter';
  const model = m.join(':') || 'openai/gpt-4o-mini';

  return {
    jd:         $('jd').value.trim(),
    resumeText: $('resume').value.trim(),

    // passed straight to callLLM (always OpenRouter + gpt-4o-mini under the hood)
    provider,
    model,
    apiKey: $('apiKey').value.trim(),

    // the loop's stop-condition knobs. Target-score UI was removed —
    // the loop stops on all-pass / out-of-laps / plateau only.
    targetScore:   $('targetScore') ? clamp($('targetScore').value, 0, 100) : 100,
    maxIterations: clamp($('maxIterations').value, 1, 8)
  };
}

/** Throws with a message aimed at the user, not the console. */
export function validate(s) {
  if (!s.resumeText) throw new Error('Upload or paste a resume first.');
  if (!s.jd)         throw new Error('Paste a job description first.');
  if (!s.apiKey)     throw new Error('Add an API key first.');
  if (!s.model)      throw new Error('Select a model first.');

  if (s.provider === 'openrouter' && /^AIza/i.test(s.apiKey))
    throw new Error('That looks like a Google Gemini key (AIza…), but this model runs on OpenRouter. Paste an OpenRouter key (sk-or-…).');
}

/** True when every required input is present — gates the CTA button. */
export function inputsComplete() {
  return Boolean(
    $('resume').value.trim() &&
    $('jd').value.trim() &&
    $('apiKey').value.trim()
  );
}

/** Restore last session's values and keep them in sync from here on. */
export function restoreSettings() {
  for (const id of REMEMBERED) {
    const node = $(id);
    if (!node) continue;                     // controls may be removed from the UI
    const saved = localStorage.getItem(PREFIX + id);
    if (saved !== null) node.value = saved;
    node.addEventListener('change', () => localStorage.setItem(PREFIX + id, node.value));
  }
}
