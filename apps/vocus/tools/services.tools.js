const servicesTools = [
  {
    name: 'get_services_list',
    description: 'Fetch the list of available mobile services.',
    parameters: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'get_service_actions',
    description: 'Fetch available actions for a specific mobile number.',
    parameters: {
      type: 'object',
      properties: {
        mobile_number: { type: 'string', description: 'Mobile number to look up actions for' }
      },
      required: ['mobile_number']
    }
  },
  {
    name: 'submit_service_action',
    description: 'Submit a service action request for a mobile number.',
    parameters: {
      type: 'object',
      properties: {
        MobileNumber:  { type: 'string', description: 'Target mobile number' },
        ActionId:      { type: 'string', description: 'Action ID to perform' },
        ScheduledDate: { type: 'string', description: 'Scheduled date ISO 8601' },
        Reason:        { type: 'string', description: 'Reason for the action' }
      },
      required: ['MobileNumber', 'ActionId']
    }
  }
];
module.exports = servicesTools;
