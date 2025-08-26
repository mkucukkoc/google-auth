export const swaggerSpec = {
  openapi: '3.0.0',
  info: {
    title: 'Avenia API',
    version: '1.0.0',
  },
  components: {
    securitySchemes: {
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
  },
  paths: {
    '/health': {
      get: {
        summary: 'Health check',
        responses: {
          200: { description: 'OK' },
        },
      },
    },
    '/auth/email/start': {
      post: {
        summary: 'Request OTP code',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  email: { type: 'string' },
                },
                required: ['email'],
              },
            },
          },
        },
        responses: {
          200: { description: 'OTP sent' },
          400: { description: 'Invalid request' },
          429: { description: 'Rate limited' },
        },
      },
    },
    '/auth/email/verify': {
      post: {
        summary: 'Verify OTP and login',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  email: { type: 'string' },
                  otp: { type: 'string' },
                  device_id: { type: 'string' },
                  device_name: { type: 'string' },
                },
                required: ['email', 'otp', 'device_id'],
              },
            },
          },
        },
        responses: {
          200: { description: 'Tokens issued' },
          400: { description: 'Invalid request or OTP' },
        },
      },
    },
    '/auth/refresh': {
      post: {
        summary: 'Rotate refresh token',
        parameters: [
          {
            in: 'header',
            name: 'x-refresh-id',
            required: true,
            schema: { type: 'string' },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  refresh_token: { type: 'string' },
                  device_id: { type: 'string' },
                },
                required: ['refresh_token', 'device_id'],
              },
            },
          },
        },
        responses: {
          200: { description: 'Tokens issued' },
          400: { description: 'Invalid request' },
          401: { description: 'Invalid refresh token' },
        },
      },
    },
    '/auth/logout': {
      post: {
        summary: 'Revoke refresh token for device',
        parameters: [
          {
            in: 'header',
            name: 'x-refresh-id',
            required: true,
            schema: { type: 'string' },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  device_id: { type: 'string' },
                },
                required: ['device_id'],
              },
            },
          },
        },
        responses: {
          200: { description: 'OK' },
          400: { description: 'Invalid request' },
        },
      },
    },
    '/auth/logout_all': {
      post: {
        summary: 'Revoke all refresh tokens for user',
        parameters: [
          {
            in: 'header',
            name: 'x-refresh-id',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: {
          200: { description: 'OK' },
          400: { description: 'Invalid request' },
        },
      },
    },
    '/user/me': {
      get: {
        summary: 'Get current user',
        security: [{ BearerAuth: [] }],
        responses: {
          200: { description: 'User info' },
          401: { description: 'Unauthorized' },
        },
      },
    },
  },
} as const;
