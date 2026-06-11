require('dotenv').config();

// Global config — LLM provider settings and port only.
// App-specific config (BASE_URL, SYSTEM_PROMPT, MODULE_TOOLS, MODULE_HISTORY)
// lives in apps/<app-name>/config.js

module.exports = {
  LLM_PROVIDER:   (process.env.LLM_PROVIDER || 'groq').toLowerCase(),
  PORT:           process.env.PORT || 3000,

  GROQ_MODEL:     'meta-llama/llama-4-scout-17b-16e-instruct',
  CLAUDE_MODEL:   'claude-haiku-4-5-20251001',
  OPENAI_MODEL:   'gpt-4o-mini',
};
