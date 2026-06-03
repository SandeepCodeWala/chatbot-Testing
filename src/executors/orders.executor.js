const axios = require('axios');
const { BASE_URL } = require('../config');
const { getCache, setCache } = require('../cache');

async function executeOrdersTool(toolName, args, headers = {}) {
  switch (toolName) {
    case 'get_orders': {
      const key = `orders:${args.status||'all'}`;
      const cached = getCache(key);
      if (cached) return cached;
      const res = (await axios.get(`${BASE_URL}/api/orders`, { headers, params: args.status ? { status: args.status } : {} })).data;
      setCache(key, res, 120000);
      return res;
    }
    case 'get_order_details': {
      const key = `order:${args.orderId}`;
      const cached = getCache(key);
      if (cached) return cached;
      const res = (await axios.get(`${BASE_URL}/api/orders/details`, { headers: { ...headers, orderId: args.orderId } })).data;
      setCache(key, res, 120000);
      return res;
    }
    case 'get_order_tracking': {
      const key = `tracking:${args.orderId}`;
      const cached = getCache(key);
      if (cached) return cached;
      const res = (await axios.get(`${BASE_URL}/api/orders/tracking`, { headers: { ...headers, orderId: args.orderId } })).data;
      setCache(key, res, 60000);
      return res;
    }
    default: return null;
  }
}
module.exports = executeOrdersTool;
