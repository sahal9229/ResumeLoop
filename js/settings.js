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
  // modelSel values look like "gemini:gemini-2.5-flash";
  // "openrouter:custom" defers to the free-text slug field
  const [provider, ...modelParts] = $('modelSel').value.split(':');
  let model = modelParts.join(':');
  if (model === 'custom') model = $('customModel').value.trim();

  return {
    jd:         $('jd').value.trim(),
    resumeText: $('resume').value.trim(),

    // passed straight to callLLM
    provider,
    model,
    apiKey: $('apiKey').value.trim(),

    // the loop's stop-condition knobs
    targetScore:   clamp($('targetScore').value, 0, 100),
    maxIterations: clamp($('maxIterations').value, 1, 8)
  };
}

/** Throws with a message aimed at the user, not the console. */
export function validate(s) {
  if (!s.resumeText) throw new Error('Upload or paste a resume first.');
  if (!s.jd)         throw new Error('Paste a job description first.');
  if (!s.apiKey)     throw new Error('Add an API key first.');
  if (!s.model)      throw new Error('Enter the model name — pick one from the dropdown, or paste a slug from openrouter.ai/models into the custom field.');

  // Key/provider mismatch is the #1 classroom mistake — catch it before
  // the loop burns a failed call on it. Gemini keys start with "AIza",
  // OpenRouter keys with "sk-or-".
  if (s.provider === 'openrouter' && /^AIza/i.test(s.apiKey))
    throw new Error('That looks like a Google Gemini key (AIza…), but the model you picked runs on OpenRouter. Switch to a Gemini model, or paste an OpenRouter key (sk-or-…).');
  if (s.provider === 'gemini' && /^sk-or-/i.test(s.apiKey))
    throw new Error('That looks like an OpenRouter key (sk-or-…), but the model you picked runs on Gemini. Switch to an OpenRouter model, or paste a Gemini key (AIza…).');
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
    const saved = localStorage.getItem(PREFIX + id);
    if (saved !== null) $(id).value = saved;
    $(id).addEventListener('change', () => localStorage.setItem(PREFIX + id, $(id).value));
  }
}
