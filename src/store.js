// src/store.js — in-memory + Firestore-backed storage for logs, feedback, system prompt

let _db = null;

function getDb() {
  if (_db) return _db;
  const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY } = process.env;
  if (!FIREBASE_PROJECT_ID || !FIREBASE_CLIENT_EMAIL || !FIREBASE_PRIVATE_KEY) return null;
  try {
    const admin = require('firebase-admin');
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId:   FIREBASE_PROJECT_ID,
          clientEmail: FIREBASE_CLIENT_EMAIL,
          privateKey:  FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        }),
      });
    }
    _db = admin.firestore();
    return _db;
  } catch { return null; }
}

// In-memory fallback (used when Firestore not configured)
const _mem = { logs: [], feedback: [] };
const MAX_MEM = 500;

// Session tokens: { [`${app}:${sessionId}`]: { tokenKey: tokenValue } }
const _sessions = {};

// API call log (in-memory + Firestore)
const _apiCalls  = [];
const MAX_CALLS  = 200;

// Prompt override cache (TTL: 60s)
const _promptCache = {};
const PROMPT_TTL   = 60_000;

// ── Conversation Logs ─────────────────────────────────────────────────────────

async function saveLog(app, data) {
  const entry = { ...data, app, ts: Date.now() };
  _mem.logs.unshift(entry);
  if (_mem.logs.length > MAX_MEM) _mem.logs.length = MAX_MEM;

  const db = getDb();
  if (!db) return entry;
  try {
    const ref = await db.collection('logs').add(entry);
    return { ...entry, id: ref.id };
  } catch { return entry; }
}

async function getLogs(app, limit = 100) {
  const db = getDb();
  if (!db) return _mem.logs.filter(l => l.app === app).slice(0, limit);
  try {
    const snap = await db.collection('logs')
      .where('app', '==', app)
      .orderBy('ts', 'desc')
      .limit(limit)
      .get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch {
    return _mem.logs.filter(l => l.app === app).slice(0, limit);
  }
}

// ── Feedback ──────────────────────────────────────────────────────────────────

async function saveFeedback(app, data) {
  const entry = { ...data, app, ts: Date.now() };
  _mem.feedback.unshift(entry);
  if (_mem.feedback.length > MAX_MEM) _mem.feedback.length = MAX_MEM;

  const db = getDb();
  if (!db) return { id: Date.now().toString(36) };
  try {
    const ref = await db.collection('feedback').add(entry);
    return { id: ref.id };
  } catch { return { id: Date.now().toString(36) }; }
}

async function getFeedback(app, limit = 100) {
  const db = getDb();
  if (!db) return _mem.feedback.filter(f => f.app === app).slice(0, limit);
  try {
    const snap = await db.collection('feedback')
      .where('app', '==', app)
      .orderBy('ts', 'desc')
      .limit(limit)
      .get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch {
    return _mem.feedback.filter(f => f.app === app).slice(0, limit);
  }
}

// ── System Prompt ─────────────────────────────────────────────────────────────

async function getSystemPrompt(app) {
  const db = getDb();
  if (!db) return _promptCache[app]?.value || null;
  try {
    const doc = await db.collection('settings').doc(app).get();
    if (!doc.exists) return null;
    return doc.data().systemPrompt || null;
  } catch { return _promptCache[app]?.value || null; }
}

async function getSystemPromptCached(app) {
  const now = Date.now();
  if (_promptCache[app] && _promptCache[app].exp > now) return _promptCache[app].value;
  const value = await getSystemPrompt(app);
  _promptCache[app] = { value, exp: now + PROMPT_TTL };
  return value;
}

async function saveSystemPrompt(app, prompt) {
  delete _promptCache[app];
  const db = getDb();
  if (!db) {
    _promptCache[app] = { value: prompt, exp: Infinity };
    return;
  }
  try {
    await db.collection('settings').doc(app).set({ systemPrompt: prompt }, { merge: true });
  } catch {
    _promptCache[app] = { value: prompt, exp: Infinity };
  }
}

async function resetSystemPrompt(app) {
  delete _promptCache[app];
  const db = getDb();
  if (!db) return;
  try {
    await db.collection('settings').doc(app).set({ systemPrompt: null }, { merge: true });
  } catch {}
}

async function deleteLog(app, id) {
  _mem.logs = _mem.logs.filter(l => !(l.app === app && l.id === id));
  const db = getDb();
  if (!db) return;
  try { await db.collection('logs').doc(id).delete(); } catch {}
}

async function deleteAllLogs(app) {
  _mem.logs = _mem.logs.filter(l => l.app !== app);
  const db = getDb();
  if (!db) return;
  try {
    const snap = await db.collection('logs').where('app', '==', app).get();
    const batch = db.batch();
    snap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
  } catch {}
}

// ── Session Tokens ────────────────────────────────────────────────────────────

async function getSessionTokens(app, sessionId) {
  const key = `${app}:${sessionId}`;
  if (_sessions[key]) return { ..._sessions[key] };
  const db = getDb();
  if (db) {
    try {
      const doc = await db.collection('sessions').doc(key).get();
      if (doc.exists) {
        _sessions[key] = doc.data().tokens || {};
        return { ..._sessions[key] };
      }
    } catch {}
  }
  return {};
}

async function setSessionToken(app, sessionId, tokenKey, tokenValue) {
  const key = `${app}:${sessionId}`;
  if (!_sessions[key]) _sessions[key] = {};
  _sessions[key][tokenKey] = tokenValue;
  const db = getDb();
  if (db) {
    try {
      await db.collection('sessions').doc(key).set(
        { tokens: _sessions[key], app, sessionId, updatedAt: Date.now() },
        { merge: true }
      );
    } catch {}
  }
}

// ── API Call Log ──────────────────────────────────────────────────────────────

async function saveApiCall(app, data) {
  const entry = { ...data, app, ts: Date.now() };
  _apiCalls.unshift(entry);
  if (_apiCalls.length > MAX_CALLS) _apiCalls.length = MAX_CALLS;
  const db = getDb();
  if (!db) return entry;
  try { await db.collection('apicalls').add(entry); } catch {}
  return entry;
}

async function getApiCalls(app, limit = 100) {
  const db = getDb();
  if (!db) return _apiCalls.filter(c => c.app === app).slice(0, limit);
  try {
    const snap = await db.collection('apicalls')
      .where('app', '==', app)
      .orderBy('ts', 'desc')
      .limit(limit)
      .get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch {
    return _apiCalls.filter(c => c.app === app).slice(0, limit);
  }
}

module.exports = {
  saveLog, getLogs, deleteLog, deleteAllLogs,
  saveFeedback, getFeedback,
  getSystemPromptCached, getSystemPrompt, saveSystemPrompt, resetSystemPrompt,
  getSessionTokens, setSessionToken,
  saveApiCall, getApiCalls,
};
