const plansTools = [
  {
    name: 'get_plans',
    description: 'Fetch available plans. Optionally filter by category or SIM type.',
    parameters: {
      type: 'object',
      properties: {
        category: { type: 'string', description: 'Filter plans by category' },
        simType:  { type: 'string', description: 'Filter plans by SIM type' }
      },
      required: []
    }
  },
  {
    name: 'add_plan_to_cart',
    description: 'Add a plan to the cart.',
    parameters: {
      type: 'object',
      properties: {
        PlanId:   { type: 'string',  description: 'The plan ID to add' },
        Quantity: { type: 'integer', description: 'Quantity to add' }
      },
      required: ['PlanId', 'Quantity']
    }
  },
  {
    name: 'get_cart',
    description: 'Get cart contents for a checkout session.',
    parameters: {
      type: 'object',
      properties: {
        checkout_id: { type: 'string', description: 'Checkout session ID' }
      },
      required: ['checkout_id']
    }
  }
];
module.exports = plansTools;
