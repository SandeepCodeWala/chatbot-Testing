const addressTools = [
  {
    name: 'get_delivery_addresses',
    description: 'Fetch all saved delivery addresses.',
    parameters: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'add_delivery_address',
    description: 'Add a new delivery address. Requires AddressLine1, Suburb, State, and PostCode.',
    parameters: {
      type: 'object',
      properties: {
        AddressLine1: { type: 'string', description: 'Street address line 1' },
        Suburb:       { type: 'string', description: 'Suburb or city name' },
        State:        { type: 'string', description: 'State or province' },
        PostCode:     { type: 'string', description: 'Postal code' }
      },
      required: ['AddressLine1', 'Suburb', 'State', 'PostCode']
    }
  },
  {
    name: 'update_delivery_address',
    description: 'Update an existing delivery address by its ID.',
    parameters: {
      type: 'object',
      properties: {
        id:           { type: 'integer', description: 'Address ID to update' },
        AddressLine1: { type: 'string',  description: 'Updated street address' },
        Suburb:       { type: 'string',  description: 'Updated suburb' },
        State:        { type: 'string',  description: 'Updated state' },
        PostCode:     { type: 'string',  description: 'Updated postal code' }
      },
      required: ['id']
    }
  }
];
module.exports = addressTools;
