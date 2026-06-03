const axios = require('axios');
const { BASE_URL } = require('../config');
const { getCache, setCache } = require('../cache');

async function executeServicesTool(toolName, args, headers = {}) {
  switch (toolName) {
    case 'get_services_list': {
      const cached = getCache('services:list');
      if (cached) return cached;
      const res = (await axios.get(`${BASE_URL}/api/services/list`, { headers })).data;
      setCache('services:list', res, 600000);
      return res;
    }
    case 'get_service_actions': {
      const key = `services:actions:${args.mobile_number}`;
      const cached = getCache(key);
      if (cached) return cached;
      const res = (await axios.get(`${BASE_URL}/api/services/actions`, { headers: { ...headers, mobile_number: args.mobile_number } })).data;
      setCache(key, res, 120000);
      return res;
    }
    case 'submit_service_action':
      return (await axios.post(`${BASE_URL}/api/services/submit`, args, { headers })).data;
    default: return null;
  }
}
module.exports = executeServicesTool;
