const contactsTools = [
  {
    name: 'get_contacts',
    description: 'Fetch all saved contacts.',
    parameters: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'create_contact',
    description: 'Create a new contact. Requires ContactName, Email, and ContactNumber.',
    parameters: {
      type: 'object',
      properties: {
        ContactName:   { type: 'string', description: 'Full name of the contact' },
        Email:         { type: 'string', description: 'Email address' },
        ContactNumber: { type: 'string', description: 'Phone number' }
      },
      required: ['ContactName', 'Email', 'ContactNumber']
    }
  },
  {
    name: 'update_contact',
    description: 'Update an existing contact by their ID.',
    parameters: {
      type: 'object',
      properties: {
        id:            { type: 'integer', description: 'Contact ID to update' },
        ContactName:   { type: 'string',  description: 'Updated full name' },
        Email:         { type: 'string',  description: 'Updated email' },
        ContactNumber: { type: 'string',  description: 'Updated phone number' }
      },
      required: ['id']
    }
  }
];
module.exports = contactsTools;
