require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const path       = require('path');
const fs         = require('fs');
const { LLM_PROVIDER, PORT } = require('./src/config');
const { getCache, setCache }  = require('./src/cache');
const { getStatus: getKeyStatus } = require('./src/key-manager');

// ── Default app ───────────────────────────────────────────────────────────────
const APP = process.env.APP || 'vocus';

// ── Multi-app module cache ────────────────────────────────────────────────────
const _appModuleCache = {};

function loadApp(appName) {
  if (_appModuleCache[appName]) return _appModuleCache[appName];
  const config   = require(`./apps/${appName}/config`);
  const tools    = require(`./apps/${appName}/tools`);
  const executor = require(`./apps/${appName}/executors`);
  _appModuleCache[appName] = { config, tools, executor };
  console.log(`[MultiApp] Loaded: ${appName}`);
  return _appModuleCache[appName];
}

function getAvailableApps() {
  try {
    return fs.readdirSync(path.join(__dirname, 'apps'))
      .filter(name => {
        try { require.resolve(path.join(__dirname, 'apps', name, 'config')); return true; }
        catch { return false; }
      });
  } catch { return [APP]; }
}

// Preload default app at startup
const { config: { MODULE_TOOLS, MODULE_HISTORY, SYSTEM_PROMPT: DEFAULT_SYSTEM_PROMPT },
        tools: allTools,
        executor: executeTool } = loadApp(APP);

const runGroqAgent   = require('./src/agents/groq.agent');
const runClaudeAgent = require('./src/agents/claude.agent');
const runOpenAIAgent = require('./src/agents/openai.agent');
const registry       = require('./src/registry');
const store          = require('./src/store');

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'apps', APP, 'public')));
app.use(express.static(path.join(__dirname, 'public')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'apps', APP, 'public', 'admin.html')));

console.log(`\n🤖 App: ${APP.toUpperCase()} | LLM: ${LLM_PROVIDER.toUpperCase()}`);
console.log(`🔧 Tools loaded: ${allTools.length}\n`);

function simpleHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = Math.imul(31, h) + str.charCodeAt(i) | 0;
  return (h >>> 0).toString(36);
}

// ── Rate limiter (20 req / min per IP) ────────────────────────────────────────
const RATE_LIMIT  = 20;
const RATE_WINDOW = 60 * 1000;
const rateLimits  = {};

function rateLimiter(req, res, next) {
  const ip  = req.ip || req.socket?.remoteAddress || 'unknown';
  const now = Date.now();
  if (!rateLimits[ip] || now - rateLimits[ip].start > RATE_WINDOW) {
    rateLimits[ip] = { count: 1, start: now };
    return next();
  }
  rateLimits[ip].count++;
  if (rateLimits[ip].count > RATE_LIMIT) {
    console.warn(`[RateLimit] Blocked ${ip}: ${rateLimits[ip].count} req/min`);
    return res.status(429).json({ error: 'Too many requests. Please wait a moment and try again.' });
  }
  next();
}
setInterval(() => {
  const now = Date.now();
  Object.keys(rateLimits).forEach(ip => {
    if (now - rateLimits[ip].start > RATE_WINDOW * 2) delete rateLimits[ip];
  });
}, 5 * 60 * 1000);

// ── Available Apps ────────────────────────────────────────────────────────────
app.get('/apps', (req, res) => {
  res.json({ apps: getAvailableApps(), current: APP });
});

// ── Chat ──────────────────────────────────────────────────────────────────────
app.post('/chat', rateLimiter, async (req, res) => {
  try {
    const { message, history = [], provider, module: mod = 'all', sessionId, app: reqApp } = req.body;
    if (!message?.trim()) return res.status(400).json({ error: 'message is required' });

    // Resolve app — requested app overrides default, fall back on error
    let appName = APP;
    let appCtx  = loadApp(APP);
    if (reqApp && reqApp !== APP) {
      try { appCtx = loadApp(reqApp); appName = reqApp; }
      catch { /* unknown app — use default */ }
    }

    const { config: { MODULE_TOOLS: appMT, MODULE_HISTORY: appMH },
            tools: appAllTools, executor: appExecTool } = appCtx;

    const activeProvider = provider || LLM_PROVIDER;

    // Trim history to module window, removing orphaned tool_results
    const windowSize = appMH[mod] ?? 8;
    const raw = history.slice(-windowSize);
    const toolUseIds = new Set();
    raw.forEach(m => {
      if (m.role === 'assistant' && Array.isArray(m.content))
        m.content.forEach(b => { if (b.type === 'tool_use') toolUseIds.add(b.id); });
    });
    const trimmedHistory = raw.filter(m => {
      if (m.role === 'user' && Array.isArray(m.content))
        return !m.content.some(b => b.type === 'tool_result' && !toolUseIds.has(b.tool_use_id));
      return true;
    });

    // ── Session state: load tokens NOW (before cache check) ──────────────────
    // Purpose 1: build cache key that includes auth state (prevent cross-session cache collisions)
    // Purpose 2: inject live session state into system prompt so the bot knows whether
    //            the user is already authenticated without needing chat history
    const sessionTokens  = sessionId ? await store.getSessionTokens(appName, sessionId) : {};
    const storedTokenKeys = Object.keys(sessionTokens);
    const isAuthenticated = storedTokenKeys.length > 0;

    // Cache key includes auth state — authenticated / unauthenticated users must never share a cached reply
    const cacheKey   = `llm:${activeProvider}:${appName}:${mod}:${isAuthenticated ? 'auth' : 'anon'}:${simpleHash(message.trim() + JSON.stringify(trimmedHistory))}`;
    const cachedResp = getCache(cacheKey);
    if (cachedResp) {
      console.log(`[ResponseCache] HIT ${activeProvider}:${appName}:${mod}:${isAuthenticated ? 'auth' : 'anon'}`);
      return res.json(cachedResp);
    }

    // Build tool list for this specific app
    const dynamicApis   = await registry.load(appName);
    const dynamicTools  = registry.toTools(dynamicApis);
    const combinedTools = [...appAllTools, ...dynamicTools];
    const allowed = appMT[mod];
    const filteredTools = allowed
      ? combinedTools.filter(t => t._dynamic || allowed.includes(t.name))
      : combinedTools;

    const messages = [...trimmedHistory, { role: 'user', content: message }];

    console.log(`[Chat] ${activeProvider.toUpperCase()} | app:${appName} | auth:${isAuthenticated ? `yes(${storedTokenKeys.join(',')})` : 'no'} | tools:${filteredTools.length} | history:${trimmedHistory.length} | session:${sessionId ? sessionId.slice(0,10)+'…' : 'none'} | "${message}"`);

    const dynamicPrompt = await store.getSystemPromptCached(appName);
    const defaultSP     = appCtx.config.SYSTEM_PROMPT || '';

    // Dynamically append live session state to the system prompt.
    // This tells the bot the current auth status WITHOUT relying on chat history,
    // so it works correctly even after a page refresh, new conversation, or
    // when a brand-new API is added to the registry tomorrow.
    let sessionStateNote = '';
    if (sessionId) {
      if (isAuthenticated) {
        sessionStateNote =
          `\n\n[CURRENT SESSION STATE: User IS authenticated. ` +
          `Stored tokens: ${storedTokenKeys.join(', ')}. ` +
          `These tokens are automatically injected wherever {{tokenName}} appears in API headers — ` +
          `do NOT ask the user to log in again unless an API returns 401 or 403. ` +
          `If the user explicitly wants to switch accounts, guide them through the OTP flow — ` +
          `this will overwrite the stored token.]`;
      } else {
        sessionStateNote =
          `\n\n[CURRENT SESSION STATE: User is NOT authenticated. ` +
          `No tokens stored for this session. ` +
          `If any requested service requires login/authentication, ` +
          `guide the user through the OTP process first before attempting that API call.]`;
      }
    }

    const agentOpts = { systemPrompt: (dynamicPrompt || defaultSP) + sessionStateNote };

    // Session-aware tool runner: injects stored tokens, saves extracted ones
    const toolRunner = sessionId
      ? async (toolName, args, headers) => {
          const tokens = await store.getSessionTokens(appName, sessionId);
          const dynResult = await registry.executeDynamic(appName, toolName, args, {
            sessionId, tokens, store, app: appName,
          });
          if (dynResult !== null) return dynResult;
          return appExecTool(toolName, args, headers);
        }
      : async (toolName, args, headers) => {
          const dynResult = await registry.executeDynamic(appName, toolName, args);
          if (dynResult !== null) return dynResult;
          return appExecTool(toolName, args, headers);
        };

    let result;
    if (activeProvider === 'claude') {
      result = await runClaudeAgent(messages, {}, filteredTools, toolRunner, agentOpts);
    } else if (activeProvider === 'openai') {
      result = await runOpenAIAgent(messages, {}, filteredTools, toolRunner, agentOpts);
    } else {
      result = await runGroqAgent(messages, {}, filteredTools, toolRunner, agentOpts);
    }

    const logId = Date.now().toString(36);
    store.saveLog(appName, { id: logId, session: sessionId || req.ip, userMsg: message, aiReply: result.reply, provider: activeProvider, module: mod }).catch(() => {});

    const payload = { reply: result.reply, history: result.messages, provider: activeProvider, logId, sessionId: sessionId || undefined };
    setCache(cacheKey, payload, 2 * 60 * 1000);
    res.json(payload);

  } catch (err) {
    const detail = err?.error?.message || err?.response?.data?.error?.message || err?.response?.data?.message || err?.message || 'Unknown error';
    console.error('[Chat Error]', err?.response?.status || '', detail);
    res.status(500).json({ error: "Sorry, I'm having trouble processing your request right now. Please try again or rephrase your message." });
  }
});

app.get('/provider',     (req, res) => res.json({ provider: LLM_PROVIDER }));
app.get('/keys/status',  (req, res) => res.json(getKeyStatus()));

// ── API Registry CRUD ─────────────────────────────────────────────────────────
app.get('/registry', async (req, res) => {
  const appName = req.query.app || APP;
  res.json(await registry.load(appName));
});

app.post('/registry', async (req, res) => {
  const appName = req.query.app || APP;
  const api = req.body;
  if (!api.name || !/^[a-z][a-z0-9_]*$/.test(api.name))
    return res.status(400).json({ error: 'name must be snake_case (lowercase letters, digits, underscores)' });
  if (!api.baseUrl?.startsWith('http'))
    return res.status(400).json({ error: 'baseUrl must start with http:// or https://' });
  if (!api.method)
    return res.status(400).json({ error: 'method is required' });
  if (!api.description)
    return res.status(400).json({ error: 'description is required — the AI uses it to know when to call this API' });

  let appStaticTools = allTools;
  try { appStaticTools = loadApp(appName).tools; } catch {}

  const reg = await registry.load(appName);
  if (appStaticTools.find(t => t.name === api.name))
    return res.status(400).json({ error: `"${api.name}" conflicts with a built-in tool name` });
  if (reg.find(r => r.id !== api.id && r.name === api.name))
    return res.status(400).json({ error: `An API named "${api.name}" already exists` });

  const entry = {
    ...api,
    id:        api.id || Date.now().toString(36),
    createdAt: api.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const existing = reg.findIndex(r => r.id === entry.id);
  if (existing >= 0) reg[existing] = entry;
  else reg.push(entry);

  await registry.save(appName, reg);
  console.log(`[Registry] Saved: ${entry.name} (app: ${appName})`);
  res.json({ ok: true, api: entry });
});

app.delete('/registry/:id', async (req, res) => {
  const appName = req.query.app || APP;
  const reg     = await registry.load(appName);
  const updated = reg.filter(r => r.id !== req.params.id);
  if (updated.length === reg.length)
    return res.status(404).json({ error: 'Not found' });
  await registry.save(appName, updated);
  res.json({ ok: true });
});

app.post('/registry/test', async (req, res) => {
  const { api, input, testTokens } = req.body;
  if (!api) return res.status(400).json({ error: 'api config required' });
  try {
    const result = await registry.execute(api, input || {}, { tokens: testTokens || {} });
    res.json({ ok: true, result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Conversation Logs ─────────────────────────────────────────────────────────
app.get('/admin/logs', async (req, res) => {
  const appName = req.query.app || APP;
  const limit = Math.min(parseInt(req.query.limit) || 100, 500);
  res.json(await store.getLogs(appName, limit));
});

app.delete('/admin/logs', async (req, res) => {
  const appName = req.query.app || APP;
  await store.deleteAllLogs(appName);
  res.json({ ok: true });
});

app.delete('/admin/logs/:id', async (req, res) => {
  const appName = req.query.app || APP;
  await store.deleteLog(appName, req.params.id);
  res.json({ ok: true });
});

// ── User Feedback ─────────────────────────────────────────────────────────────
app.post('/feedback', async (req, res) => {
  const { type, userMsg, aiReply, logId } = req.body;
  if (!type || !['thumbs_up', 'thumbs_down'].includes(type))
    return res.status(400).json({ error: 'type must be thumbs_up or thumbs_down' });
  const result = await store.saveFeedback(APP, { type, userMsg: userMsg || '', aiReply: aiReply || '', logId: logId || '' });
  res.json({ ok: true, id: result.id });
});

app.get('/admin/feedback', async (req, res) => {
  const appName = req.query.app || APP;
  const limit = Math.min(parseInt(req.query.limit) || 100, 500);
  res.json(await store.getFeedback(appName, limit));
});

// ── API Call Log ──────────────────────────────────────────────────────────────
app.get('/admin/apicalls', async (req, res) => {
  const appName = req.query.app || APP;
  const limit = Math.min(parseInt(req.query.limit) || 100, 200);
  res.json(await store.getApiCalls(appName, limit));
});

// ── System Prompt ─────────────────────────────────────────────────────────────
app.get('/admin/prompt', async (req, res) => {
  const appName = req.query.app || APP;
  let defaultSP = DEFAULT_SYSTEM_PROMPT;
  try { defaultSP = loadApp(appName).config.SYSTEM_PROMPT || DEFAULT_SYSTEM_PROMPT; } catch {}
  const custom = await store.getSystemPrompt(appName);
  res.json({ prompt: custom || defaultSP, isDefault: !custom });
});

app.post('/admin/prompt', async (req, res) => {
  const appName = req.query.app || APP;
  const { prompt } = req.body;
  if (!prompt?.trim()) return res.status(400).json({ error: 'Prompt cannot be empty' });
  await store.saveSystemPrompt(appName, prompt.trim());
  res.json({ ok: true });
});

app.post('/admin/prompt/reset', async (req, res) => {
  const appName = req.query.app || APP;
  let defaultSP = DEFAULT_SYSTEM_PROMPT;
  try { defaultSP = loadApp(appName).config.SYSTEM_PROMPT || DEFAULT_SYSTEM_PROMPT; } catch {}
  await store.resetSystemPrompt(appName);
  res.json({ ok: true, prompt: defaultSP });
});

app.listen(PORT, () => console.log(`✅ Running → http://localhost:${PORT}\n`));
