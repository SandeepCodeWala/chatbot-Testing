const axios = require('axios');
const { BASE_URL } = require('../config');
const { getCache, setCache, clearCache } = require('../../../src/cache');

async function executeAddressTool(toolName, args, headers = {}) {
  switch (toolName) {
    case 'get_delivery_addresses': {
      const cached = getCache('address:all');
      if (cached) return cached;
      const res = (await axios.get(`${BASE_URL}/api/deliveryAddress`, { headers })).data;
      setCache('address:all', res);
      return res;
    }
    case 'add_delivery_address': {
      const res = (await axios.post(`${BASE_URL}/api/deliveryAddress`, { AddressLine1: args.AddressLine1, Suburb: args.Suburb, State: args.State, PostCode: args.PostCode }, { headers })).data;
      clearCache('address');
      return res;
    }
    case 'update_delivery_address': {
      const res = (await axios.put(`${BASE_URL}/api/deliveryAddress/${args.id}`, { AddressLine1: args.AddressLine1, Suburb: args.Suburb, State: args.State, PostCode: args.PostCode }, { headers })).data;
      clearCache('address');
      return res;
    }
    default: return null;
  }
}
module.exports = executeAddressTool;
