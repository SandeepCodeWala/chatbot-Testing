const Groq           = require('groq-sdk');
const { SYSTEM_PROMPT } = require('../../apps/' + (process.env.APP || 'vocus') + '/config');
const { callWithRetry } = require('../key-manager');

const GROQ_MODELS = [
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'llama-3.3-70b-versatile',
  'llama3-70b-8192',
];

async function callGroq(apiKey, messages, groqTools, systemPrompt) {
  const groq = new Groq({ apiKey });
  let lastErr;

  for (const model of GROQ_MODELS) {
    try {
      const response = await groq.chat.completions.create({
        model,
        messages:    [{ role: 'system', content: systemPrompt }, ...messages],
        tools:       groqTools,
        tool_choice: 'auto',
        max_tokens:  1024,
      });
      const u = response.usage || {};
      console.log(`[Groq] model:${model} | in:${u.prompt_tokens||0} out:${u.completion_tokens||0} total:${u.total_tokens||0}`);
      return response;
    } catch (err) {
      const msg = err?.error?.message || err?.message || '';
      if (msg.includes('decommissioned') || msg.includes('not found') || msg.includes('does not exist')) {
        console.warn(`[Groq] model ${model} unavailable, trying next...`);
        lastErr = err; continue;
      }
      throw err;
    }
  }
  throw lastErr || new Error('All Groq models exhausted');
}

async function runGroqAgent(messages, headers = {}, tools, executeTool, opts = {}) {
  const groqTools = tools.map(t => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));

  const activePrompt = opts.systemPrompt || SYSTEM_PROMPT;
  let currentMessages = [...messages];
  let totalUsage = { input: 0, output: 0, total: 0 };

  while (true) {
    const response = await callWithRetry('groq', apiKey =>
      callGroq(apiKey, currentMessages, groqTools, activePrompt)
    );

    const assistantMsg = response.choices[0].message;
    const u = response.usage || {};
    totalUsage.input  += u.prompt_tokens     || 0;
    totalUsage.output += u.completion_tokens || 0;
    totalUsage.total  += u.total_tokens      || 0;
    currentMessages.push(assistantMsg);

    if (!assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0) {
      console.log(`[Groq] Total → in:${totalUsage.input} out:${totalUsage.output} total:${totalUsage.total}`);
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
