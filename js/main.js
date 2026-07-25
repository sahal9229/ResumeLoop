/* ═══════════════════════════════════════════════════════════════════════
   main.js — entry point and page state machine.

     Input (1)  →  Process (2)  →  Result (3)
                      ↑ back-nav is disabled while the loop runs;
                        "Start Over" resets to page 1.

   This file owns the wiring: it reads settings, starts the engine,
   pipes the engine's events into both views via dualEmit, and hands
   the final result to the Result page.

   The disc and the check grid subscribe to the same real event stream.
   There is no second code path that could diverge from the real events.
   ═══════════════════════════════════════════════════════════════════════ */

import { $, el, esc, show } from './dom.js?v=4';
import { fileToText } from './parser.js?v=4';
import { runLoop } from './loop.js?v=6';
import { readSettings, validate, inputsComplete, restoreSettings } from './settings.js?v=4';
import { createTheaterView } from './theater.js?v=10';
import { renderResults } from './results.js?v=7';
import { downloadPDF, downloadTXT } from './resume.js?v=5';

const app = {
  page: 1,
  running: false,
  result: null,
  controller: null
};

const theater = createTheaterView();

/* ── emit: pipes every loop event into the view ── */
function dualEmit(ev) {
  theater.handle(ev);
  if (ev.type === 'stop') $('stopBtn').disabled = true;
}

/* ── page transitions + stepper (clickable — free back-and-forth) ──── */

/* which pages are reachable right now: INPUT always; PROCESS once a run
   has started; RESULT once a usable result exists */
function canGo(n) {
  if (n === 1) return true;
  if (n === 2) return app.running || app.result !== null;
  if (n === 3) return app.result !== null
    && !(app.result.stopCode === 'error' && !app.result.baselineScored);
  return false;
}

function go(page) {
  app.page = page;
  show($('page-upload'),   page === 1);
  show($('page-process'),  page === 2);
  show($('page-download'), page === 3);
  refreshStepper();
  window.scrollTo({ top: 0 });
}

function refreshStepper() {
  document.querySelectorAll('#stepper li[data-step]').forEach(li => {
    const n = Number(li.dataset.step);
    li.classList.toggle('step-active', n === app.page);
    li.classList.toggle('step-done',   n < app.page);
    li.classList.toggle('step-locked', !canGo(n));
    if (n === app.page) li.setAttribute('aria-current', 'step');
    else li.removeAttribute('aria-current');
  });
}

document.querySelectorAll('#stepper li[data-step]').forEach(li => {
  li.setAttribute('role', 'button');
  li.setAttribute('tabindex', '0');
  const nav = () => {
    const n = Number(li.dataset.step);
    if (!canGo(n) || n === app.page) return;
    if (n === 3) renderResults(app.result);
    go(n);
  };
  li.addEventListener('click', nav);
  li.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); nav(); }
  });
});

/* ── the CTA gate on page 1 ─────────────────────────────────────────── */

function refreshGate() {
  const btn = $('tailorBtn');
  if (app.running) {
    btn.disabled = true;
    btn.textContent = 'LOOP RUNNING — SEE 02 PROCESS';
    $('gateHint').textContent = 'A loop is already running.';
    return;
  }

  const missing = [];
  if (!$('resume').value.trim()) missing.push('RESUME');
  if (!$('jd').value.trim())     missing.push('JOB DESCRIPTION');
  if (!$('apiKey').value.trim()) missing.push('API KEY');

  const ready = missing.length === 0;
  btn.disabled = !ready;
  btn.textContent = ready ? 'TAILOR MY RESUME' : 'ADD: ' + missing.join(' + ');
  $('gateHint').textContent = ready
    ? 'Ready. The loop runs live on the next page.'
    : 'Still needed: ' + missing.join(', ').toLowerCase();
}

['resume', 'jd', 'apiKey'].forEach(id => $(id).addEventListener('input', refreshGate));

/* ── Tailor: start the loop ─────────────────────────────────────────── */

$('tailorBtn').addEventListener('click', async () => {
  show($('err'), false);

  let settings;
  try {
    settings = readSettings();
    validate(settings);
  } catch (e) {
    $('err').textContent = 'ERROR — ' + e.message;
    show($('err'));
    return;
  }

  app.running = true;
  app.result = null;
  app.controller = new AbortController();

  theater.reset(settings);

  show($('processActions'), false);
  show($('backToUpload'), false);
  $('stopBtn').disabled = false;
  refreshGate();
  go(2);

  try {
    // dualEmit fans every real event to both views in the same order —
    // the disc and the grid can never show anything the loop didn't do.
    app.result = await runLoop(settings, dualEmit, app.controller.signal);
  } finally {
    app.running = false;
    app.controller = null;
    theater.finish();
    refreshGate();
    refreshStepper();
  }

  // Reveal the way forward. If the loop died before even a baseline
  // score existed (bad API key, network down), viewing results would
  // show nothing useful — send the user back to fix the setup instead.
  const useless = app.result.stopCode === 'error' && !app.result.baselineScored;
  const approved = app.result.stopCode === 'perfect' || app.result.stopCode === 'target';
  $('toDownload').textContent = approved ? 'GIVE FINAL OK — VIEW RESULT' : 'VIEW RESULT';
  show($('processActions'));
  show($('toDownload'), !useless);
  show($('backToUpload'), useless);
});

$('stopBtn').addEventListener('click', () => {
  app.controller?.abort();
  $('stopBtn').disabled = true;
});

$('toDownload').addEventListener('click', () => {
  theater.humanApproved();      // the diagram's last gate: a real human click
  renderResults(app.result);
  go(3);
});

$('backToUpload').addEventListener('click', () => go(1));

/* ── Result page actions ────────────────────────────────────────────── */

$('dlPdf').addEventListener('click', () => {
  try {
    downloadPDF(app.result.finalResume);
  } catch (e) {
    alert(e.message);
  }
});

$('dlTxt').addEventListener('click', () => downloadTXT(app.result.finalResume));

$('startOver').addEventListener('click', () => {
  app.result = null;
  refreshGate();          // inputs are kept — handy for re-runs in class
  go(1);
});

/* ── resume upload: drag, drop, browse ──────────────────────────────── */

const drop = $('drop');
const CHECK_SVG = `<svg width="20" height="16" viewBox="0 0 20 16" aria-hidden="true">
  <path d="M2 8l6 6L18 2" fill="none" stroke="#F2EFE9" stroke-width="3"/></svg>`;

const openPicker = () => $('file').click();
drop.addEventListener('click', openPicker);
drop.addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPicker(); }
});
drop.addEventListener('dragover', e => {
  e.preventDefault();
  drop.classList.add('drop-hover');
});
drop.addEventListener('dragleave', () => drop.classList.remove('drop-hover'));
drop.addEventListener('drop', e => {
  e.preventDefault();
  drop.classList.remove('drop-hover');
  const file = e.dataTransfer.files[0];
  if (file) loadResumeFile(file);
});
$('file').addEventListener('change', e => {
  const file = e.target.files[0];
  if (file) loadResumeFile(file);
});

async function loadResumeFile(file) {
  drop.innerHTML = `<div class="drop-big">READING ${esc(file.name.toUpperCase())}…</div>`;
  try {
    const text = await fileToText(file);
    $('resume').value = text;
    $('resume').scrollTop = 0;        // show the top of the resume, not the middle
    drop.innerHTML = `
      <div class="file-ok">
        <span class="ok-square">${CHECK_SVG}</span>
        <div>
          <div class="file-name">${esc(file.name)}</div>
          <div class="file-meta">${text.length.toLocaleString()} CHARS PARSED — EDIT BELOW IF THE PARSE LOOKS OFF</div>
        </div>
      </div>`;
  } catch (e) {
    drop.innerHTML = `
      <div class="file-ok file-err">
        <span class="ok-square"></span>
        <div>
          <div class="file-name">COULD NOT READ ${esc(file.name)}</div>
          <div class="file-meta">${esc(e.message)} — paste the text below instead</div>
        </div>
      </div>`;
  }
  refreshGate();
}

/* JD can arrive as a file too */
$('jdFile').addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;
  $('jdFileName').textContent = 'Reading…';
  try {
    $('jd').value = await fileToText(file);
    $('jd').scrollTop = 0;
    $('jdFileName').textContent = file.name + ' — parsed';
  } catch (err) {
    $('jdFileName').textContent = 'ERROR — ' + err.message;
  }
  refreshGate();
});

/* ── boot ───────────────────────────────────────────────────────────── */

/* sliders show their value live — the numeral is part of the composition */
$('targetScore').addEventListener('input', () => { $('targetVal').textContent = $('targetScore').value; });
$('maxIterations').addEventListener('input', () => { $('maxVal').textContent = $('maxIterations').value; });

/* "OpenRouter · custom model…" reveals the free-text slug field */
const syncCustomModel = () => show($('customModel'), $('modelSel').value === 'openrouter:custom');
$('modelSel').addEventListener('change', syncCustomModel);

restoreSettings();
syncCustomModel();
$('targetVal').textContent = $('targetScore').value;
$('maxVal').textContent = $('maxIterations').value;
refreshGate();
go(1);
