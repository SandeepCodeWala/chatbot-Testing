const axios      = require('axios');
const { BASE_URL } = require('../config');
const tokenStore = require('./token-store');
const { getCache, setCache } = require('../../../src/cache');

async function executeUsersTool(toolName, args) {
  switch (toolName) {

    case 'get_all_users': {
      try {
        const cached = getCache('nodeapi:users:all');
        if (cached) return cached;
        const res = await axios.get(`${BASE_URL}/users`);
        const data = { success: true, users: res.data };
        setCache('nodeapi:users:all', data, 60 * 1000);
        return data;
      } catch (err) {
        const msg = err.response?.data?.message || err.message;
        return { success: false, error: msg || 'Failed to fetch users.' };
      }
    }

    case 'get_user_by_id': {
      if (!tokenStore.isLoggedIn()) {
        return { success: false, error: 'You need to be logged in to view a user by ID. Please login first.' };
      }
      try {
        const res = await axios.get(`${BASE_URL}/user/${args.userId}`, { headers: tokenStore.headers() });
        return { success: true, user: res.data };
      } catch (err) {
        const status = err.response?.status;
        const msg    = err.response?.data?.message || err.message;
        if (status === 401 || status === 403) {
          tokenStore.clear();
          return { success: false, error: 'Session expired. Please login again.' };
        }
        if (status === 404) return { success: false, error: `No user found with ID: ${args.userId}` };
        return { success: false, error: msg || 'Failed to fetch user.' };
      }
    }

    case 'get_my_profile': {
      if (!tokenStore.isLoggedIn()) {
        return { success: false, error: 'You need to be logged in to view your profile. Please login first.' };
      }
      try {
        const res = await axios.get(`${BASE_URL}/profile`, { headers: tokenStore.headers() });
        return { success: true, profile: res.data };
      } catch (err) {
        const status = err.response?.status;
        const msg    = err.response?.data?.message || err.message;
        if (status === 401 || status === 403) {
          tokenStore.clear();
          return { success: false, error: 'Session expired. Please login again.' };
        }
        return { success: false, error: msg || 'Failed to fetch profile.' };
      }
    }

    default: return null;
  }
}

module.exports = executeUsersTool;
