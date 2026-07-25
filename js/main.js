/* ═══════════════════════════════════════════════════════════════════════
   main.js — entry point and page state machine.

     Upload (1)  →  Process (2)  →  Download (3)
                       ↑ back-nav is disabled while the loop runs;
                         "Start Over" resets to page 1.

   This file owns the wiring: it reads settings, starts the engine,
   pipes the engine's events into BOTH views via dualEmit, and hands the
   final result to the Download page.

   The two views (Technical View and Loop Theater) subscribe to the same
   real event stream. Switching the tab toggle only shows/hides the
   containers — it never restarts or replays the loop. This single-stream
   architecture is what makes "fake" structurally impossible: there is
   no second code path that could diverge from the real events.
   ═══════════════════════════════════════════════════════════════════════ */

import { $, el, esc, show } from './dom.js?v=4';
import { fileToText } from './parser.js?v=4';
import { runLoop } from './loop.js?v=4';
import { readSettings, validate, inputsComplete, restoreSettings } from './settings.js?v=4';
import { createProcessView } from './timeline.js?v=5';
import { createTheaterView } from './theater.js?v=5';
import { createChecklistView } from './checklist.js?v=5';
import { renderResults } from './results.js?v=5';
import { downloadPDF, downloadTXT } from './resume.js?v=4';

const app = {
  page: 1,
  running: false,
  result: null,
  controller: null
};

const view       = createProcessView();
const theater    = createTheaterView();
const checklist  = createChecklistView();

/* ── tripleEmit: fans every loop event to all three views simultaneously ── */
function dualEmit(ev) {
  view.handle(ev);
  theater.handle(ev);
  checklist.handle(ev);
}

/* ── tab toggle (Technical View ↔ Loop Theater) ─────────────────── */
/* Switching is pure CSS show/hide — does NOT restart or replay the loop.
   Both views already received every event since the loop started. */

function setActiveTab(which /* 'tech' | 'theater' */) {
  const timeline  = $('timeline');
  const theaterEl = $('theater');
  const techBtn   = $('techViewBtn');
  const thtrBtn   = $('theaterBtn');

  const isTech = which === 'tech';
  show(timeline,  isTech);
  show(theaterEl, !isTech);

  // Update aria + visual state of the toggle buttons
  techBtn.setAttribute('aria-selected', isTech ? 'true' : 'false');
  thtrBtn.setAttribute('aria-selected', isTech ? 'false' : 'true');

  if (isTech) {
    techBtn.className = 'view-tab t-btn t-btn-sm t-btn-acc';
    thtrBtn.className = 'view-tab t-btn t-btn-sm t-btn-ghost';
  } else {
    thtrBtn.className = 'view-tab t-btn t-btn-sm t-btn-acc';
    techBtn.className = 'view-tab t-btn t-btn-sm t-btn-ghost';
  }
  techBtn.style.border = '0';
  thtrBtn.style.border = '0';
}

$('techViewBtn').addEventListener('click', () => setActiveTab('tech'));
$('theaterBtn') .addEventListener('click', () => setActiveTab('theater'));

/* ── page transitions + stepper ─────────────────────────────────────── */

function go(page) {
  app.page = page;
  show($('page-upload'),   page === 1);
  show($('page-process'),  page === 2);
  show($('page-download'), page === 3);

  document.querySelectorAll('#stepper li[data-step]').forEach(li => {
    const n = Number(li.dataset.step);
    const num = li.querySelector('.step-num');
    const label = li.querySelector('.step-label');

    if (n < page) {                       // done
      num.className = 'step-num t-step t-step-done';
      num.textContent = '[✓]';
      label.className = 'step-label hidden sm:inline t-step t-step-done pl-1';
      li.removeAttribute('aria-current');
    } else if (n === page) {              // active
      num.className = 'step-num t-step t-step-active';
      num.textContent = `[${n}]`;
      label.className = 'step-label hidden sm:inline t-step pl-1';
      label.style.color = '#E8E8E3';
      li.setAttribute('aria-current', 'step');
    } else {                              // upcoming
      num.className = 'step-num t-step';
      num.textContent = `[${n}]`;
      label.className = 'step-label hidden sm:inline t-step pl-1';
      label.style.color = '';
      li.removeAttribute('aria-current');
    }
  });

  window.scrollTo({ top: 0 });
}

/* ── the CTA gate on page 1 ─────────────────────────────────────────── */

function refreshGate() {
  const ready = inputsComplete();
  $('tailorBtn').disabled = !ready;
  $('gateHint').textContent = ready
    ? 'ready. the loop runs live on the next page.'
    : 'awaiting: resume + job description + api key';
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
    $('err').textContent = '[ERR] ' + e.message;
    show($('err'));
    return;
  }

  app.running = true;
  app.result = null;
  app.controller = new AbortController();

  // Reset all three views — Technical View, Loop Theater, and Checklist Panel
  view.reset(settings);
  theater.reset(settings);
  checklist.reset();

  // Default to Technical View at the start of a run; user can switch any time
  setActiveTab('tech');

  show($('processActions'), false);
  show($('backToUpload'), false);
  go(2);

  try {
    // The single dualEmit fans every real event to both views simultaneously.
    // This is the structural guarantee that Loop Theater can never show fake data:
    // it receives exactly the same events as Technical View, in exactly the same order.
    app.result = await runLoop(settings, dualEmit, app.controller.signal);
  } finally {
    app.running = false;
    app.controller = null;
    view.finish();
    theater.finish();
    checklist.finish();
  }

  // Reveal the way forward. If the loop died before even a baseline
  // score existed (bad API key, network down), viewing results would
  // show nothing useful — send the user back to fix the setup instead.
  const useless = app.result.stopCode === 'error' && !app.result.baselineScored;
  show($('processActions'));
  show($('toDownload'), !useless);
  show($('backToUpload'), useless);
});

$('stopBtn').addEventListener('click', () => {
  app.controller?.abort();
  $('stopBtn').disabled = true;
});

$('toDownload').addEventListener('click', () => {
  renderResults(app.result);
  go(3);
});

$('backToUpload').addEventListener('click', () => go(1));

/* ── Download page actions ──────────────────────────────────────────── */

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

const openPicker = () => $('file').click();
drop.addEventListener('click', openPicker);
drop.addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPicker(); }
});
drop.addEventListener('dragover', e => {
  e.preventDefault();
  drop.classList.add('t-drop-hover');
});
drop.addEventListener('dragleave', () => drop.classList.remove('t-drop-hover'));
drop.addEventListener('drop', e => {
  e.preventDefault();
  drop.classList.remove('t-drop-hover');
  const file = e.dataTransfer.files[0];
  if (file) loadResumeFile(file);
});
$('file').addEventListener('change', e => {
  const file = e.target.files[0];
  if (file) loadResumeFile(file);
});

async function loadResumeFile(file) {
  drop.innerHTML = `<div class="t-body font-bold">READING ${esc(file.name.toUpperCase())}…</div>`;
  try {
    const text = await fileToText(file);
    $('resume').value = text;
    drop.classList.add('t-drop-ok');
    drop.innerHTML = `
      <div class="t-body font-bold">[✓] ${esc(file.name)}</div>
      <div class="mt-1 t-small t-faint">${text.length.toLocaleString()} chars extracted — edit below if the parse looks off</div>`;
  } catch (e) {
    drop.classList.remove('t-drop-ok');
    drop.innerHTML = `
      <div class="t-body font-bold t-acc">[ERR] could not read ${esc(file.name)}</div>
      <div class="mt-1 t-small t-faint">${esc(e.message)} — paste the text below instead</div>`;
  }
  refreshGate();
}

/* JD can arrive as a file too */
$('jdFile').addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;
  $('jdFileName').textContent = 'reading…';
  try {
    $('jd').value = await fileToText(file);
    $('jdFileName').textContent = `[✓] ${file.name}`;
  } catch (err) {
    $('jdFileName').textContent = `[ERR] ${err.message}`;
  }
  refreshGate();
});

/* ── boot ───────────────────────────────────────────────────────────── */

/* sliders show their value live */
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
