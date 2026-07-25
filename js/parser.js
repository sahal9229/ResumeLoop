/* ═══════════════════════════════════════════════════════════════════════
   parser.js — resume file → plain text, entirely in the browser.
   Nothing is uploaded anywhere; pdf.js and mammoth both run client-side.
   ═══════════════════════════════════════════════════════════════════════ */

/* pdf.js is loaded as a classic script in index.html, so it lives on window. */
if (window.pdfjsLib) {
  window.pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
}

/**
 * @param {File} file  .pdf, .docx, or any plain-text format
 * @returns {Promise<string>}
 */
export async function fileToText(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith('.pdf'))  return pdfToText(file);
  if (name.endsWith('.docx')) return docxToText(file);
  return (await file.text()).trim();
}

/* PDFs have no concept of a line — pdf.js hands back positioned text runs.
   We rebuild lines by watching the y coordinate for a jump. */
async function pdfToText(file) {
  if (!window.pdfjsLib) throw new Error('pdf.js failed to load (offline?). Paste the resume text instead.');

  const pdf = await window.pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
  let out = '';

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();

    let line = '', lastY = null, pageText = '';
    for (const item of content.items) {
      const y = Math.round(item.transform[5]);
      if (lastY !== null && Math.abs(y - lastY) > 2) {   // new line
        pageText += line.trimEnd() + '\n';
        line = '';
      }
      lastY = y;
      line += item.str + (item.hasEOL ? '\n' : ' ');
    }
    out += pageText + line + '\n\n';
  }

  return out.replace(/\n{3,}/g, '\n\n').trim();
}

async function docxToText(file) {
  if (!window.mammoth) throw new Error('mammoth.js failed to load (offline?). Paste the resume text instead.');
  const { value } = await window.mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  return value.trim();
}
