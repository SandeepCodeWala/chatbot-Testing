const fs    = require('fs');
const path  = require('path');
const axios = require('axios');
const https = require('https');

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

// ── Firebase Admin (lazy init, falls back to local JSON if unconfigured) ───────
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
    console.log('[Registry] Firestore storage active');
    return _db;
  } catch (err) {
    console.warn('[Registry] Firebase init failed — using local JSON file:', err.message);
    return null;
  }
}

// ── Local JSON fallback ────────────────────────────────────────────────────────
function registryPath(app) {
  return path.join(__dirname, '..', 'apps', app, 'api-registry.json');
}

function loadLocal(app) {
  const p = registryPath(app);
  if (!fs.existsSync(p)) return [];
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch { return []; }
}

function saveLocal(app, data) {
  fs.writeFileSync(registryPath(app), JSON.stringify(data, null, 2));
}

// ── Async load/save (Firestore when configured, local JSON otherwise) ──────────
async function load(app) {
  const db = getDb();
  if (!db) return loadLocal(app);
  try {
    const doc = await db.collection('registry').doc(app).get();
    if (!doc.exists) {
      const local = loadLocal(app);
      if (local.length) {
        await db.collection('registry').doc(app).set({ apis: local });
        console.log(`[Registry] Migrated ${local.length} APIs from local file → Firestore`);
      }
      return local;
    }
    return doc.data().apis || [];
  } catch (err) {
    console.warn('[Registry] Firestore read error — falling back to local file:', err.message);
    return loadLocal(app);
  }
}

async function save(app, data) {
  const db = getDb();
  if (!db) { saveLocal(app, data); return; }
  try {
    await db.collection('registry').doc(app).set({ apis: data });
  } catch (err) {
    console.warn('[Registry] Firestore write error — saving to local file:', err.message);
    saveLocal(app, data);
  }
}

// Convert a registry entry into the same tool shape the agents expect
function toTool(api) {
  const properties = {};
  const required   = [];
  for (const p of (api.params || [])) {
    properties[p.name] = { type: p.type || 'string', description: p.description || p.name };
    if (p.required) required.push(p.name);
  }
  return {
    name:        api.name,
    description: api.description,
    parameters:  { type: 'object', properties, required },
    _dynamic:    true,
  };
}

// Takes the already-loaded apis array (not the app name)
function toTools(apis) {
  return (apis || []).map(toTool);
}

// Replace {{tokenName}} placeholders with values from session tokens
function injectTokens(str, tokens) {
  if (!str || typeof str !== 'string') return str;
  return str.replace(/\{\{(\w+)\}\}/g, (_, key) => tokens[key] !== undefined ? tokens[key] : `{{${key}}}`);
}

// Read a nested value from an object by dot-separated path (e.g. "data.token")
function getByPath(obj, dotPath) {
  if (obj == null || typeof obj !== 'object') return undefined;
  return dotPath.split('.').reduce((cur, k) => (cur == null ? undefined : cur[k]), obj);
}

// Internal: fire the HTTP request and return the raw axios response
async function _executeRaw(api, input = {}, sessionCtx = {}) {
  const tokens = sessionCtx.tokens || {};
  let urlPath = api.path || '/';
  const queryParams  = {};
  const bodyParams   = {};
  const headers      = { 'Content-Type': 'application/json' };

  // Static headers from registry — inject session tokens into values
  for (const h of (api.headers || [])) {
    if (h.key) headers[h.key] = injectTokens(h.value || '', tokens);
  }

  // Auth
  const auth = api.auth || {};
  if (auth.type === 'bearer' && auth.value) {
    headers['Authorization'] = `Bearer ${auth.value}`;
  } else if (auth.type === 'apikey' && auth.headerName && auth.value) {
    headers[auth.headerName] = auth.value;
  } else if (auth.type === 'basic' && auth.username && auth.value) {
    const encoded = Buffer.from(`${auth.username}:${auth.value}`).toString('base64');
    headers['Authorization'] = `Basic ${encoded}`;
  }

  // Route each input param to the right place (path / query / body / header)
  for (const [key, value] of Object.entries(input)) {
    const def = (api.params || []).find(p => p.name === key);
    if (!def) { bodyParams[key] = value; continue; }
    switch (def.location) {
      case 'path':   urlPath = urlPath.replace(`{${key}}`, encodeURIComponent(String(value))); break;
      case 'query':  queryParams[key] = value; break;
      case 'body':   bodyParams[key] = value; break;
      case 'header': headers[key] = String(value); break;
      default:       queryParams[key] = value;
    }
  }

  const baseUrl = (api.baseUrl || '').replace(/\/$/, '');
  const url     = baseUrl + urlPath;
  const method  = (api.method || 'GET').toUpperCase();
  const hasBody = ['POST', 'PUT', 'PATCH'].includes(method);

  return axios({
    method,
    url,
    params:  Object.keys(queryParams).length ? queryParams : undefined,
    data:    hasBody && Object.keys(bodyParams).length ? bodyParams : undefined,
    headers,
    timeout: 12000,
    validateStatus: null,
    httpsAgent,
  });
}

// Public execute — returns body data (used by /registry/test)
async function execute(api, input = {}, sessionCtx = {}) {
  const response = await _executeRaw(api, input, sessionCtx);
  if (response.status >= 400) {
    return { success: false, status: response.status, error: response.data };
  }
  return response.data;
}

// Find a dynamic API by tool name and execute it; returns null if not found
// sessionCtx: { sessionId, tokens, store, app } — used for token injection/extraction
async function executeDynamic(app, toolName, args, sessionCtx = {}) {
  const reg = await load(app);
  const api = reg.find(a => a.name === toolName);
  if (!api) return null;
  try {
    const response = await _executeRaw(api, args, sessionCtx);
    const body = response.data;

    // Auto-extract and store auth token from response header OR body
    if (api.tokenExtract?.field && sessionCtx.store && sessionCtx.sessionId) {
      const source = api.tokenExtract.source || 'header';
      let tokenValue;

      if (source === 'header') {
        // HTTP response headers are lowercased by Node/axios
        tokenValue = response.headers[api.tokenExtract.field.toLowerCase()];
      } else {
        // Extract from JSON body using dot-path (e.g. "data.token")
        tokenValue = getByPath(body, api.tokenExtract.field);
      }

      if (tokenValue != null && tokenValue !== '') {
        const storeAs = api.tokenExtract.as || api.tokenExtract.field;
        await sessionCtx.store.setSessionToken(
          sessionCtx.app || app, sessionCtx.sessionId, storeAs, String(tokenValue)
        );
        console.log(`[Registry] Token "${storeAs}" stored from response ${source} for session ${String(sessionCtx.sessionId).slice(0, 10)}…`);
      }
    }

    const success = response.status < 400;

    // Log every API call so admin can see what hit and what came back
    if (sessionCtx.store) {
      sessionCtx.store.saveApiCall(sessionCtx.app || app, {
        toolName,
        sessionId:       sessionCtx.sessionId || 'unknown',
        params:          args,
        httpStatus:      response.status,
        success,
        responsePreview: JSON.stringify(body).slice(0, 400),
      }).catch(() => {});
    }

    if (!success) return { success: false, status: response.status, error: body };
    return body;
  } catch (err) {
    if (sessionCtx.store) {
      sessionCtx.store.saveApiCall(sessionCtx.app || app, {
        toolName,
        sessionId:       sessionCtx.sessionId || 'unknown',
        params:          args,
        httpStatus:      0,
        success:         false,
        responsePreview: err.message,
      }).catch(() => {});
    }
    return { success: false, error: err.message };
  }
}

module.exports = { load, save, toTools, toTool, execute, executeDynamic, registryPath };
