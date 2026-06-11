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

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'apps', APP, 'public')));

console.log(`\n🤖 App: ${APP.toUpperCase()} | LLM: ${LLM_PROVIDER.toUpperCase()}`);
console.log(`🔧 Tools loaded: ${allTools.length}\n`);

// ── Helpers ───────────────────────────────────────────────────────────────────
function getToolsForModule(mod) {
  const allowed = MODULE_TOOLS[mod];
  if (!allowed) return allTools;
  return allTools.filter(t => allowed.includes(t.name));
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

    const filteredTools = getToolsForModule(mod);
    const messages      = [...trimmedHistory, { role: 'user', content: message }];

    console.log(`[Chat] ${activeProvider.toUpperCase()} | mod:${mod} | tools:${filteredTools.length} | history:${trimmedHistory.length} | "${message}"`);

    let result;
    if (activeProvider === 'claude') {
      result = await runClaudeAgent(messages, {}, filteredTools, executeTool);
    } else if (activeProvider === 'openai') {
      result = await runOpenAIAgent(messages, {}, filteredTools, executeTool);
    } else {
      result = await runGroqAgent(messages, {}, filteredTools, executeTool);
    }

    const payload = { reply: result.reply, history: result.messages, provider: activeProvider };
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

app.listen(PORT, () => console.log(`✅ Running → http://localhost:${PORT}\n`));
