const allTools = [
  ...require('./auth.tools'),
  ...require('./users.tools'),
  ...require('./friends.tools'),
];

console.log(`[Tools] Loaded ${allTools.length} tools`);
module.exports = allTools;
