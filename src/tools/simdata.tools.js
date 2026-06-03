const simdataTools = [
  {
    name: 'get_sim_list',
    description: 'Fetch SIM list for new or port-in activation.',
    parameters: {
      type: 'object',
      properties: {
        sim_type: { type: 'string', description: '"new" or "port-in"' }
      },
      required: ['sim_type']
    }
  },
  {
    name: 'activate_new_sim',
    description: 'Submit a new SIM activation request.',
    parameters: {
      type: 'object',
      properties: {
        SIMNumberId:  { type: 'string', description: 'SIM number ID' },
        NewSIMNumber: { type: 'string', description: 'New SIM number' },
        Reason:       { type: 'string', description: 'Reason for activation' }
      },
      required: ['SIMNumberId', 'NewSIMNumber']
    }
  },
  {
    name: 'activate_port_in_sim',
    description: 'Submit a port-in SIM activation request.',
    parameters: {
      type: 'object',
      properties: {
        SIMNumberId:                { type: 'string', description: 'SIM number ID' },
        PortInNumber:               { type: 'string', description: 'Number to port in' },
        ConnectionType:             { type: 'string', description: 'Connection type' },
        LosingCarrierAccountNumber: { type: 'string', description: 'Losing carrier account number' }
      },
      required: ['SIMNumberId', 'PortInNumber', 'ConnectionType', 'LosingCarrierAccountNumber']
    }
  }
];
module.exports = simdataTools;
