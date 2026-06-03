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
