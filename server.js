require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const path       = require('path');
const { LLM_PROVIDER, PORT } = require('./src/config');
const { getCache, setCache }  = require('./src/cache');
const { getStatus: getKeyStatus } = require('./src/key-manager');

// ── Load app ──────────────────────────────────────────────────────────────────
const APP = process.env.APP || 'vocus';
const { MODULE_TOOLS, MODULE_HISTORY } = require(`./apps/${APP}/config`);
const allTools    = require(`./apps/${APP}/tools`);
const executeTool = require(`./apps/${APP}/executors`);

const runGroqAgent   = require('./src/agents/groq.agent');
const runClaudeAgent = require('./src/agents/claude.agent');
const runOpenAIAgent = require('./src/agents/openai.agent');
const registry       = require('./src/registry');
const store          = require('./src/store');

const { SYSTEM_PROMPT: DEFAULT_SYSTEM_PROMPT } = require(`./apps/${APP}/config`);

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'apps', APP, 'public')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'apps', APP, 'public', 'admin.html')));

console.log(`\n🤖 App: ${APP.toUpperCase()} | LLM: ${LLM_PROVIDER.toUpperCase()}`);
console.log(`🔧 Tools loaded: ${allTools.length}\n`);

// ── Helpers ───────────────────────────────────────────────────────────────────
async function getToolsForModule(mod) {
  const dynamicApis   = await registry.load(APP);
  const dynamicTools  = registry.toTools(dynamicApis);
  const combinedTools = [...allTools, ...dynamicTools];
  const allowed = MODULE_TOOLS[mod];
  if (!allowed) return combinedTools;
  // dynamic tools always included; static tools filtered by module
  return combinedTools.filter(t => t._dynamic || allowed.includes(t.name));
}

// Combined executor: dynamic tools first, then static
async function runTool(toolName, args, headers) {
  const dynResult = await registry.executeDynamic(APP, toolName, args);
  if (dynResult !== null) return dynResult;
  return executeTool(toolName, args, headers);
}

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

// ── Chat ──────────────────────────────────────────────────────────────────────
app.post('/chat', rateLimiter, async (req, res) => {
  try {
    const { message, history = [], provider, module: mod = 'all' } = req.body;
    if (!message?.trim()) return res.status(400).json({ error: 'message is required' });

    const activeProvider = provider || LLM_PROVIDER;

    // Trim history to module window, removing orphaned tool_results
    const windowSize = MODULE_HISTORY[mod] ?? 8;
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

    // Response cache — skip LLM entirely for identical inputs
    const cacheKey   = `llm:${activeProvider}:${mod}:${simpleHash(message.trim() + JSON.stringify(trimmedHistory))}`;
    const cachedResp = getCache(cacheKey);
    if (cachedResp) {
      console.log(`[ResponseCache] HIT ${activeProvider}:${mod} "${message.slice(0, 50)}"`);
      return res.json(cachedResp);
    }

    const filteredTools = await getToolsForModule(mod);
    const messages      = [...trimmedHistory, { role: 'user', content: message }];

    console.log(`[Chat] ${activeProvider.toUpperCase()} | mod:${mod} | tools:${filteredTools.length} | history:${trimmedHistory.length} | "${message}"`);

    // Dynamic system prompt (Firestore override, falls back to config default)
    const dynamicPrompt = await store.getSystemPromptCached(APP);
    const agentOpts     = dynamicPrompt ? { systemPrompt: dynamicPrompt } : {};

    let result;
    if (activeProvider === 'claude') {
      result = await runClaudeAgent(messages, {}, filteredTools, runTool, agentOpts);
    } else if (activeProvider === 'openai') {
      result = await runOpenAIAgent(messages, {}, filteredTools, runTool, agentOpts);
    } else {
      result = await runGroqAgent(messages, {}, filteredTools, runTool, agentOpts);
    }

    // Log conversation (fire-and-forget)
    const logId = Date.now().toString(36);
    store.saveLog(APP, { id: logId, session: req.ip, userMsg: message, aiReply: result.reply, provider: activeProvider, module: mod }).catch(() => {});

    const payload = { reply: result.reply, history: result.messages, provider: activeProvider, logId };
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
  res.json(await registry.load(APP));
});

app.post('/registry', async (req, res) => {
  const api = req.body;
  if (!api.name || !/^[a-z][a-z0-9_]*$/.test(api.name))
    return res.status(400).json({ error: 'name must be snake_case (lowercase letters, digits, underscores)' });
  if (!api.baseUrl?.startsWith('http'))
    return res.status(400).json({ error: 'baseUrl must start with http:// or https://' });
  if (!api.method)
    return res.status(400).json({ error: 'method is required' });
  if (!api.description)
    return res.status(400).json({ error: 'description is required — the AI uses it to know when to call this API' });

  const reg = await registry.load(APP);
  if (allTools.find(t => t.name === api.name))
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

  await registry.save(APP, reg);
  console.log(`[Registry] Saved: ${entry.name}`);
  res.json({ ok: true, api: entry });
});

app.delete('/registry/:id', async (req, res) => {
  const reg     = await registry.load(APP);
  const updated = reg.filter(r => r.id !== req.params.id);
  if (updated.length === reg.length)
    return res.status(404).json({ error: 'Not found' });
  await registry.save(APP, updated);
  res.json({ ok: true });
});

// Test an API config without saving it
app.post('/registry/test', async (req, res) => {
  const { api, input } = req.body;
  if (!api) return res.status(400).json({ error: 'api config required' });
  try {
    const result = await registry.execute(api, input || {});
    res.json({ ok: true, result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Conversation Logs ─────────────────────────────────────────────────────────
app.get('/admin/logs', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 100, 500);
  res.json(await store.getLogs(APP, limit));
});

app.delete('/admin/logs', async (req, res) => {
  await store.deleteAllLogs(APP);
  res.json({ ok: true });
});

app.delete('/admin/logs/:id', async (req, res) => {
  await store.deleteLog(APP, req.params.id);
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
  const limit = Math.min(parseInt(req.query.limit) || 100, 500);
  res.json(await store.getFeedback(APP, limit));
});

// ── System Prompt ─────────────────────────────────────────────────────────────
app.get('/admin/prompt', async (req, res) => {
  const custom = await store.getSystemPrompt(APP);
  res.json({ prompt: custom || DEFAULT_SYSTEM_PROMPT, isDefault: !custom });
});

app.post('/admin/prompt', async (req, res) => {
  const { prompt } = req.body;
  if (!prompt?.trim()) return res.status(400).json({ error: 'Prompt cannot be empty' });
  await store.saveSystemPrompt(APP, prompt.trim());
  res.json({ ok: true });
});

app.post('/admin/prompt/reset', async (req, res) => {
  await store.resetSystemPrompt(APP);
  res.json({ ok: true, prompt: DEFAULT_SYSTEM_PROMPT });
});

app.listen(PORT, () => console.log(`✅ Running → http://localhost:${PORT}\n`));
