const axios = require('axios');
const { BASE_URL } = require('../config');
const { getCache, setCache } = require('../cache');

async function executePlansTool(toolName, args, headers = {}) {
  switch (toolName) {
    case 'get_plans': {
      const key = `plans:${args.category||'all'}:${args.simType||'all'}`;
      const cached = getCache(key);
      if (cached) return cached;
      const res = (await axios.get(`${BASE_URL}/api/plans`, {
        headers: { ...headers, ...(args.category && { category: args.category }), ...(args.simType && { simType: args.simType }) }
      })).data;
      setCache(key, res);
      return res;
    }
    case 'add_plan_to_cart':
      return (await axios.post(`${BASE_URL}/api/plans/cart/add`, { PlanId: args.PlanId, Quantity: args.Quantity }, { headers })).data;
    case 'get_cart': {
      const key = `cart:${args.checkout_id}`;
      const cached = getCache(key);
      if (cached) return cached;
      const res = (await axios.get(`${BASE_URL}/api/plans/cart`, { headers: { ...headers, checkout_id: args.checkout_id } })).data;
      setCache(key, res, 60000);
      return res;
    }
    default: return null;
  }
}
module.exports = executePlansTool;
