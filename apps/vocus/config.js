// ─────────────────────────────────────────────────────────────────────────────
// Vocus app configuration
// Every new app gets its own config.js with these four exports.
// Do NOT put API keys here — those live in the root .env file.
// ─────────────────────────────────────────────────────────────────────────────

module.exports = {

  BASE_URL: process.env.BACKEND_BASE_URL || 'http://localhost:5000',

  SYSTEM_PROMPT: `You are a helpful assistant for a mobile app.
You help users manage plans, cart, contacts, delivery addresses, orders, requests, mobile users, services, and SIM cards.
Rules:
- Collect ALL required fields before calling any tool.
- If user gives all details in one message, extract them directly without asking again.
- NEVER auto-fill or assume missing fields from previous API responses.
- NEVER retry a failed API call automatically. If a tool returns an error, stop and tell the user exactly what failed and ask them to confirm before trying again.
- After every successful action, confirm clearly what was done.
- If an action fails, tell the user and wait for their instruction.
- Keep responses short and friendly.
- Always reply in the same language the user writes in.`,

  // Which tools are available per module tab.
  // null means all tools. Add new modules here when you add new tool groups.
  MODULE_TOOLS: {
    all:      null,
    plans:    ['get_plans', 'add_plan_to_cart', 'get_cart'],
    contacts: ['get_contacts', 'create_contact', 'update_contact'],
    address:  ['get_delivery_addresses', 'add_delivery_address', 'update_delivery_address'],
    orders:   ['get_orders', 'get_order_details', 'get_order_tracking'],
    requests: ['get_requests', 'get_request_details'],
    users:    ['get_mobile_users', 'get_mobile_user_by_id', 'create_mobile_user', 'update_mobile_user', 'delete_mobile_user'],
    services: ['get_services_list', 'get_service_actions', 'submit_service_action'],
    sim:      ['get_sim_list', 'activate_new_sim', 'activate_port_in_sim'],
  },

  // How many history messages to keep per module.
  // Read-only modules need fewer turns; multi-step write flows need more.
  MODULE_HISTORY: {
    all:      8,
    plans:    6,
    contacts: 8,
    address:  8,
    orders:   4,
    requests: 4,
    users:    8,
    services: 8,
    sim:      8,
  },
};
