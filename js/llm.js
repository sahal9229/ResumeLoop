/* ═══════════════════════════════════════════════════════════════════════
   llm.js — THE MODEL CALL.

   This is the only file in the project that knows a language model exists.
   The loop in loop.js is plain JavaScript wrapped around callLLM().

   Two layers of resilience live here, because a class demo on a free API
   tier must not crash:
     · retry with exponential backoff on 429 / 5xx / network blips
     · a JSON re-ask when the model wraps its reply in prose
   ═══════════════════════════════════════════════════════════════════════ */

const MAX_RETRIES = 3;
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 529]);

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

/**
 * One request, one completion, as raw text — with backoff retries.
 * @param {{provider:string, model:string, apiKey:string}} cfg
 * @param {string} systemPrompt
 * @param {string} userPrompt
 * @param {AbortSignal} [signal]
 * @param {{note?:(text:string)=>void, api?:(info:object)=>void}} [hooks]
 *        note — retry banners for the UI
 *        api  — wire-level telemetry: {kind:'request'|'response'|'retry', …}
 *               so the dashboard can show every call as it happens
 * @returns {Promise<string>}
 */
export async function callLLM(cfg, systemPrompt, userPrompt, signal, hooks = {}) {
  let attempt = 0;
  while (true) {
    try {
      return await singleCall(cfg, systemPrompt, userPrompt, signal, hooks, attempt);
    } catch (e) {
      const retryable =
        (e instanceof HttpError && RETRYABLE_STATUS.has(e.status)) ||
        e instanceof TypeError;               // fetch network failure
      if (!retryable || attempt >= MAX_RETRIES || signal?.aborted) throw e;

      attempt++;
      const wait = Math.min(8000, 1000 * 2 ** (attempt - 1)) + Math.random() * 400;
      hooks.api?.({ kind: 'retry', attempt, max: MAX_RETRIES, waitMs: Math.round(wait), status: e.status });
      hooks.note?.(
        (e instanceof HttpError && e.status === 429
          ? 'Rate limited by the API'
          : 'Transient API error')
        + ` — retrying in ${Math.round(wait / 1000)}s (attempt ${attempt}/${MAX_RETRIES})…`
      );
      await delay(wait, signal);
    }
  }
}

function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      reject(new DOMException('Aborted', 'AbortError'));
    }, { once: true });
  });
}

async function singleCall(cfg, systemPrompt, userPrompt, signal, hooks = {}, attempt = 0) {
  const { provider, model, apiKey } = cfg;
  if (!apiKey) throw new Error('No API key. Add one on the Upload page.');

  const req = provider === 'gemini'
    ? geminiRequest(model, apiKey, systemPrompt, userPrompt)
    : openRouterRequest(model, apiKey, systemPrompt, userPrompt);

  const body = JSON.stringify(req.body);
  hooks.api?.({ kind: 'request', provider, model, attempt, bytes: body.length });
  const t0 = performance.now();

  const res = await fetch(req.url, {
    method: 'POST',
    headers: req.headers,
    body,
    signal
  });
  const raw = await res.text();
  const ms = Math.round(performance.now() - t0);
  hooks.api?.({ kind: 'response', status: res.status, ok: res.ok, ms, bytes: raw.length });

  // Bad-key shapes differ per provider: OpenRouter says 401/403,
  // Gemini says 400 with API_KEY_INVALID in the body.
  const badKey = res.status === 401 || res.status === 403 ||
    (res.status === 400 && /API_KEY_INVALID|API key not valid/i.test(raw));
  if (badKey)
    throw new HttpError(res.status,
      `${provider} rejected your API key (HTTP ${res.status}). Check that the key is valid and matches the chosen model provider — Gemini keys start with "AIza", OpenRouter keys with "sk-or-".`);

  if (!res.ok) throw new HttpError(res.status, `${provider} HTTP ${res.status} — ${raw.slice(0, 300)}`);

  let data;
  try { data = JSON.parse(raw); }
  catch { throw new Error('Provider returned a non-JSON envelope: ' + raw.slice(0, 300)); }

  const text = req.pick(data);
  if (!text) throw new Error('Empty completion. Full response: ' + raw.slice(0, 400));
  return text;
}

/* ── Google Gemini ──────────────────────────────────────────────────── */
function geminiRequest(model, apiKey, systemPrompt, userPrompt) {
  // Gemini 2.5+ spends "thinking" tokens out of the same output budget as
  // the answer, so a full revised resume needs real headroom. 2.0-era
  // models cap at 8192 and reject anything larger.
  const roomy = /2\.5|[3-9]\./.test(model);

  return {
    url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    headers: { 'Content-Type': 'application/json' },
    body: {
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      generationConfig: {
        // 0 = repeatable verdicts. The checker's 9 pass/fail judgments must
        // not flip lap to lap on sampling noise — that reads as a broken loop.
        temperature: 0,
        responseMimeType: 'application/json',
        maxOutputTokens: roomy ? 32768 : 8192
      }
    },
    pick: d => {
      const cand = d.candidates?.[0];
      const text = (cand?.content?.parts || []).map(p => p.text || '').join('');
      if (!text && cand?.finishReason === 'MAX_TOKENS')
        throw new Error('Model hit its output limit before answering. Try a shorter resume/JD, or a model with a bigger output budget.');
      if (!text && cand?.finishReason && cand.finishReason !== 'STOP')
        throw new Error('Model stopped early (finishReason: ' + cand.finishReason + ').');
      return text;
    }
  };
}

/* ── OpenRouter (and anything else OpenAI-compatible) ───────────────── */
function openRouterRequest(model, apiKey, systemPrompt, userPrompt) {
  return {
    url: 'https://openrouter.ai/api/v1/chat/completions',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: {
      model,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userPrompt }
      ]
    },
    pick: d => d.choices?.[0]?.message?.content || ''
  };
}

/* ═══════════════════════════════════════════════════════════════════════
   JSON layer — every stage of the loop returns structured data, so the
   Process page can render fields instead of parsing prose.
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Call the model and insist on one JSON object. Re-asks once, telling the
 * model what it got wrong, before giving up.
 * @returns {Promise<{json:object, raw:string}>}
 */
export async function askJSON(cfg, prompt, signal, hooks = {}) {
  let lastText = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    const sys = attempt === 0
      ? prompt.sys
      : prompt.sys + '\n\nYour previous reply was not valid JSON. Reply with ONE valid JSON object and nothing else — no markdown fences, no prose.';

    lastText = await callLLM(cfg, sys, prompt.user, signal, hooks);
    const parsed = extractJSON(lastText);
    if (parsed) {
      // e.g. "atsScore, matchedKeywords[12], missingKeywords[24]"
      const fields = Object.entries(parsed)
        .map(([k, v]) => Array.isArray(v) ? `${k}[${v.length}]` : k).join(', ');
      hooks.api?.({ kind: 'parsed', fields });
      return { json: parsed, raw: lastText };
    }
    hooks.api?.({ kind: 'parse-fail' });
    hooks.note?.('Model returned malformed JSON — asking it to correct itself…');
  }
  throw new Error('Model did not return parseable JSON after 2 tries:\n' + lastText.slice(0, 500));
}

/** Tolerate ```json fences and stray prose around the object. */
export function extractJSON(text) {
  const t = String(text).trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '')
    .trim();

  try { return JSON.parse(t); } catch { /* fall through */ }

  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a !== -1 && b > a) {
    try { return JSON.parse(t.slice(a, b + 1)); } catch { /* give up */ }
  }
  return null;
}
