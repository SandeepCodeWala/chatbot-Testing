const axios = require('axios');
const { BASE_URL } = require('../config');
const { getCache, setCache, clearCache } = require('../cache');

async function executeContactsTool(toolName, args, headers = {}) {
  switch (toolName) {
    case 'get_contacts': {
      const cached = getCache('contacts:all');
      if (cached) return cached;
      const res = (await axios.get(`${BASE_URL}/api/contacts`, { headers })).data;
      setCache('contacts:all', res);
      return res;
    }
    case 'create_contact': {
      const res = (await axios.post(`${BASE_URL}/api/contacts`, { ContactName: args.ContactName, Email: args.Email, ContactNumber: args.ContactNumber }, { headers })).data;
      clearCache('contacts');
      return res;
    }
    case 'update_contact': {
      const res = (await axios.put(`${BASE_URL}/api/contacts/${args.id}`, { ContactName: args.ContactName, Email: args.Email, ContactNumber: args.ContactNumber }, { headers })).data;
      clearCache('contacts');
      return res;
    }
    default: return null;
  }
}
module.exports = executeContactsTool;
