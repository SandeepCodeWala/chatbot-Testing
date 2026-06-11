const axios = require('axios');
const { BASE_URL } = require('../config');
const { getCache, setCache, clearCache } = require('../../../src/cache');

async function executeMobUsersTool(toolName, args, headers = {}) {
  switch (toolName) {
    case 'get_mobile_users': {
      const cached = getCache('mobusers:all');
      if (cached) return cached;
      const res = (await axios.get(`${BASE_URL}/api/mobUsers`, { headers })).data;
      setCache('mobusers:all', res);
      return res;
    }
    case 'get_mobile_user_by_id': {
      const key = `mobuser:${args.id}`;
      const cached = getCache(key);
      if (cached) return cached;
      const res = (await axios.get(`${BASE_URL}/api/mobUsers/${args.id}`, { headers })).data;
      setCache(key, res);
      return res;
    }
    case 'create_mobile_user': {
      const res = (await axios.post(`${BASE_URL}/api/mobUsers`, args, { headers })).data;
      clearCache('mobusers');
      return res;
    }
    case 'update_mobile_user': {
      const { id, ...body } = args;
      const res = (await axios.put(`${BASE_URL}/api/mobUsers/${id}`, body, { headers })).data;
      clearCache('mobusers');
      return res;
    }
    case 'delete_mobile_user': {
      const res = (await axios.delete(`${BASE_URL}/api/mobUsers/${args.id}`, { headers })).data;
      clearCache('mobusers');
      return res;
    }
    default: return null;
  }
}
module.exports = executeMobUsersTool;
