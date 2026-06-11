require('dotenv').config();

// Supports both formats in .env:
//   GROQ_API_KEY=xxx          (single key, backward compatible)
//   GROQ_API_KEY_1=xxx        (multi-key)
//   GROQ_API_KEY_2=yyy
//   GROQ_API_KEY_3=zzz
// Same pattern for CLAUDE_API_KEY and OPENAI_API_KEY.

const PROVIDERS = ['groq', 'claude', 'openai'];

// pool[provider] = [{ key, failedUntil }]
const pool     = {};
const counters = {};

PROVIDERS.forEach(p => {
  pool[p]     = [];
  counters[p] = -1;

  const prefix = p.toUpperCase() + '_API_KEY';
  const seen   = new Set();

  const add = val => {
    if (val && !seen.has(val)) { seen.add(val); pool[p].push({ key: val, failedUntil: 0 }); }
  };

  add(process.env[prefix]);                                    // GROQ_API_KEY
  for (let i = 1; i <= 20; i++) {
    const val = process.env[`${prefix}_${i}`];
    if (!val) break;
    add(val);                                                  // GROQ_API_KEY_1 … _20
  }

  if (pool[p].length > 0) {
    console.log(`[KeyManager] ${p.padEnd(6)}: ${pool[p].length} key(s) loaded`);
  }
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function mask(key) {
  return key.slice(0, 6) + '...' + key.slice(-4);
}

function isKeyError(err) {
  const status = err?.status || err?.response?.status;
  const msg = (
    err?.error?.message ||
    err?.response?.data?.error?.message ||
    err?.message || ''
  ).toLowerCase();

  return (
    status === 401 || status === 429 || status === 402 ||
    msg.includes('rate limit')        ||
    msg.includes('quota')             ||
    msg.includes('invalid api key')   ||
    msg.includes('invalid_api_key')   ||
    msg.includes('expired')           ||
    msg.includes('insufficient_quota')
  );
}

function cooldownMs(err) {
  // Respect Retry-After header when present
  const retryAfter = err?.response?.headers?.['retry-after'] || err?.headers?.['retry-after'];
  if (retryAfter) return parseInt(retryAfter) * 1000;

  const status = err?.status || err?.response?.status;
  if (status === 401) return 6 * 60 * 60 * 1000;  // bad key → 6 h cooldown
  if (status === 429) return 60 * 1000;             // rate limit → 1 min
  return 60 * 1000;
}

// ── Public API ────────────────────────────────────────────────────────────────

function getKey(provider) {
  const p   = pool[provider] || [];
  const now = Date.now();

  let available = p.filter(e => e.failedUntil <= now);

  if (available.length === 0) {
    // All on cooldown — release the one that recovers soonest
    const soonest = [...p].sort((a, b) => a.failedUntil - b.failedUntil)[0];
    if (!soonest) throw new Error(`No API keys configured for provider: ${provider}`);
    soonest.failedUntil = 0;
    available = [soonest];
    console.warn(`[KeyManager] All ${provider} keys on cooldown — releasing soonest`);
  }

  counters[provider] = (counters[provider] + 1) % available.length;
  return available[counters[provider]].key;
}

function markFailed(provider, key, ms) {
  const entry = (pool[provider] || []).find(e => e.key === key);
  if (entry) {
    entry.failedUntil = Date.now() + ms;
    console.warn(`[KeyManager] ${provider} key ${mask(key)} on cooldown for ${ms / 1000}s`);
  }
}

function getCount(provider) {
  return (pool[provider] || []).length;
}

function getStatus() {
  const now = Date.now();
  const out = {};
  PROVIDERS.forEach(p => {
    out[p] = (pool[p] || []).map((e, i) => ({
      index:      i + 1,
      key:        mask(e.key),
      available:  e.failedUntil <= now,
      cooldownSec: Math.max(0, Math.round((e.failedUntil - now) / 1000)),
    }));
  });
  return out;
}

// Wraps any API call with automatic key rotation + retry.
// callFn receives the selected API key and must return a Promise.
// On a key-related error the key is cooled down and the next key is tried.
async function callWithRetry(provider, callFn) {
  const tries = Math.max(1, getCount(provider));
  let lastErr;

  for (let i = 0; i < tries; i++) {
    const apiKey = getKey(provider);
    try {
      return await callFn(apiKey);
    } catch (err) {
      if (isKeyError(err)) {
        markFailed(provider, apiKey, cooldownMs(err));
        lastErr = err;
        console.warn(`[KeyManager] ${provider} key failed — trying next key (${i + 1}/${tries})`);
        continue;
      }
      throw err; // not a key error — propagate immediately
    }
  }

  throw lastErr || new Error(`All ${provider} API keys failed`);
}

module.exports = { getKey, markFailed, getCount, getStatus, callWithRetry };
