#!/bin/bash
echo "🔄 Updating all files..."

# ── cache.js ──────────────────────────────────────────────────────────────────
cat > src/cache.js << 'EOF'
const store = {};

function getCache(key) {
  const entry = store[key];
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { delete store[key]; return null; }
  console.log(`[Cache] HIT: ${key}`);
  return entry.data;
}

function setCache(key, data, ttlMs = 5 * 60 * 1000) {
  store[key] = { data, expiresAt: Date.now() + ttlMs };
  console.log(`[Cache] SET: ${key} (${ttlMs/1000}s)`);
}

function clearCache(pattern) {
  Object.keys(store).forEach(k => { if (k.includes(pattern)) delete store[k]; });
}

module.exports = { getCache, setCache, clearCache };
EOF

# ── server.js ─────────────────────────────────────────────────────────────────
cat > server.js << 'EOF'
require('dotenv').config();
const express        = require('express');
const cors           = require('cors');
const path           = require('path');
const runGroqAgent   = require('./src/agents/groq.agent');
const runClaudeAgent = require('./src/agents/claude.agent');
const allTools       = require('./src/tools');
const { LLM_PROVIDER, PORT } = require('./src/config');

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

console.log(`\n🤖 Default LLM: ${LLM_PROVIDER.toUpperCase()}`);
console.log(`🔧 Total tools loaded: ${allTools.length}\n`);

const MODULE_TOOLS = {
  all:      null,
  plans:    ['get_plans', 'add_plan_to_cart', 'get_cart'],
  contacts: ['get_contacts', 'create_contact', 'update_contact'],
  address:  ['get_delivery_addresses', 'add_delivery_address', 'update_delivery_address'],
  orders:   ['get_orders', 'get_order_details', 'get_order_tracking'],
  requests: ['get_requests', 'get_request_details'],
  users:    ['get_mobile_users', 'get_mobile_user_by_id', 'create_mobile_user', 'update_mobile_user', 'delete_mobile_user'],
  services: ['get_services_list', 'get_service_actions', 'submit_service_action'],
  sim:      ['get_sim_list', 'activate_new_sim', 'activate_port_in_sim'],
};

function getToolsForModule(module) {
  const allowed = MODULE_TOOLS[module];
  if (!allowed) return allTools;
  return allTools.filter(t => allowed.includes(t.name));
}

app.post('/chat', async (req, res) => {
  try {
    const { message, history = [], provider, module: mod = 'all' } = req.body;
    if (!message?.trim()) return res.status(400).json({ error: 'message is required' });

    const activeProvider = provider || LLM_PROVIDER;
    const trimmedHistory = history.slice(-8);
    const filteredTools  = getToolsForModule(mod);
    const messages       = [...trimmedHistory, { role: 'user', content: message }];

    console.log(`[Chat] ${activeProvider.toUpperCase()} | module: ${mod} | tools: ${filteredTools.length} | history: ${trimmedHistory.length} | "${message}"`);

    const result = activeProvider === 'claude'
      ? await runClaudeAgent(messages, {}, filteredTools)
      : await runGroqAgent(messages, {}, filteredTools);

    res.json({ reply: result.reply, history: result.messages, provider: activeProvider });

  } catch (err) {
    const errDetail = err?.error?.message || err?.response?.data?.error?.message || err?.response?.data?.message || err?.message || 'Unknown error';
    console.error('[Chat Error]', err?.response?.status || '', errDetail);
    res.status(500).json({ error: errDetail });
  }
});

app.get('/provider', (req, res) => res.json({ provider: LLM_PROVIDER }));
app.listen(PORT, () => console.log(`✅ Running → http://localhost:${PORT}\n`));
EOF

# ── groq.agent.js ─────────────────────────────────────────────────────────────
cat > src/agents/groq.agent.js << 'EOF'
const Groq        = require('groq-sdk');
const allTools    = require('../tools');
const executeTool = require('../executors');
const { GROQ_API_KEY, SYSTEM_PROMPT } = require('../config');

const GROQ_MODELS = [
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'llama-3.3-70b-versatile',
  'llama3-70b-8192',
];

async function runGroqAgent(messages, headers = {}, tools = allTools) {
  const groq = new Groq({ apiKey: GROQ_API_KEY });
  const groqTools = tools.map(t => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.parameters }
  }));

  let currentMessages = [...messages];

  while (true) {
    let response, lastErr;

    for (const model of GROQ_MODELS) {
      try {
        response = await groq.chat.completions.create({
          model,
          messages:    [{ role: 'system', content: SYSTEM_PROMPT }, ...currentMessages],
          tools:       groqTools,
          tool_choice: 'auto',
          max_tokens:  1024
        });
        console.log(`[Groq] Model: ${model} | Tools sent: ${groqTools.length}`);
        break;
      } catch (err) {
        const msg = err?.error?.message || err?.message || '';
        if (msg.includes('decommissioned') || msg.includes('not found') || msg.includes('does not exist')) {
          console.warn(`[Groq] ${model} unavailable, trying next...`);
          lastErr = err; continue;
        }
        throw err;
      }
    }
    if (!response) throw lastErr;

    const assistantMsg = response.choices[0].message;
    currentMessages.push(assistantMsg);

    if (!assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0) {
      return { reply: assistantMsg.content, messages: currentMessages };
    }

    for (const toolCall of assistantMsg.tool_calls) {
      let args;
      try { args = JSON.parse(toolCall.function.arguments); } catch { args = {}; }
      const result = await executeTool(toolCall.function.name, args, headers);
      currentMessages.push({ role: 'tool', tool_call_id: toolCall.id, content: JSON.stringify(result) });
    }
  }
}

module.exports = runGroqAgent;
EOF

# ── claude.agent.js ───────────────────────────────────────────────────────────
cat > src/agents/claude.agent.js << 'EOF'
const axios       = require('axios');
const allTools    = require('../tools');
const executeTool = require('../executors');
const { CLAUDE_API_KEY, CLAUDE_MODEL, SYSTEM_PROMPT } = require('../config');

async function runClaudeAgent(messages, headers = {}, tools = allTools) {
  const claudeTools = tools.map(t => ({
    name:         t.name,
    description:  t.description,
    input_schema: t.parameters
  }));

  let currentMessages = [...messages];

  while (true) {
    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      { model: CLAUDE_MODEL, max_tokens: 1024, system: SYSTEM_PROMPT, tools: claudeTools, messages: currentMessages },
      { headers: { 'Content-Type': 'application/json', 'x-api-key': CLAUDE_API_KEY, 'anthropic-version': '2023-06-01' } }
    );

    const data = response.data;
    console.log(`[Claude] stop_reason: ${data.stop_reason} | Tools sent: ${claudeTools.length}`);
    currentMessages.push({ role: 'assistant', content: data.content });

    if (data.stop_reason === 'end_turn') {
      return { reply: data.content.find(b => b.type === 'text')?.text || '', messages: currentMessages };
    }

    if (data.stop_reason === 'tool_use') {
      const toolResults = [];
      for (const block of data.content.filter(b => b.type === 'tool_use')) {
        const result = await executeTool(block.name, block.input, headers);
        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) });
      }
      currentMessages.push({ role: 'user', content: toolResults });
      continue;
    }

    return { reply: data.content.find(b => b.type === 'text')?.text || 'Done.', messages: currentMessages };
  }
}

module.exports = runClaudeAgent;
EOF

# ── executors ─────────────────────────────────────────────────────────────────
cat > src/executors/plans.executor.js << 'EOF'
const axios = require('axios');
const { BASE_URL } = require('../config');
const { getCache, setCache } = require('../cache');

async function executePlansTool(toolName, args, headers = {}) {
  switch (toolName) {
    case 'get_plans': {
      const key = `plans:${args.category||'all'}:${args.simType||'all'}`;
      const cached = getCache(key);
      if (cached) return cached;
      const res = (await axios.get(`${BASE_URL}/api/plans`, {
        headers: { ...headers, ...(args.category && { category: args.category }), ...(args.simType && { simType: args.simType }) }
      })).data;
      setCache(key, res);
      return res;
    }
    case 'add_plan_to_cart':
      return (await axios.post(`${BASE_URL}/api/plans/cart/add`, { PlanId: args.PlanId, Quantity: args.Quantity }, { headers })).data;
    case 'get_cart': {
      const key = `cart:${args.checkout_id}`;
      const cached = getCache(key);
      if (cached) return cached;
      const res = (await axios.get(`${BASE_URL}/api/plans/cart`, { headers: { ...headers, checkout_id: args.checkout_id } })).data;
      setCache(key, res, 60000);
      return res;
    }
    default: return null;
  }
}
module.exports = executePlansTool;
EOF

cat > src/executors/contacts.executor.js << 'EOF'
const axios = require('axios');
const { BASE_URL } = require('../config');
const { getCache, setCache, clearCache } = require('../cache');

async function executeContactsTool(toolName, args, headers = {}) {
  switch (toolName) {
    case 'get_contacts': {
      const cached = getCache('contacts:all');
      if (cached) return cached;
      const res = (await axios.get(`${BASE_URL}/api/contacts`, { headers })).data;
      setCache('contacts:all', res);
      return res;
    }
    case 'create_contact': {
      const res = (await axios.post(`${BASE_URL}/api/contacts`, { ContactName: args.ContactName, Email: args.Email, ContactNumber: args.ContactNumber }, { headers })).data;
      clearCache('contacts');
      return res;
    }
    case 'update_contact': {
      const res = (await axios.put(`${BASE_URL}/api/contacts/${args.id}`, { ContactName: args.ContactName, Email: args.Email, ContactNumber: args.ContactNumber }, { headers })).data;
      clearCache('contacts');
      return res;
    }
    default: return null;
  }
}
module.exports = executeContactsTool;
EOF

cat > src/executors/address.executor.js << 'EOF'
const axios = require('axios');
const { BASE_URL } = require('../config');
const { getCache, setCache, clearCache } = require('../cache');

async function executeAddressTool(toolName, args, headers = {}) {
  switch (toolName) {
    case 'get_delivery_addresses': {
      const cached = getCache('address:all');
      if (cached) return cached;
      const res = (await axios.get(`${BASE_URL}/api/deliveryAddress`, { headers })).data;
      setCache('address:all', res);
      return res;
    }
    case 'add_delivery_address': {
      const res = (await axios.post(`${BASE_URL}/api/deliveryAddress`, { AddressLine1: args.AddressLine1, Suburb: args.Suburb, State: args.State, PostCode: args.PostCode }, { headers })).data;
      clearCache('address');
      return res;
    }
    case 'update_delivery_address': {
      const res = (await axios.put(`${BASE_URL}/api/deliveryAddress/${args.id}`, { AddressLine1: args.AddressLine1, Suburb: args.Suburb, State: args.State, PostCode: args.PostCode }, { headers })).data;
      clearCache('address');
      return res;
    }
    default: return null;
  }
}
module.exports = executeAddressTool;
EOF

cat > src/executors/orders.executor.js << 'EOF'
const axios = require('axios');
const { BASE_URL } = require('../config');
const { getCache, setCache } = require('../cache');

async function executeOrdersTool(toolName, args, headers = {}) {
  switch (toolName) {
    case 'get_orders': {
      const key = `orders:${args.status||'all'}`;
      const cached = getCache(key);
      if (cached) return cached;
      const res = (await axios.get(`${BASE_URL}/api/orders`, { headers, params: args.status ? { status: args.status } : {} })).data;
      setCache(key, res, 120000);
      return res;
    }
    case 'get_order_details': {
      const key = `order:${args.orderId}`;
      const cached = getCache(key);
      if (cached) return cached;
      const res = (await axios.get(`${BASE_URL}/api/orders/details`, { headers: { ...headers, orderId: args.orderId } })).data;
      setCache(key, res, 120000);
      return res;
    }
    case 'get_order_tracking': {
      const key = `tracking:${args.orderId}`;
      const cached = getCache(key);
      if (cached) return cached;
      const res = (await axios.get(`${BASE_URL}/api/orders/tracking`, { headers: { ...headers, orderId: args.orderId } })).data;
      setCache(key, res, 60000);
      return res;
    }
    default: return null;
  }
}
module.exports = executeOrdersTool;
EOF

cat > src/executors/requests.executor.js << 'EOF'
const axios = require('axios');
const { BASE_URL } = require('../config');
const { getCache, setCache } = require('../cache');

async function executeRequestsTool(toolName, args, headers = {}) {
  switch (toolName) {
    case 'get_requests': {
      const key = `requests:${args.status||'all'}`;
      const cached = getCache(key);
      if (cached) return cached;
      const res = (await axios.get(`${BASE_URL}/api/requests`, { headers, params: args.status ? { status: args.status } : {} })).data;
      setCache(key, res, 120000);
      return res;
    }
    case 'get_request_details': {
      const key = `request:${args.requestId}`;
      const cached = getCache(key);
      if (cached) return cached;
      const res = (await axios.get(`${BASE_URL}/api/requests/details`, { headers: { ...headers, 'X-Request-Id': args.requestId } })).data;
      setCache(key, res, 120000);
      return res;
    }
    default: return null;
  }
}
module.exports = executeRequestsTool;
EOF

cat > src/executors/mobUsers.executor.js << 'EOF'
const axios = require('axios');
const { BASE_URL } = require('../config');
const { getCache, setCache, clearCache } = require('../cache');

async function executeMobUsersTool(toolName, args, headers = {}) {
  switch (toolName) {
    case 'get_mobile_users': {
      const cached = getCache('mobusers:all');
      if (cached) return cached;
      const res = (await axios.get(`${BASE_URL}/api/mobUsers`, { headers })).data;
      setCache('mobusers:all', res);
      return res;
    }
    case 'get_mobile_user_by_id': {
      const key = `mobuser:${args.id}`;
      const cached = getCache(key);
      if (cached) return cached;
      const res = (await axios.get(`${BASE_URL}/api/mobUsers/${args.id}`, { headers })).data;
      setCache(key, res);
      return res;
    }
    case 'create_mobile_user': {
      const res = (await axios.post(`${BASE_URL}/api/mobUsers`, args, { headers })).data;
      clearCache('mobusers');
      return res;
    }
    case 'update_mobile_user': {
      const { id, ...body } = args;
      const res = (await axios.put(`${BASE_URL}/api/mobUsers/${id}`, body, { headers })).data;
      clearCache('mobusers');
      return res;
    }
    case 'delete_mobile_user': {
      const res = (await axios.delete(`${BASE_URL}/api/mobUsers/${args.id}`, { headers })).data;
      clearCache('mobusers');
      return res;
    }
    default: return null;
  }
}
module.exports = executeMobUsersTool;
EOF

cat > src/executors/services.executor.js << 'EOF'
const axios = require('axios');
const { BASE_URL } = require('../config');
const { getCache, setCache } = require('../cache');

async function executeServicesTool(toolName, args, headers = {}) {
  switch (toolName) {
    case 'get_services_list': {
      const cached = getCache('services:list');
      if (cached) return cached;
      const res = (await axios.get(`${BASE_URL}/api/services/list`, { headers })).data;
      setCache('services:list', res, 600000);
      return res;
    }
    case 'get_service_actions': {
      const key = `services:actions:${args.mobile_number}`;
      const cached = getCache(key);
      if (cached) return cached;
      const res = (await axios.get(`${BASE_URL}/api/services/actions`, { headers: { ...headers, mobile_number: args.mobile_number } })).data;
      setCache(key, res, 120000);
      return res;
    }
    case 'submit_service_action':
      return (await axios.post(`${BASE_URL}/api/services/submit`, args, { headers })).data;
    default: return null;
  }
}
module.exports = executeServicesTool;
EOF

cat > src/executors/simdata.executor.js << 'EOF'
const axios = require('axios');
const { BASE_URL } = require('../config');
const { getCache, setCache } = require('../cache');

async function executeSimdataTool(toolName, args, headers = {}) {
  switch (toolName) {
    case 'get_sim_list': {
      const key = `sim:list:${args.sim_type}`;
      const cached = getCache(key);
      if (cached) return cached;
      const res = (await axios.get(`${BASE_URL}/api/simdata/list`, { headers: { ...headers, sim_type: args.sim_type } })).data;
      setCache(key, res, 600000);
      return res;
    }
    case 'activate_new_sim':
      return (await axios.post(`${BASE_URL}/api/simdata/activate-new`, args, { headers })).data;
    case 'activate_port_in_sim':
      return (await axios.post(`${BASE_URL}/api/simdata/activate-port`, args, { headers })).data;
    default: return null;
  }
}
module.exports = executeSimdataTool;
EOF

# ── executors/index.js ────────────────────────────────────────────────────────
cat > src/executors/index.js << 'EOF'
const executePlansTool    = require('./plans.executor');
const executeContactsTool = require('./contacts.executor');
const executeAddressTool  = require('./address.executor');
const executeOrdersTool   = require('./orders.executor');
const executeRequestsTool = require('./requests.executor');
const executeMobUsersTool = require('./mobUsers.executor');
const executeServicesTool = require('./services.executor');
const executeSimdataTool  = require('./simdata.executor');

const executors = [
  executePlansTool, executeContactsTool, executeAddressTool,
  executeOrdersTool, executeRequestsTool, executeMobUsersTool,
  executeServicesTool, executeSimdataTool
];

async function executeTool(toolName, args, headers = {}) {
  console.log(`\n[Tool] ${toolName}`, JSON.stringify(args));
  try {
    for (const executor of executors) {
      const result = await executor(toolName, args, headers);
      if (result !== null && result !== undefined) {
        console.log(`[Tool] Success:`, JSON.stringify(result).slice(0, 200));
        return result;
      }
    }
    return { error: `No executor found for tool: ${toolName}` };
  } catch (err) {
    const errData = { error: true, status: err.response?.status, message: err.response?.data?.message || err.message };
    console.error(`[Tool] Error:`, errData);
    return errData;
  }
}

module.exports = executeTool;
EOF

# ── Update index.html to send active module ───────────────────────────────────
sed -i '' "s/body: JSON.stringify({ message: text, history: chatHistory, provider: activeProvider })/body: JSON.stringify({ message: text, history: chatHistory, provider: activeProvider, module: activeMod })/" public/index.html

echo ""
echo "✅ All files updated!"
echo ""
echo "🔍 Verifying tools..."
node -e "const t = require('./src/tools/index.js'); console.log('Tools loaded:', t.length)"
echo ""
echo "🚀 Run: npm run dev"
