const store = {};

function getCache(key) {
  const entry = store[key];
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { delete store[key]; return null; }
  console.log(`[Cache] HIT: ${key}`);
  return entry.data;
}

function setCache(key, data, ttlMs = 5 * 60 * 1000) {
  store[key] = { data, expiresAt: Date.now() + ttlMs };
  console.log(`[Cache] SET: ${key} (${ttlMs/1000}s)`);
}

function clearCache(pattern) {
  Object.keys(store).forEach(k => { if (k.includes(pattern)) delete store[k]; });
}

module.exports = { getCache, setCache, clearCache };
