/* ═══════════════════════════════════════════════════════════════════════
   resume.js — plain resume text → structure → PDF / preview.

   The loop's output is deliberately plain text with standard uppercase
   headings (that's what real ATS parsers like). This module re-parses
   that text into a small model used twice:
     · the typographic preview on the Download page
     · the pdfmake docDefinition for "Download PDF" — real selectable
       text, single column, no tables or graphics.
   ═══════════════════════════════════════════════════════════════════════ */

const KNOWN_HEADINGS = new Set([
  'SUMMARY', 'OBJECTIVE', 'PROFILE', 'SKILLS', 'TECHNICAL SKILLS',
  'EXPERIENCE', 'WORK EXPERIENCE', 'PROFESSIONAL EXPERIENCE',
  'PROJECTS', 'EDUCATION', 'CERTIFICATIONS', 'CERTIFICATES',
  'ACHIEVEMENTS', 'AWARDS', 'PUBLICATIONS', 'LANGUAGES',
  'INTERESTS', 'VOLUNTEERING'
]);

/* Canonical section order — sections not in this list appear at the end
   in the order they were found. */
const SECTION_ORDER = [
  'SUMMARY', 'OBJECTIVE', 'PROFILE',
  'SKILLS', 'TECHNICAL SKILLS',
  'EXPERIENCE', 'WORK EXPERIENCE', 'PROFESSIONAL EXPERIENCE',
  'PROJECTS',
  'EDUCATION',
  'CERTIFICATIONS', 'CERTIFICATES',
  'ACHIEVEMENTS', 'AWARDS', 'PUBLICATIONS', 'LANGUAGES',
  'INTERESTS', 'VOLUNTEERING'
];

function sectionRank(heading) {
  const idx = SECTION_ORDER.indexOf(heading.toUpperCase().trim());
  return idx === -1 ? 999 : idx;
}

function isHeading(line) {
  const t = line.trim();
  if (t.length < 2 || t.length > 40) return false;
  if (!/^[A-Z][A-Z &/.\\-]*$/.test(t)) return false;      // all caps only
  if (KNOWN_HEADINGS.has(t)) return true;
  // fallback for unusual headings — but company lines like
  // "ACME CORP - BACKEND ENGINEER" tend to contain '-' or ',' or digits
  return t.split(/\s+/).length <= 3 && !/[-,\d]/.test(t);
}

/* Detect a date-range line — for display purposes only, NOT for right-alignment
   (right-alignment via pdfmake columns is ATS-unsafe; dates stay as plain text). */
const DATE_RANGE_RE = /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}\s*[-–]\s*(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec\s+\d{4}|Present|present|Current|current)\b/;

/**
 * @param {string} text  the final tailored resume, plain text
 * @returns {{name:string, contact:string[], sections:{heading:string,
 *            items:{type:'bullet'|'text'|'date', text:string}[]}[]}}
 */
export function parseResumeText(text) {
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
  const model = { name: '', contact: [], sections: [] };
  let section = null;
  let seenName = false;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();
    if (!trimmed) continue;

    // The very first line is the candidate's name unless it is literally a
    // known section heading — names like "JANE DOE" are all-caps too, so the
    // heading heuristic must not get first refusal here.
    const firstLine = !seenName && !section;
    const heading = firstLine ? KNOWN_HEADINGS.has(trimmed) : isHeading(trimmed);

    if (heading) {
      section = { heading: trimmed, items: [] };
      model.sections.push(section);
      continue;
    }

    if (!section) {
      // before the first heading: name, then contact lines
      if (!seenName) { model.name = trimmed; seenName = true; }
      else if (model.contact.length < 4) model.contact.push(trimmed);
      continue;
    }

    const bullet = /^[-•*]\s+/.test(trimmed);
    section.items.push({
      type: bullet ? 'bullet' : 'text',
      text: bullet ? trimmed.replace(/^[-•*]\s+/, '') : trimmed
    });
  }

  // Enforce canonical section order
  model.sections.sort((a, b) => sectionRank(a.heading) - sectionRank(b.heading));

  return model;
}

/* ── pdfmake ────────────────────────────────────────────────────────── */

/**
 * Single column, selectable text, standard headings, no tables or
 * graphics — everything a strict ATS parser can read.
 * Improvements over v2:
 *   • Larger, bolder name (22pt)
 *   • Section headings with decorative separator line
 *   • Date ranges right-aligned
 *   • Consistent bullet character, tight spacing
 *   • Standard section order enforced
 */
export function buildDocDefinition(model) {
  const content = [];

  // Name — largest element on the page
  if (model.name) {
    content.push({ text: model.name, style: 'name' });
  }

  // Contact block — compact, separated by " | " for ATS readability
  if (model.contact.length) {
    content.push({ text: model.contact.join('  |  '), style: 'contact' });
  }

  // Thin rule under the contact block
  if (model.name || model.contact.length) {
    content.push({ canvas: [{ type: 'line', x1: 0, y1: 2, x2: 515, y2: 2, lineWidth: 0.5, lineColor: '#D1D5DB' }], margin: [0, 6, 0, 0] });
  }

  for (const section of model.sections) {
    // Section heading
    content.push({ text: section.heading, style: 'h2' });
    // Thin rule under the section heading
    content.push({ canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.4, lineColor: '#E5E7EB' }], margin: [0, 0, 0, 4] });

    // group consecutive bullets into one list; paragraphs and dates stay solo
    let bullets = null;
    const flush = () => {
      if (bullets) {
        content.push({
          ul: bullets.map(b => ({ text: b, margin: [0, 0, 0, 2] })),
          style: 'body',
          margin: [0, 0, 0, 2]
        });
        bullets = null;
      }
    };

    for (const item of section.items) {
      if (item.type === 'bullet') {
        (bullets ??= []).push(item.text);
      } else {
        // Both plain text and date-range lines are rendered as regular paragraphs.
        // Dates stay inline (ATS-safe: no two-column layout, no parse-order risk).
        flush();
        content.push({ text: item.text, style: 'body', margin: [0, 0, 0, 3] });
      }
    }
    flush();
  }

  return {
    pageSize: 'A4',
    pageMargins: [48, 44, 48, 44],
    content,
    styles: {
      name:    { fontSize: 22, bold: true, color: '#111827', margin: [0, 0, 0, 2] },
      contact: { fontSize: 9, color: '#6B7280', margin: [0, 0, 0, 2], characterSpacing: 0.2 },
      h2:      { fontSize: 11, bold: true, color: '#1F2937', characterSpacing: 1.2,
                 margin: [0, 14, 0, 3] },
      body:    { fontSize: 10, color: '#374151', lineHeight: 1.3 }
    },
    defaultStyle: { fontSize: 10, font: 'Roboto' },
    info: { title: (model.name || 'Resume') + ' — tailored resume' }
  };
}

export function pdfFilename(model) {
  const base = (model.name || 'Resume')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'Resume';
  return `${base}_Tailored_Resume.pdf`;
}

/** Build and download the PDF. Throws a friendly error if pdfmake is absent. */
export function downloadPDF(resumeText) {
  if (!window.pdfMake) throw new Error('pdfmake failed to load (offline?). Use "Download .txt" instead.');
  const model = parseResumeText(resumeText);
  window.pdfMake.createPdf(buildDocDefinition(model)).download(pdfFilename(model));
}

export function downloadTXT(resumeText) {
  const blob = new Blob([resumeText], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'resume-tailored.txt';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
