export const swaggerSpec = {
  openapi: '3.0.0',
  info: {
    title: 'Avenia API',
    version: '1.0.0',
    description: 'Avenia AI Chat Application Backend API',
    contact: {
      name: 'Avenia Team',
      email: 'support@avenia.app',
    },
    license: {
      name: 'MIT',
      url: 'https://opensource.org/licenses/MIT',
    },
  },
  servers: [
    {
      url: 'https://google-auth-e4er.onrender.com',
      description: 'Production server',
    },
    {
      url: 'http://localhost:3000',
      description: 'Development server',
    },
  ],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'JWT token obtained from authentication endpoints',
      },
    },
    schemas: {
      Error: {
        type: 'object',
        properties: {
          success: {
            type: 'boolean',
            example: false,
          },
          error: {
            type: 'object',
            properties: {
              code: {
                type: 'string',
                example: 'VALIDATION_ERROR',
              },
              message: {
                type: 'string',
                example: 'Invalid input data',
              },
              status_code: {
                type: 'integer',
                example: 400,
              },
            },
          },
          timestamp: {
            type: 'string',
            format: 'date-time',
            example: '2024-01-01T00:00:00.000Z',
          },
          request_id: {
            type: 'string',
            example: 'req_123456789',
          },
        },
      },
      Success: {
        type: 'object',
        properties: {
          success: {
            type: 'boolean',
            example: true,
          },
          data: {
            type: 'object',
            description: 'Response data',
          },
          message: {
            type: 'string',
            example: 'Operation successful',
          },
          timestamp: {
            type: 'string',
            format: 'date-time',
            example: '2024-01-01T00:00:00.000Z',
          },
        },
      },
      User: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            format: 'uuid',
            example: '123e4567-e89b-12d3-a456-426614174000',
          },
          email: {
            type: 'string',
            format: 'email',
            example: 'user@example.com',
          },
          name: {
            type: 'string',
            example: 'John Doe',
          },
          created_at: {
            type: 'string',
            format: 'date-time',
            example: '2024-01-01T00:00:00.000Z',
          },
          updated_at: {
            type: 'string',
            format: 'date-time',
            example: '2024-01-01T00:00:00.000Z',
          },
        },
      },
      AuthResponse: {
        type: 'object',
        properties: {
          success: {
            type: 'boolean',
            example: true,
          },
          data: {
            type: 'object',
            properties: {
              user: {
                $ref: '#/components/schemas/User',
              },
              accessToken: {
                type: 'string',
                example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
              },
              refreshToken: {
                type: 'string',
                example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
              },
              sessionId: {
                type: 'string',
                example: 'sess_123456789',
              },
            },
          },
        },
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
