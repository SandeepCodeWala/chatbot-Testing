require('dotenv').config();

module.exports = {
  BASE_URL:       process.env.BACKEND_BASE_URL || 'http://localhost:5000',
  LLM_PROVIDER:   (process.env.LLM_PROVIDER || 'groq').toLowerCase(),
  GROQ_API_KEY:   process.env.GROQ_API_KEY,
  CLAUDE_API_KEY: process.env.CLAUDE_API_KEY,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  PORT:           process.env.PORT || 3000,

  GROQ_MODEL:   'meta-llama/llama-4-scout-17b-16e-instruct',
  CLAUDE_MODEL: 'claude-haiku-4-5-20251001',
  OPENAI_MODEL: 'gpt-4o-mini',

  SYSTEM_PROMPT: `You are a helpful assistant for a mobile app.
You help users manage plans, cart, contacts, delivery addresses, orders, requests, mobile users, services, and SIM cards.
Rules:
- Collect ALL required fields before calling any tool.
- If user gives all details in one message, extract them directly without asking again.
- NEVER auto-fill or assume missing fields from previous API responses.
- NEVER retry a failed API call automatically. If a tool returns an error, stop and tell the user exactly what failed and ask them to confirm before trying again.
- After every successful action, confirm clearly what was done.
- If an action fails, tell the user and wait for their instruction.
- Keep responses short and friendly.`
};
