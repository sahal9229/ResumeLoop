/* dom.js — the four helpers every other module borrows. Nothing app-specific. */

export const $ = id => document.getElementById(id);

export const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
};

/* Escape anything that came from a model before it touches innerHTML. */
export const esc = s => String(s ?? '').replace(/[&<>"]/g,
  c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));

/* Models sometimes return a bare string where the schema promised a list. */
export const arr = v => Array.isArray(v) ? v : (v == null ? [] : [v]);

export const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, Number(n) || 0));

export const show = (node, on = true) => node.classList.toggle('hidden', !on);
