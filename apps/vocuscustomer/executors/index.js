// All tool execution for VocusCustomer is handled by the dynamic registry
module.exports = async function executeTool(name) {
  throw new Error(`Unknown static tool: ${name}`);
};
