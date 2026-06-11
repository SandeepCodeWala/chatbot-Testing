module.exports = [
  {
    name: 'signup',
    description: 'Register a new user account. Requires name, email, password, and age.',
    parameters: {
      type: 'object',
      properties: {
        name:     { type: 'string',  description: 'Full name of the user' },
        email:    { type: 'string',  description: 'Email address' },
        password: { type: 'string',  description: 'Password (min 6 characters)' },
        age:      { type: 'integer', description: 'Age of the user' },
      },
      required: ['name', 'email', 'password', 'age'],
    },
  },
  {
    name: 'login',
    description: 'Login with email and password. Returns a JWT token that enables access to protected features.',
    parameters: {
      type: 'object',
      properties: {
        email:    { type: 'string', description: 'Registered email address' },
        password: { type: 'string', description: 'Account password' },
      },
      required: ['email', 'password'],
    },
  },
];
