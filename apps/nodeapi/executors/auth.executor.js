const axios      = require('axios');
const { BASE_URL } = require('../config');
const tokenStore = require('./token-store');

async function executeAuthTool(toolName, args) {
  switch (toolName) {

    case 'signup': {
      try {
        const res = await axios.post(`${BASE_URL}/signup`, {
          name:     args.name,
          email:    args.email,
          password: args.password,
          age:      parseInt(args.age, 10),
        });
        return { success: true, message: res.data?.message || 'Account created successfully. You can now login.' };
      } catch (err) {
        const msg = err.response?.data?.message || err.response?.data?.error || err.message;
        return { success: false, error: msg || 'Signup failed. Please check your details and try again.' };
      }
    }

    case 'login': {
      try {
        const res = await axios.post(`${BASE_URL}/login`, {
          email:    args.email,
          password: args.password,
        });
        const token = res.data?.token;
        if (token) {
          tokenStore.set(token);
          return { success: true, message: 'Login successful. You are now logged in and can use all features.' };
        }
        return { success: false, error: 'Login response did not include a token. Please try again.' };
      } catch (err) {
        const msg = err.response?.data?.message || err.response?.data?.error || err.message;
        const status = err.response?.status;
        if (status === 401 || status === 400) {
          return { success: false, error: 'Invalid email or password. Please check and try again.' };
        }
        return { success: false, error: msg || 'Login failed. Please try again.' };
      }
    }

    default: return null;
  }
}

module.exports = executeAuthTool;
