const OpenAI         = require('openai');
const { SYSTEM_PROMPT } = require('../../apps/' + (process.env.APP || 'vocus') + '/config');
const { callWithRetry } = require('../key-manager');

const OPENAI_MODEL = 'gpt-4o-mini';

async function runOpenAIAgent(messages, headers = {}, tools, executeTool) {
  const openaiTools = tools.map(t => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));

  let currentMessages = [...messages];
  let totalUsage = { input: 0, output: 0, total: 0, cached: 0 };

  while (true) {
    const response = await callWithRetry('openai', apiKey => {
      const openai = new OpenAI({ apiKey });
      return openai.chat.completions.create({
        model:       OPENAI_MODEL,
        messages:    [{ role: 'system', content: SYSTEM_PROMPT }, ...currentMessages],
        tools:       openaiTools,
        tool_choice: 'auto',
        max_tokens:  1024,
      });
    });

    const assistantMsg = response.choices[0].message;
    const u            = response.usage || {};
    const cachedTokens = u.prompt_tokens_details?.cached_tokens || 0;
    totalUsage.input  += u.prompt_tokens     || 0;
    totalUsage.output += u.completion_tokens || 0;
    totalUsage.total  += u.total_tokens      || 0;
    totalUsage.cached += cachedTokens;

    console.log(`[OpenAI] model:${OPENAI_MODEL} | in:${u.prompt_tokens||0} out:${u.completion_tokens||0} cached:${cachedTokens} | finish:${response.choices[0].finish_reason}`);
    currentMessages.push(assistantMsg);

    if (!assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0) {
      console.log(`[OpenAI] Total → in:${totalUsage.input} out:${totalUsage.output} total:${totalUsage.total} cached:${totalUsage.cached}`);
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

module.exports = runOpenAIAgent;
