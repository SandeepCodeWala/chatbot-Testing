const OpenAI      = require('openai');
const allTools    = require('../tools');
const executeTool = require('../executors');
const { OPENAI_API_KEY, SYSTEM_PROMPT } = require('../config');

const OPENAI_MODEL = 'gpt-4o-mini'; // cheapest, supports tool calling

async function runOpenAIAgent(messages, headers = {}, tools = allTools) {
  const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

  const openaiTools = tools.map(t => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.parameters }
  }));

  let currentMessages = [...messages];

  while (true) {
    const response = await openai.chat.completions.create({
      model:       OPENAI_MODEL,
      messages:    [{ role: 'system', content: SYSTEM_PROMPT }, ...currentMessages],
      tools:       openaiTools,
      tool_choice: 'auto',
      max_tokens:  1024
    });

    const assistantMsg = response.choices[0].message;
    console.log(`[OpenAI] Model: ${OPENAI_MODEL} | Tools sent: ${openaiTools.length} | finish_reason: ${response.choices[0].finish_reason}`);
    currentMessages.push(assistantMsg);

    // No tool calls — final answer
    if (!assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0) {
      return { reply: assistantMsg.content, messages: currentMessages };
    }

    // Execute tool calls
    for (const toolCall of assistantMsg.tool_calls) {
      let args;
      try { args = JSON.parse(toolCall.function.arguments); } catch { args = {}; }
      const result = await executeTool(toolCall.function.name, args, headers);
      currentMessages.push({
        role:         'tool',
        tool_call_id: toolCall.id,
        content:      JSON.stringify(result)
      });
    }
  }
}

module.exports = runOpenAIAgent;
