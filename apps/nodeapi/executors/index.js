const executeAuthTool    = require('./auth.executor');
const executeUsersTool   = require('./users.executor');
const executeFriendsTool = require('./friends.executor');

const executors = [executeAuthTool, executeUsersTool, executeFriendsTool];

async function executeTool(toolName, args, headers = {}) {
  console.log(`\n[Tool] ${toolName}`, JSON.stringify(args));
  try {
    for (const executor of executors) {
      const result = await executor(toolName, args, headers);
      if (result !== null && result !== undefined) {
        console.log(`[Tool] Result:`, JSON.stringify(result).slice(0, 200));
        return result;
      }
    }
    return { success: false, error: `Unknown tool: ${toolName}` };
  } catch (err) {
    console.error(`[Tool] Unexpected error in ${toolName}:`, err.message);
    return { success: false, error: 'An unexpected error occurred. Please try again.' };
  }
}

module.exports = executeTool;
