const executePlansTool    = require('./plans.executor');
const executeContactsTool = require('./contacts.executor');
const executeAddressTool  = require('./address.executor');
const executeOrdersTool   = require('./orders.executor');
const executeRequestsTool = require('./requests.executor');
const executeMobUsersTool = require('./mobUsers.executor');
const executeServicesTool = require('./services.executor');
const executeSimdataTool  = require('./simdata.executor');

const executors = [
  executePlansTool, executeContactsTool, executeAddressTool,
  executeOrdersTool, executeRequestsTool, executeMobUsersTool,
  executeServicesTool, executeSimdataTool,
];

async function executeTool(toolName, args, headers = {}) {
  console.log(`\n[Tool] ${toolName}`, JSON.stringify(args));
  try {
    for (const executor of executors) {
      const result = await executor(toolName, args, headers);
      if (result !== null && result !== undefined) {
        console.log(`[Tool] Success:`, JSON.stringify(result).slice(0, 200));
        return result;
      }
    }
    return { error: `No executor found for tool: ${toolName}` };
  } catch (err) {
    const errData = { error: true, status: err.response?.status, message: err.response?.data?.message || err.message };
    console.error(`[Tool] Error:`, errData);
    return errData;
  }
}

module.exports = executeTool;
