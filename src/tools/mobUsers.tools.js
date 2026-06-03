const mobUsersTools = [
  {
    name: 'get_mobile_users',
    description: 'Fetch all mobile users.',
    parameters: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'get_mobile_user_by_id',
    description: 'Fetch a specific mobile user by their ID.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'integer', description: 'Mobile user ID' }
      },
      required: ['id']
    }
  },
  {
    name: 'create_mobile_user',
    description: 'Create a new mobile user account.',
    parameters: {
      type: 'object',
      properties: {
        Uid:        { type: 'string',  description: 'Unique identifier' },
        FirstName:  { type: 'string',  description: 'First name' },
        LastName:   { type: 'string',  description: 'Last name' },
        Email:      { type: 'string',  description: 'Email address' },
        PrimMobNo:  { type: 'string',  description: 'Primary mobile number' },
        SeconMobNo: { type: 'string',  description: 'Secondary mobile number' },
        IsActive:   { type: 'boolean', description: 'Is user active?' },
        IsLocked:   { type: 'boolean', description: 'Is user locked?' }
      },
      required: ['Uid', 'FirstName', 'LastName', 'Email', 'PrimMobNo']
    }
  },
  {
    name: 'update_mobile_user',
    description: 'Update an existing mobile user by their ID.',
    parameters: {
      type: 'object',
      properties: {
        id:         { type: 'integer', description: 'Mobile user ID to update' },
        FirstName:  { type: 'string',  description: 'Updated first name' },
        LastName:   { type: 'string',  description: 'Updated last name' },
        Email:      { type: 'string',  description: 'Updated email' },
        PrimMobNo:  { type: 'string',  description: 'Updated primary mobile number' },
        SeconMobNo: { type: 'string',  description: 'Updated secondary mobile number' },
        IsActive:   { type: 'boolean', description: 'Is user active?' },
        IsLocked:   { type: 'boolean', description: 'Is user locked?' }
      },
      required: ['id']
    }
  },
  {
    name: 'delete_mobile_user',
    description: 'Delete a mobile user by their ID.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'integer', description: 'Mobile user ID to delete' }
      },
      required: ['id']
    }
  }
];
module.exports = mobUsersTools;
