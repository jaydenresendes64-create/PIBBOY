/**
 * Vercel Serverless Function — journal analysis for the LOG tab.
 *
 *   GET  /api/analyze                 → { ok: true|false }  (is an API key configured?)
 *   POST /api/analyze {text, skills}  → { proposal: { xp, reason, skillGains } } | { error }
 *
 * The API key only exists here, in the OPENAI_API_KEY environment variable;
 * the browser never sees it. The prompt is built here too, so this endpoint
 * can only turn a diary entry into a reward proposal — it can't be used as an
 * open proxy to the model. Nothing is applied: the app shows the proposal
 * and waits for Accept/Reject.
 *
 * Environment variables:
 *   OPENAI_API_KEY  required  API key (an Azure OpenAI key works too, see AI_BASE_URL)
 *   AI_MODEL        optional  model name, or Azure deployment name   (default gpt-4o-mini)
 *   AI_BASE_URL     optional  OpenAI-compatible base URL             (default https://api.openai.com/v1)
 *                             Azure OpenAI: https://<resource>.openai.azure.com/openai/v1
 */
'use strict';

const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_MODEL = 'gpt-4o-mini';
const MAX_TEXT_LENGTH = 4000;          // longer entries are analyzed on their first 4000 characters
const MAX_OUTPUT_TOKENS = 300;
const UPSTREAM_TIMEOUT_MS = 9000;      // under the 10 s default limit of Vercel's Hobby plan
const SKILL_KEY = /^[A-Z][A-Z_]{1,19}$/;

// Same prompt the in-Claude version sent through sample().
function buildPrompt(text, skillKeys) {
  return 'You are a supportive game master converting a real personal diary entry into small role-playing game rewards for a life-tracking app.\n' +
    'Valid skill keys: ' + skillKeys.join(', ') + '.\n' +
    'Diary entry: "' + text.replace(/"/g, "'") + '"\n' +
    'Reply with ONLY JSON, no other text, in exactly this shape:\n' +
    '{"xp": <integer 5-80>, "reason": "<reason, under 10 words>", "skillGains": [{"skill": "<valid skill key>", "amount": <1-3>}]}\n' +
    'Include at most 2 skillGains, only ones clearly supported by the entry. Empty array is fine. If the entry is vague, use xp 5-10 and an empty array.';
}

// The model is told to reply with bare JSON; tolerate a ```json fence or a
// stray sentence around it anyway. The browser still sanitizes every field.
function parseJsonObject(content) {
  if (typeof content !== 'string') return null;
  const start = content.indexOf('{');
  const end = content.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    const value = JSON.parse(content.slice(start, end + 1));
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch (e) {
    return null;
  }
}

function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch (e) { return {}; }
  }
  return {};
}

// Browsers attach Origin to every POST made with fetch(), so this stops other
// websites from spending your credits through a visitor's browser. Scripts
// outside a browser can fake the header: the budget limit on the API key's
// project is what actually caps the cost.
function isCrossSite(req) {
  const origin = req.headers.origin;
  if (!origin) return false;
  try {
    return new URL(origin).host !== req.headers.host;
  } catch (e) {
    return true;
  }
}

module.exports = async function handler(req, res) {
  const apiKey = process.env.OPENAI_API_KEY;
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    return res.status(200).json({ ok: Boolean(apiKey) });
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }
  if (!apiKey) return res.status(503).json({ error: 'not_configured' });
  if (isCrossSite(req)) return res.status(403).json({ error: 'forbidden' });

  const body = readBody(req);
  const text = typeof body.text === 'string' ? body.text.trim().slice(0, MAX_TEXT_LENGTH) : '';
  const skills = Array.isArray(body.skills)
    ? body.skills.filter((s) => typeof s === 'string' && SKILL_KEY.test(s)).slice(0, 12)
    : [];
  if (!text || skills.length === 0) return res.status(400).json({ error: 'bad_request' });

  let baseUrl;
  try {
    baseUrl = new URL((process.env.AI_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, ''));
  } catch (e) {
    console.error('AI_BASE_URL is not a valid URL');
    return res.status(500).json({ error: 'bad_config' });
  }
  const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey };
  if (/\.azure\.com$/i.test(baseUrl.hostname)) headers['api-key'] = apiKey;   // Azure's key header

  let upstream;
  try {
    upstream = await fetch(baseUrl.href.replace(/\/+$/, '') + '/chat/completions', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: process.env.AI_MODEL || DEFAULT_MODEL,
        messages: [{ role: 'user', content: buildPrompt(text, skills) }],
        max_completion_tokens: MAX_OUTPUT_TOKENS,
      }),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch (e) {
    return res.status(504).json({ error: 'upstream_unreachable' });
  }
  if (!upstream.ok) {
    // Log the status only — never the key or the diary text.
    console.error('AI provider answered HTTP ' + upstream.status);
    return res.status(502).json({ error: 'upstream_error' });
  }

  const data = await upstream.json().catch(() => null);
  const choice = data && Array.isArray(data.choices) ? data.choices[0] : null;
  const proposal = parseJsonObject(choice && choice.message ? choice.message.content : null);
  if (!proposal) return res.status(502).json({ error: 'bad_model_output' });
  return res.status(200).json({ proposal });
};
