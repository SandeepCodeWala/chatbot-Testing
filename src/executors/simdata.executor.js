const axios = require('axios');
const { BASE_URL } = require('../config');
const { getCache, setCache } = require('../cache');

async function executeSimdataTool(toolName, args, headers = {}) {
  switch (toolName) {
    case 'get_sim_list': {
      const key = `sim:list:${args.sim_type}`;
      const cached = getCache(key);
      if (cached) return cached;
      const res = (await axios.get(`${BASE_URL}/api/simdata/list`, { headers: { ...headers, sim_type: args.sim_type } })).data;
      setCache(key, res, 600000);
      return res;
    }
    case 'activate_new_sim':
      return (await axios.post(`${BASE_URL}/api/simdata/activate-new`, args, { headers })).data;
    case 'activate_port_in_sim':
      return (await axios.post(`${BASE_URL}/api/simdata/activate-port`, args, { headers })).data;
    default: return null;
  }
}
module.exports = executeSimdataTool;
