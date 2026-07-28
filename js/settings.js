/* ═══════════════════════════════════════════════════════════════════════
   settings.js — read the input form once, remember it between runs.

   Keeping this here means llm.js never touches the DOM: main.js reads a
   settings snapshot, then hands provider/model/key down to callLLM().
   ═══════════════════════════════════════════════════════════════════════ */

import { $ } from './dom.js?v=6';

const PREFIX = 'rf1_';
const REMEMBERED = ['apiKey', 'modelSel', 'customModel'];

/* Everything routes through OpenRouter: one key, every model. */
const DEFAULT_MODEL = 'anthropic/claude-sonnet-5';

/** Snapshot of the form at the moment "Build My Resume" was clicked. */
export function readSettings() {
  const [p, ...m] = $('modelSel').value.split(':');
  const provider = p || 'openrouter';
  const selected = m.join(':');
  const model = selected === 'custom'
    ? ($('customModel').value.trim() || DEFAULT_MODEL)
    : (selected || DEFAULT_MODEL);

  return {
    jd:         $('jd').value.trim(),
    resumeText: $('resume').value.trim(),

    // passed straight to callLLM
    provider,
    model,
    apiKey: $('apiKey').value.trim()
  };
}

/** Throws with a message aimed at the user, not the console. */
export function validate(s) {
  if (!s.resumeText) throw new Error('Upload or paste a resume first.');
  if (!s.jd)         throw new Error('Paste a job description first.');
  if (!s.apiKey)     throw new Error('Add an API key first.');
  if (!s.model)      throw new Error('Select a model first.');

  // Every model here runs on OpenRouter, so a key from anywhere else will
  // 401 in a way the user cannot read. Name the mistake up front instead.
  if (/^AIza/i.test(s.apiKey))
    throw new Error('That is a Google AI Studio key (AIza…). This app runs every model through OpenRouter — paste an OpenRouter key (sk-or-…) from openrouter.ai/keys.');
  if (/^sk-proj-|^sk-[A-Za-z0-9]{20,}$/.test(s.apiKey) && !/^sk-or-/i.test(s.apiKey))
    throw new Error('That looks like a direct OpenAI key. This app runs every model through OpenRouter — paste an OpenRouter key (sk-or-…) from openrouter.ai/keys.');
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
