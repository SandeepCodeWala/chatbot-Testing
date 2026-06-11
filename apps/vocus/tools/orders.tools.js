const ordersTools = [
  {
    name: 'get_orders',
    description: 'Fetch order history. Optionally filter by status.',
    parameters: {
      type: 'object',
      properties: {
        status: { type: 'string', description: 'Order status filter e.g. all, pending, completed' }
      },
      required: []
    }
  },
  {
    name: 'get_order_details',
    description: 'Fetch details of a specific order by its order ID.',
    parameters: {
      type: 'object',
      properties: {
        orderId: { type: 'string', description: 'Order ID e.g. ORD-000002072754' }
      },
      required: ['orderId']
    }
  },
  {
    name: 'get_order_tracking',
    description: 'Fetch tracking information for a specific order.',
    parameters: {
      type: 'object',
      properties: {
        orderId: { type: 'string', description: 'Order ID to track' }
      },
      required: ['orderId']
    }
  }
];
module.exports = ordersTools;
