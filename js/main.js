/* ═══════════════════════════════════════════════════════════════════════
   main.js — entry point and page wiring.

     Input (1)  →  Result (2)

   Reads the form, runs the two-stage build, hands the result to the
   Result page. Everything else lives in its own module.
   ═══════════════════════════════════════════════════════════════════════ */

import { $, esc, show } from './dom.js?v=6';
import { fileToText } from './parser.js?v=6';
import { buildResume } from './build.js?v=6';
import { readSettings, validate, restoreSettings } from './settings.js?v=6';
import { renderResults, autosize } from './results.js?v=6';
import { downloadPDF, downloadTXT } from './resume.js?v=6';

const app = {
  page: 1,
  running: false,
  result: null,
  controller: null
};

/* ── page transitions + stepper ─────────────────────────────────────── */

const canGo = n => n === 1 || app.result !== null;

function go(page) {
  app.page = page;
  show($('page-input'),  page === 1);
  show($('page-result'), page === 2);
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
    go(n);
  };
  li.addEventListener('click', nav);
  li.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); nav(); }
  });
});

/* ── the CTA gate on page 1 ─────────────────────────────────────────── */

function refreshGate() {
  const btn = $('buildBtn');
  if (app.running) {
    btn.disabled = true;
    btn.textContent = 'WORKING…';
    return;
  }

  const missing = [];
  if (!$('resume').value.trim()) missing.push('RESUME');
  if (!$('jd').value.trim())     missing.push('JOB DESCRIPTION');
  if (!$('apiKey').value.trim()) missing.push('API KEY');

  const ready = missing.length === 0;
  btn.disabled = !ready;
  btn.textContent = ready ? 'BUILD MY RESUME' : 'ADD: ' + missing.join(' + ');
  $('gateHint').textContent = ready
    ? 'Ready to build.'
    : 'Still needed: ' + missing.join(', ').toLowerCase();
}

['resume', 'jd', 'apiKey'].forEach(id => $(id).addEventListener('input', refreshGate));

/* ── progress line under the button ─────────────────────────────────── */

function setProgress(text) {
  show($('progress'), Boolean(text));
  $('progressText').textContent = text || '';
}

/* ── Build ──────────────────────────────────────────────────────────── */

$('buildBtn').addEventListener('click', async () => {
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
  app.controller = new AbortController();
  refreshGate();
  setProgress('Starting…');

  try {
    app.result = await buildResume(settings, ev => {
      if (ev.type === 'stage:start') setProgress(ev.label + '…');
      if (ev.type === 'note')        setProgress(ev.text);
      if (ev.type === 'stage:done' && ev.stage === 'analyze') {
        setProgress(ev.data.role
          ? `Read the posting — ${ev.data.role}. Writing your resume…`
          : 'Posting read. Writing your resume…');
      }
    }, app.controller.signal);

    setProgress('');
    renderResults(app.result);
    go(2);
  } catch (e) {
    setProgress('');
    $('err').textContent = e?.name === 'AbortError'
      ? 'Cancelled.'
      : 'ERROR — ' + e.message;
    show($('err'));
  } finally {
    app.running = false;
    app.controller = null;
    refreshGate();
    refreshStepper();
  }
});

/* ── Result page actions ────────────────────────────────────────────── */

/* Always export what is on screen — the user may have edited it. */
const currentText = () => $('resumeOut').value;

$('dlPdf').addEventListener('click', () => {
  try {
    downloadPDF(currentText());
  } catch (e) {
    alert(e.message);
  }
});

$('dlTxt').addEventListener('click', () => downloadTXT(currentText()));

$('copyBtn').addEventListener('click', async () => {
  const btn = $('copyBtn');
  try {
    await navigator.clipboard.writeText(currentText());
    btn.textContent = 'COPIED';
  } catch {
    btn.textContent = 'COPY FAILED';
  }
  setTimeout(() => { btn.textContent = 'COPY TEXT'; }, 1600);
});

$('resumeOut').addEventListener('input', e => autosize(e.target));

$('startOver').addEventListener('click', () => {
  app.result = null;
  refreshGate();          // inputs are kept — handy for trying another posting
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

/* "custom model…" reveals the free-text slug field */
const syncCustomModel = () => show($('customModel'), $('modelSel').value === 'openrouter:custom');
$('modelSel').addEventListener('change', syncCustomModel);

restoreSettings();
syncCustomModel();
refreshGate();
go(1);
