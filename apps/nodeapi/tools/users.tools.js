module.exports = [
  {
    name: 'get_all_users',
    description: 'Fetch all registered users. No login required. Passwords are not included.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_user_by_id',
    description: 'Fetch a specific user by their ID. Requires login.',
    parameters: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'The MongoDB _id of the user' },
      },
      required: ['userId'],
    },
  },
  {
    name: 'get_my_profile',
    description: 'Get the currently logged-in user\'s own profile. Requires login.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
];
