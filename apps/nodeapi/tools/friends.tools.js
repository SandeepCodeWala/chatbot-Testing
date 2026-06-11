module.exports = [
  {
    name: 'get_all_friends',
    description: 'Get all friends of the logged-in user. Requires login.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'add_friend',
    description: 'Add a new friend for the logged-in user. Requires name, mobileNumber, and gender.',
    parameters: {
      type: 'object',
      properties: {
        name:         { type: 'string', description: 'Friend\'s full name' },
        mobileNumber: { type: 'string', description: 'Friend\'s mobile number' },
        gender:       { type: 'string', description: 'Friend\'s gender (male / female / other)' },
      },
      required: ['name', 'mobileNumber', 'gender'],
    },
  },
  {
    name: 'update_friend',
    description: 'Update an existing friend\'s details by their ID. Requires login.',
    parameters: {
      type: 'object',
      properties: {
        id:           { type: 'string', description: 'MongoDB _id of the friend to update' },
        name:         { type: 'string', description: 'Updated name' },
        mobileNumber: { type: 'string', description: 'Updated mobile number' },
        gender:       { type: 'string', description: 'Updated gender' },
      },
      required: ['id'],
    },
  },
  {
    name: 'delete_friend',
    description: 'Delete a friend by their ID. Requires login.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'MongoDB _id of the friend to delete' },
      },
      required: ['id'],
    },
  },
];
