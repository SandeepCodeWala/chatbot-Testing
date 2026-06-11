const axios          = require('axios');
const { CLAUDE_MODEL } = require('../config');
const { SYSTEM_PROMPT } = require('../../apps/' + (process.env.APP || 'vocus') + '/config');
const { callWithRetry } = require('../key-manager');

const systemBlock = [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }];

async function runClaudeAgent(messages, headers = {}, tools, executeTool) {
  const claudeTools = tools.map((t, i) => {
    const tool = { name: t.name, description: t.description, input_schema: t.parameters };
    if (i === tools.length - 1) tool.cache_control = { type: 'ephemeral' };
    return tool;
  });

  let currentMessages = [...messages];
  let totalUsage = { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 };

  while (true) {
    const response = await callWithRetry('claude', apiKey =>
      axios.post(
        'https://api.anthropic.com/v1/messages',
        { model: CLAUDE_MODEL, max_tokens: 1024, system: systemBlock, tools: claudeTools, messages: currentMessages },
        {
          headers: {
            'Content-Type':      'application/json',
            'x-api-key':         apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-beta':    'prompt-caching-2024-07-31',
          },
        }
      )
    );

    const data = response.data;
    const u    = data.usage || {};
    totalUsage.input      += u.input_tokens                || 0;
    totalUsage.output     += u.output_tokens               || 0;
    totalUsage.cacheWrite += u.cache_creation_input_tokens || 0;
    totalUsage.cacheRead  += u.cache_read_input_tokens     || 0;

    console.log(`[Claude] stop:${data.stop_reason} | in:${u.input_tokens} out:${u.output_tokens} | cache_write:${u.cache_creation_input_tokens||0} cache_read:${u.cache_read_input_tokens||0}`);
    currentMessages.push({ role: 'assistant', content: data.content });

    if (data.stop_reason === 'end_turn') {
      console.log(`[Claude] Total → in:${totalUsage.input} out:${totalUsage.output} cacheWrite:${totalUsage.cacheWrite} cacheRead:${totalUsage.cacheRead}`);
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

    console.log(`[Claude] Total → in:${totalUsage.input} out:${totalUsage.output} cacheWrite:${totalUsage.cacheWrite} cacheRead:${totalUsage.cacheRead}`);
    return { reply: data.content.find(b => b.type === 'text')?.text || 'Done.', messages: currentMessages };
  }
}

module.exports = runClaudeAgent;
