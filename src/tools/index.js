function toArray(mod) {
  if (Array.isArray(mod)) return mod;
  // if exported as { toolName: [...] } or { default: [...] }
  const values = Object.values(mod);
  if (values.length === 1 && Array.isArray(values[0])) return values[0];
  // if exported as object with multiple keys each being a tool object
  if (values.length > 0 && values[0]?.name) return values;
  return [];
}

const allTools = [
  ...toArray(require('./plans.tools')),
  ...toArray(require('./contacts.tools')),
  ...toArray(require('./address.tools')),
  ...toArray(require('./orders.tools')),
  ...toArray(require('./requests.tools')),
  ...toArray(require('./mobUsers.tools')),
  ...toArray(require('./services.tools')),
  ...toArray(require('./simdata.tools')),
];

console.log(`[Tools] Loaded ${allTools.length} tools`);
module.exports = allTools;