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
