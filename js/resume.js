/* ═══════════════════════════════════════════════════════════════════════
   resume.js — plain resume text → structure → PDF.

   The pipeline's output is deliberately plain text with standard uppercase
   headings, because that is what real ATS parsers read reliably. This
   module re-parses that text and builds the pdfmake document.

   The PDF is deliberately conservative: one column, real selectable text,
   standard headings, no tables, no graphics, no text boxes. Everything a
   strict parser can read top to bottom in the right order. The typography
   does the work that layout tricks would otherwise do — and layout tricks
   are exactly what gets a resume rejected before a human sees it.
   ═══════════════════════════════════════════════════════════════════════ */

const KNOWN_HEADINGS = new Set([
  'SUMMARY', 'PROFESSIONAL SUMMARY', 'OBJECTIVE', 'PROFILE',
  'SKILLS', 'TECHNICAL SKILLS', 'CORE COMPETENCIES',
  'EXPERIENCE', 'WORK EXPERIENCE', 'PROFESSIONAL EXPERIENCE', 'EMPLOYMENT',
  'PROJECTS', 'SELECTED PROJECTS',
  'EDUCATION', 'CERTIFICATIONS', 'CERTIFICATES',
  'ACHIEVEMENTS', 'AWARDS', 'PUBLICATIONS', 'LANGUAGES',
  'INTERESTS', 'VOLUNTEERING'
]);

/* Canonical section order — sections not listed keep their found order,
   at the end. A recruiter expects summary, then skills, then experience. */
const SECTION_ORDER = [
  'SUMMARY', 'PROFESSIONAL SUMMARY', 'OBJECTIVE', 'PROFILE',
  'SKILLS', 'TECHNICAL SKILLS', 'CORE COMPETENCIES',
  'EXPERIENCE', 'WORK EXPERIENCE', 'PROFESSIONAL EXPERIENCE', 'EMPLOYMENT',
  'PROJECTS', 'SELECTED PROJECTS',
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

/* A job entry line: "Title | Company | Location | Jan 2021 - Present".
   Also catches the looser "Title - Company, Jan 2021 - Present" that
   models sometimes emit. Rendered bold so roles scan at a glance. */
const HAS_DATES = /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}\b|\b(?:19|20)\d{2}\s*[-–]\s*(?:(?:19|20)\d{2}|Present|Current)\b/i;
function isEntryLine(line) {
  const t = line.trim();
  if (t.length > 130) return false;
  return t.includes('|') || HAS_DATES.test(t);
}

/* A skills line: "Languages: JavaScript, Python" — the label is bolded. */
const SKILL_LINE = /^([A-Z][A-Za-z /&+#.-]{1,34}):\s*(.+)$/;

/**
 * @param {string} text  the tailored resume, plain text
 * @returns {{name:string, contact:string[], sections:{heading:string,
 *            items:{type:'bullet'|'text'|'entry', text:string}[]}[]}}
 */
export function parseResumeText(text) {
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
  const model = { name: '', contact: [], sections: [] };
  let section = null;
  let seenName = false;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
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
    if (bullet) {
      section.items.push({ type: 'bullet', text: trimmed.replace(/^[-•*]\s+/, '') });
    } else {
      section.items.push({ type: isEntryLine(trimmed) ? 'entry' : 'text', text: trimmed });
    }
  }

  model.sections.sort((a, b) => sectionRank(a.heading) - sectionRank(b.heading));
  return model;
}

/* ── pdfmake ────────────────────────────────────────────────────────── */

/**
 * Single column, selectable text, standard headings, no tables or graphics.
 * @param {ReturnType<typeof parseResumeText>} model
 */
export function buildDocDefinition(model) {
  const content = [];

  // Name — the largest element on the page
  if (model.name) {
    content.push({ text: model.name.toUpperCase(), style: 'name' });
  }

  // Contact block — one line, pipe-separated, the form parsers handle best
  if (model.contact.length) {
    content.push({ text: model.contact.join('  |  '), style: 'contact' });
  }

  model.sections.forEach((section, i) => {
    content.push({ text: section.heading.toUpperCase(), style: 'h2', margin: [0, i === 0 ? 14 : 13, 0, 0] });
    // A rule under the heading is a drawn line, not a layout construct —
    // it carries no text, so it cannot confuse a parser.
    content.push({
      canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.7, lineColor: '#111111' }],
      margin: [0, 3, 0, 6]
    });

    // group consecutive bullets into one list; entries and paragraphs stay solo
    let bullets = null;
    const flush = () => {
      if (!bullets) return;
      content.push({
        ul: bullets.map(b => ({ text: b })),
        style: 'body',
        markerColor: '#111111',
        margin: [2, 0, 0, 5]
      });
      bullets = null;
    };

    for (const item of section.items) {
      if (item.type === 'bullet') {
        (bullets ??= []).push(item.text);
        continue;
      }

      flush();

      if (item.type === 'entry') {
        content.push({ text: item.text, style: 'entry' });
      } else {
        const skill = SKILL_LINE.exec(item.text);
        if (skill) {
          // "Languages: JavaScript, Python" — label bold, list regular.
          // One text node, so it still extracts as a single line.
          content.push({
            text: [{ text: skill[1] + ': ', bold: true }, { text: skill[2] }],
            style: 'body', margin: [0, 0, 0, 3]
          });
        } else {
          content.push({ text: item.text, style: 'body', margin: [0, 0, 0, 4] });
        }
      }
    }
    flush();
  });

  return {
    pageSize: 'A4',
    pageMargins: [50, 46, 50, 46],
    content,
    styles: {
      // No characterSpacing anywhere. Tracking makes pdfmake emit each glyph
      // as its own positioned run, and text extraction then rebuilds the word
      // with spaces in it ("PROFESSION AL SUMM ARY") — so a parser looking for
      // the standard heading never finds it. Legibility is not worth that.
      name:    { fontSize: 21, bold: true, color: '#111111', alignment: 'center',
                 margin: [0, 0, 0, 5] },
      contact: { fontSize: 9,  color: '#444444', alignment: 'center', margin: [0, 0, 0, 2] },
      h2:      { fontSize: 11, bold: true, color: '#111111' },
      entry:   { fontSize: 10, bold: true, color: '#111111', margin: [0, 4, 0, 3] },
      body:    { fontSize: 9.8, color: '#1A1A1A', lineHeight: 1.28 }
    },
    defaultStyle: { fontSize: 9.8, font: 'Roboto' },
    info: {
      title:  (model.name || 'Resume') + ' — Resume',
      author: model.name || 'Candidate'
    }
  };
}

export function pdfFilename(model) {
  const base = (model.name || 'Resume')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'Resume';
  return `${base}_Resume.pdf`;
}

/** Build and download the PDF. Throws a friendly error if pdfmake is absent. */
export function downloadPDF(resumeText) {
  if (!window.pdfMake) throw new Error('pdfmake failed to load (offline?). Use "Download TXT" instead.');
  const model = parseResumeText(resumeText);
  window.pdfMake.createPdf(buildDocDefinition(model)).download(pdfFilename(model));
}

export function downloadTXT(resumeText) {
  const model = parseResumeText(resumeText);
  const blob = new Blob([resumeText], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = pdfFilename(model).replace(/\.pdf$/, '.txt');
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
