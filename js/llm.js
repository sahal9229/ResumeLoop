/* ═══════════════════════════════════════════════════════════════════════
   llm.js — THE MODEL CALL.

   Every model runs through OpenRouter: one API key, one endpoint, any
   model slug. This is the only file that knows a language model exists —
   build.js is plain JavaScript wrapped around askJSON().

   Two layers of resilience live here, because a rate limit must not drop
   someone's resume on the floor:
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
 * @param {{model:string, apiKey:string}} cfg  model = an OpenRouter slug
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
  const { model, apiKey } = cfg;
  if (!apiKey) throw new Error('No API key. Add one on the input page.');

  const req = openRouterRequest(model, apiKey, systemPrompt, userPrompt);

  const body = JSON.stringify(req.body);
  hooks.api?.({ kind: 'request', model, attempt, bytes: body.length });
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

  if (res.status === 401 || res.status === 403)
    throw new HttpError(res.status,
      `OpenRouter rejected your API key (HTTP ${res.status}). Check the key is valid and still active at openrouter.ai/keys. OpenRouter keys start with "sk-or-".`);

  // 402 is its own thing: the key works, the account is out of credit.
  if (res.status === 402)
    throw new HttpError(res.status,
      'OpenRouter says this key is out of credit. Top up at openrouter.ai/credits, or pick a cheaper model.');

  // A model slug that does not exist comes back 400/404 with a body that
  // names it — surface that instead of a bare status code.
  if ((res.status === 400 || res.status === 404) && /model/i.test(raw))
    throw new HttpError(res.status,
      `OpenRouter did not accept the model "${model}". Check the slug at openrouter.ai/models. Details: ${raw.slice(0, 200)}`);

  if (!res.ok) throw new HttpError(res.status, `OpenRouter HTTP ${res.status} — ${raw.slice(0, 300)}`);

  let data;
  try { data = JSON.parse(raw); }
  catch { throw new Error('OpenRouter returned a non-JSON envelope: ' + raw.slice(0, 300)); }

  // OpenRouter reports upstream provider failures in a 200 body.
  if (data.error)
    throw new Error('OpenRouter error: ' + (data.error.message || JSON.stringify(data.error)).slice(0, 300));

  const text = req.pick(data);
  if (!text) {
    const reason = data.choices?.[0]?.finish_reason;
    if (reason === 'length')
      throw new Error('The model hit its output limit before finishing. Try a shorter resume or job description, or pick a model with a larger output budget.');
    throw new Error('Empty completion. Full response: ' + raw.slice(0, 400));
  }
  return text;
}

/* ── OpenRouter — the only transport. One key, every model. ─────────── */

/** Which routes accept response_format: json_object. */
const supportsJsonMode = model => /^(openai|mistralai|deepseek|qwen)\//i.test(model);

function openRouterRequest(model, apiKey, systemPrompt, userPrompt) {
  return {
    url: 'https://openrouter.ai/api/v1/chat/completions',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      // OpenRouter attributes usage to the calling app via these two.
      'HTTP-Referer': location.origin,
      'X-Title': 'ResumeFit'
    },
    body: {
      model,
      temperature: 0.2,
      // A full resume plus its report is a long reply; the default cap on
      // some routes truncates it mid-JSON, which reads as a parse failure.
      max_tokens: 8000,
      // Only OpenAI-family routes honour json_object. Sending it to a model
      // that does not support it is a 400 on some providers, so ask for it
      // only where it works — every prompt already demands JSON in words,
      // and askJSON() re-asks if a reply comes back wrapped in prose.
      ...(supportsJsonMode(model) ? { response_format: { type: 'json_object' } } : {}),
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userPrompt }
      ]
    },
    pick: d => d.choices?.[0]?.message?.content || ''
  };
}

/* ═══════════════════════════════════════════════════════════════════════
   JSON layer — both stages return structured data, so the Result page
   renders fields instead of parsing prose.
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
