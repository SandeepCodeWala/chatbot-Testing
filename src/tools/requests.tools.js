const requestsTools = [
  {
    name: 'get_requests',
    description: 'Fetch requests. Optionally filter by status (all, in-progress, completed, completed-with-failure).',
    parameters: {
      type: 'object',
      properties: {
        status: { type: 'string', description: 'Filter: all, in-progress, completed, completed-with-failure' }
      },
      required: []
    }
  },
  {
    name: 'get_request_details',
    description: 'Fetch details of a specific request by its request ID.',
    parameters: {
      type: 'object',
      properties: {
        requestId: { type: 'string', description: 'Request ID e.g. REQ-000002072754' }
      },
      required: ['requestId']
    }
  }
];
module.exports = requestsTools;
