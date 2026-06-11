// Shared in-memory token store for this app's session.
// All executors import from here so they always use the latest token.
let token = null;

module.exports = {
  set(t)   { token = t; },
  get()    { return token; },
  clear()  { token = null; },
  headers() {
    return token ? { Authorization: `Bearer ${token}` } : {};
  },
  isLoggedIn() { return !!token; },
};
