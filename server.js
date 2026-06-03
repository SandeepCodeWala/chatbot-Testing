require('dotenv').config();
const express          = require('express');
const cors             = require('cors');
const path             = require('path');
const runGroqAgent     = require('./src/agents/groq.agent');
const runClaudeAgent   = require('./src/agents/claude.agent');
const runOpenAIAgent   = require('./src/agents/openai.agent');
const allTools         = require('./src/tools');
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

    // ① Trim history — remove orphaned tool_results first, then slice last 8
    const raw = history.slice(-8);
    const toolUseIds = new Set();
    raw.forEach(m => {
      if (m.role === 'assistant' && Array.isArray(m.content)) {
        m.content.forEach(b => { if (b.type === 'tool_use') toolUseIds.add(b.id); });
      }
    });
    const trimmedHistory = raw.filter(m => {
      if (m.role === 'user' && Array.isArray(m.content)) {
        const hasOrphan = m.content.some(b => b.type === 'tool_result' && !toolUseIds.has(b.tool_use_id));
        return !hasOrphan;
      }
      return true;
    });

    // ② Filter tools by active module
    const filteredTools = getToolsForModule(mod);
    const messages = [...trimmedHistory, { role: 'user', content: message }];

    console.log(`[Chat] ${activeProvider.toUpperCase()} | module: ${mod} | tools: ${filteredTools.length} | history: ${trimmedHistory.length} | "${message}"`);

    let result;
    if (activeProvider === 'claude') {
      result = await runClaudeAgent(messages, {}, filteredTools);
    } else if (activeProvider === 'openai') {
      result = await runOpenAIAgent(messages, {}, filteredTools);
    } else {
      result = await runGroqAgent(messages, {}, filteredTools);
    }

    res.json({ reply: result.reply, history: result.messages, provider: activeProvider });

  } catch (err) {
    const errDetail = err?.error?.message || err?.response?.data?.error?.message || err?.response?.data?.message || err?.message || 'Unknown error';
    console.error('[Chat Error]', err?.response?.status || '', errDetail);
    res.status(500).json({ error: "Sorry, I'm having trouble processing your request right now. Please try again or rephrase your message." });
  }
});

app.get('/provider', (req, res) => res.json({ provider: LLM_PROVIDER }));

app.listen(PORT, () => console.log(`✅ Running → http://localhost:${PORT}\n`));