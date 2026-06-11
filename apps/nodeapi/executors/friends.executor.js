const axios      = require('axios');
const { BASE_URL } = require('../config');
const tokenStore = require('./token-store');
const { getCache, setCache, clearCache } = require('../../../src/cache');

function notLoggedIn() {
  return { success: false, error: 'You need to be logged in to manage friends. Please login first.' };
}

function handleAuthError(err) {
  const status = err.response?.status;
  const msg    = err.response?.data?.message || err.message;
  if (status === 401 || status === 403) {
    tokenStore.clear();
    return { success: false, error: 'Session expired. Please login again.' };
  }
  return { success: false, error: msg || 'Something went wrong. Please try again.' };
}

async function executeFriendsTool(toolName, args) {
  switch (toolName) {

    case 'get_all_friends': {
      if (!tokenStore.isLoggedIn()) return notLoggedIn();
      try {
        const cached = getCache('nodeapi:friends:all');
        if (cached) return cached;
        const res  = await axios.get(`${BASE_URL}/friends`, { headers: tokenStore.headers() });
        const data = { success: true, friends: res.data };
        setCache('nodeapi:friends:all', data, 60 * 1000);
        return data;
      } catch (err) { return handleAuthError(err); }
    }

    case 'add_friend': {
      if (!tokenStore.isLoggedIn()) return notLoggedIn();
      try {
        const res = await axios.post(
          `${BASE_URL}/friends`,
          { name: args.name, mobileNumber: args.mobileNumber, gender: args.gender },
          { headers: { ...tokenStore.headers(), 'Content-Type': 'application/json' } }
        );
        clearCache('nodeapi:friends');
        return { success: true, message: `Friend "${args.name}" added successfully.`, friend: res.data };
      } catch (err) {
        if (err.response?.status === 400) {
          const msg = err.response?.data?.message || 'Invalid data. Please check the details.';
          return { success: false, error: msg };
        }
        return handleAuthError(err);
      }
    }

    case 'update_friend': {
      if (!tokenStore.isLoggedIn()) return notLoggedIn();
      try {
        const body = {};
        if (args.name)         body.name         = args.name;
        if (args.mobileNumber) body.mobileNumber = args.mobileNumber;
        if (args.gender)       body.gender       = args.gender;

        const res = await axios.put(
          `${BASE_URL}/friends/${args.id}`,
          body,
          { headers: { ...tokenStore.headers(), 'Content-Type': 'application/json' } }
        );
        clearCache('nodeapi:friends');
        return { success: true, message: 'Friend updated successfully.', friend: res.data };
      } catch (err) {
        if (err.response?.status === 404) {
          return { success: false, error: `No friend found with ID: ${args.id}` };
        }
        return handleAuthError(err);
      }
    }

    case 'delete_friend': {
      if (!tokenStore.isLoggedIn()) return notLoggedIn();
      try {
        await axios.delete(`${BASE_URL}/friends/${args.id}`, { headers: tokenStore.headers() });
        clearCache('nodeapi:friends');
        return { success: true, message: `Friend deleted successfully.` };
      } catch (err) {
        if (err.response?.status === 404) {
          return { success: false, error: `No friend found with ID: ${args.id}` };
        }
        return handleAuthError(err);
      }
    }

    default: return null;
  }
}

module.exports = executeFriendsTool;
