const axios = require('axios');
const { BASE_URL } = require('../config');
const { getCache, setCache } = require('../cache');

async function executeRequestsTool(toolName, args, headers = {}) {
  switch (toolName) {
    case 'get_requests': {
      const key = `requests:${args.status||'all'}`;
      const cached = getCache(key);
      if (cached) return cached;
      const res = (await axios.get(`${BASE_URL}/api/requests`, { headers, params: args.status ? { status: args.status } : {} })).data;
      setCache(key, res, 120000);
      return res;
    }
    case 'get_request_details': {
      const key = `request:${args.requestId}`;
      const cached = getCache(key);
      if (cached) return cached;
      const res = (await axios.get(`${BASE_URL}/api/requests/details`, { headers: { ...headers, 'X-Request-Id': args.requestId } })).data;
      setCache(key, res, 120000);
      return res;
    }
    default: return null;
  }
}
module.exports = executeRequestsTool;
