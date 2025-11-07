export const swaggerSpec = {
  openapi: '3.0.0',
  info: {
    title: 'Avenia API',
    version: '2.0.0',
    description: 'Avenia AI Chat Application Backend API - Complete Documentation',
    contact: {
      name: 'Avenia Team',
      email: 'support@aveniaichat.com',
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
      url: 'http://localhost:4000',
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
          avatar: {
            type: 'string',
            example: 'https://example.com/avatar.jpg',
          },
          isEmailVerified: {
            type: 'boolean',
            example: true,
          },
          createdAt: {
            type: 'string',
            format: 'date-time',
            example: '2024-01-01T00:00:00.000Z',
          },
          lastLoginAt: {
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
              firebaseCustomToken: {
                type: 'string',
                description: 'Firebase custom auth token for client-side synchronization',
                example: 'eyJhbGciOiJSUzI1NiIsImtpZCI6IjEyMyJ9...',
              },
            },
          },
        },
      },
      Notification: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            example: 'New Message',
          },
          body: {
            type: 'string',
            example: 'You have a new message',
          },
          data: {
            type: 'object',
            additionalProperties: true,
          },
          sound: {
            type: 'string',
            example: 'default',
          },
          badge: {
            type: 'number',
            example: 1,
          },
        },
      },
    },
  },
  paths: {
    // ==================== HEALTH CHECK ====================
    '/health': {
      get: {
        summary: 'Health check',
        description: 'Check if the server is running and healthy',
        tags: ['System'],
        responses: {
          200: { 
            description: 'Server is healthy',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    ok: { type: 'boolean', example: true },
                    timestamp: { type: 'string', format: 'date-time' },
                    version: { type: 'string', example: '1.0.0' }
                  }
                }
              }
            }
          },
        },
      },
    },

    // ==================== AUTHENTICATION ====================
    '/api/v1/auth/register': {
      post: {
        summary: 'Register new user',
        description: 'Create a new user account with email and password',
        tags: ['Authentication'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  email: { type: 'string', format: 'email', example: 'user@example.com' },
                  password: { type: 'string', minLength: 8, example: 'password123' },
                  name: { type: 'string', example: 'John Doe' },
                  deviceId: { type: 'string', example: 'device_123' },
                  deviceName: { type: 'string', example: 'iPhone 15' }
                },
                required: ['email', 'password', 'name', 'deviceId']
              }
            }
          }
        },
        responses: {
          201: { 
            description: 'User registered successfully',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AuthResponse' }
              }
            }
          },
          400: { description: 'Invalid request data' },
          409: { description: 'User already exists' }
        }
      }
    },

    '/api/v1/auth/login': {
      post: {
        summary: 'Login user',
        description: 'Authenticate user with email and password',
        tags: ['Authentication'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  email: { type: 'string', format: 'email', example: 'user@example.com' },
                  password: { type: 'string', example: 'password123' },
                  deviceId: { type: 'string', example: 'device_123' },
                  deviceName: { type: 'string', example: 'iPhone 15' }
                },
                required: ['email', 'password', 'deviceId']
              }
            }
          }
        },
        responses: {
          200: { 
            description: 'Login successful',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AuthResponse' }
              }
            }
          },
          401: { description: 'Invalid credentials' },
          400: { description: 'Invalid request data' }
        }
      }
    },

    '/api/v1/auth/refresh': {
      post: {
        summary: 'Refresh access token',
        description: 'Get new access token using refresh token',
        tags: ['Authentication'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  refreshToken: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
                  deviceId: { type: 'string', example: 'device_123' }
                },
                required: ['refreshToken', 'deviceId']
              }
            }
          }
        },
        responses: {
          200: { 
            description: 'Token refreshed successfully',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AuthResponse' }
              }
            }
          },
          401: { description: 'Invalid refresh token' }
        }
      }
    },

    '/api/v1/auth/logout': {
      post: {
        summary: 'Logout user',
        description: 'Revoke refresh token for current device',
        tags: ['Authentication'],
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  deviceId: { type: 'string', example: 'device_123' }
                },
                required: ['deviceId']
              }
            }
          }
        },
        responses: {
          200: { description: 'Logout successful' },
          401: { description: 'Unauthorized' }
        }
      }
    },

    '/api/v1/auth/logout-all': {
      post: {
        summary: 'Logout from all devices',
        description: 'Revoke all refresh tokens for the user',
        tags: ['Authentication'],
        security: [{ BearerAuth: [] }],
        responses: {
          200: { description: 'Logout from all devices successful' },
          401: { description: 'Unauthorized' }
        }
      }
    },

    '/api/v1/auth/me': {
      get: {
        summary: 'Get current user',
        description: 'Get information about the currently authenticated user',
        tags: ['Authentication'],
        security: [{ BearerAuth: [] }],
        responses: {
          200: { 
            description: 'User information retrieved successfully',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/User' }
              }
            }
          },
          401: { description: 'Unauthorized' }
        }
      }
    },

    // ==================== EMAIL OTP ====================
    '/api/v1/auth/email/start': {
      post: {
        summary: 'Request OTP code',
        description: 'Send OTP verification code to email',
        tags: ['Email OTP'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  email: { type: 'string', format: 'email', example: 'user@example.com' }
                },
                required: ['email']
              }
            }
          }
        },
        responses: {
          200: { description: 'OTP sent successfully' },
          400: { description: 'Invalid email' },
          429: { description: 'Rate limited' }
        }
      }
    },

    '/api/v1/auth/email/verify': {
      post: {
        summary: 'Verify OTP and login',
        description: 'Verify OTP code and complete authentication',
        tags: ['Email OTP'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  email: { type: 'string', format: 'email', example: 'user@example.com' },
                  otp: { type: 'string', example: '123456' },
                  deviceId: { type: 'string', example: 'device_123' },
                  deviceName: { type: 'string', example: 'iPhone 15' }
                },
                required: ['email', 'otp', 'deviceId']
              }
            }
          }
        },
        responses: {
          200: { 
            description: 'OTP verified and login successful',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AuthResponse' }
              }
            }
          },
          400: { description: 'Invalid OTP or request' }
        }
      }
    },

    // ==================== GOOGLE AUTH ====================
    '/api/v1/auth/google/start': {
      post: {
        summary: 'Start Google authentication',
        description: 'Initiate Google OAuth flow',
        tags: ['Google Auth'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  deviceId: { type: 'string', example: 'device_123' },
                  deviceName: { type: 'string', example: 'iPhone 15' }
                },
                required: ['deviceId']
              }
            }
          }
        },
        responses: {
          200: { 
            description: 'Google auth URL generated',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    authUrl: { type: 'string', example: 'https://accounts.google.com/oauth/authorize?...' },
                    sessionId: { type: 'string', example: 'google_session_123' }
                  }
                }
              }
            }
          }
        }
      }
    },

    '/api/v1/auth/google/status/{id}': {
      get: {
        summary: 'Check Google auth status',
        description: 'Check if Google authentication is completed',
        tags: ['Google Auth'],
        parameters: [
          {
            in: 'path',
            name: 'id',
            required: true,
            schema: { type: 'string' },
            description: 'Session ID from start request'
          }
        ],
        responses: {
          200: { 
            description: 'Auth status retrieved',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    ready: { type: 'boolean', example: true },
                    result: { $ref: '#/components/schemas/AuthResponse' }
                  }
                }
              }
            }
          }
        }
      }
    },

    '/api/v1/auth/google/callback': {
      get: {
        summary: 'Google OAuth callback',
        description: 'Handle Google OAuth callback',
        tags: ['Google Auth'],
        parameters: [
          {
            in: 'query',
            name: 'code',
            schema: { type: 'string' },
            description: 'Authorization code from Google'
          },
          {
            in: 'query',
            name: 'state',
            schema: { type: 'string' },
            description: 'State parameter for security'
          }
        ],
        responses: {
          200: { description: 'Google auth completed' },
          400: { description: 'Invalid callback parameters' }
        }
      }
    },

    // ==================== APPLE AUTH ====================
    '/api/v1/auth/apple/start': {
      post: {
        summary: 'Start Apple authentication',
        description: 'Initiate Apple Sign-In flow',
        tags: ['Apple Auth'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  deviceId: { type: 'string', example: 'device_123' },
                  deviceName: { type: 'string', example: 'iPhone 15' }
                },
                required: ['deviceId']
              }
            }
          }
        },
        responses: {
          200: { 
            description: 'Apple auth URL generated',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    authUrl: { type: 'string', example: 'https://appleid.apple.com/auth/authorize?...' },
                    sessionId: { type: 'string', example: 'apple_session_123' }
                  }
                }
              }
            }
          }
        }
      }
    },

    '/api/v1/auth/apple/status/{id}': {
      get: {
        summary: 'Check Apple auth status',
        description: 'Check if Apple authentication is completed',
        tags: ['Apple Auth'],
        parameters: [
          {
            in: 'path',
            name: 'id',
            required: true,
            schema: { type: 'string' },
            description: 'Session ID from start request'
          }
        ],
        responses: {
          200: { 
            description: 'Auth status retrieved',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    ready: { type: 'boolean', example: true },
                    result: { $ref: '#/components/schemas/AuthResponse' }
                  }
                }
              }
            }
          }
        }
      }
    },

    '/api/v1/auth/apple/callback': {
      post: {
        summary: 'Apple Sign-In callback',
        description: 'Handle Apple Sign-In callback',
        tags: ['Apple Auth'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  code: { type: 'string', description: 'Authorization code from Apple' },
                  state: { type: 'string', description: 'State parameter for security' },
                  idToken: { type: 'string', description: 'ID token from Apple' }
                },
                required: ['code', 'state']
              }
            }
          }
        },
        responses: {
          200: { description: 'Apple auth completed' },
          400: { description: 'Invalid callback parameters' }
        }
      }
    },

    // ==================== PASSWORD RESET ====================
    '/api/v1/auth/password-reset/request': {
      post: {
        summary: 'Request password reset',
        description: 'Send password reset email to user',
        tags: ['Password Reset'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  email: { type: 'string', format: 'email', example: 'user@example.com' }
                },
                required: ['email']
              }
            }
          }
        },
        responses: {
          200: { description: 'Password reset email sent' },
          400: { description: 'Invalid email' },
          404: { description: 'User not found' }
        }
      }
    },

    '/api/v1/auth/password-reset/confirm': {
      post: {
        summary: 'Confirm password reset',
        description: 'Reset password using token from email',
        tags: ['Password Reset'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  token: { type: 'string', example: 'reset_token_123' },
                  newPassword: { type: 'string', minLength: 8, example: 'newpassword123' }
                },
                required: ['token', 'newPassword']
              }
            }
          }
        },
        responses: {
          200: { description: 'Password reset successful' },
          400: { description: 'Invalid token or password' },
          401: { description: 'Token expired' }
        }
      }
    },

    // ==================== PDF READ ====================













    '/api/v1/pdfread/health': {
      get: {
        summary: 'PDF Read service health check',
        description: 'Check if PDF Read service is available',
        tags: ['PDF Read'],
        responses: {
          200: { 
            description: 'Service is healthy',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        status: { type: 'string', example: 'healthy' },
                        timestamp: { type: 'string', format: 'date-time' }
                      }
                    }
                  }
                }
              }
            }
          },
          503: { description: 'Service unavailable' }
        }
      }
    },

    // ==================== NOTIFICATIONS ====================
    '/api/v1/notifications/tokens': {
      post: {
        summary: 'Save push notification token',
        description: 'Save user\'s push notification token for device',
        tags: ['Notifications'],
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  expoPushToken: { type: 'string', example: 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]' },
                  deviceId: { type: 'string', example: 'device_123' },
                  platform: { type: 'string', enum: ['ios', 'android', 'web'], example: 'ios' }
                },
                required: ['expoPushToken', 'deviceId', 'platform']
              }
            }
          }
        },
        responses: {
          200: { description: 'Token saved successfully' },
          401: { description: 'Unauthorized' },
          400: { description: 'Invalid request data' }
        }
      }
    },

    '/api/v1/notifications/tokens/{deviceId}': {
      delete: {
        summary: 'Remove push notification token',
        description: 'Remove push notification token for specific device',
        tags: ['Notifications'],
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            in: 'path',
            name: 'deviceId',
            required: true,
            schema: { type: 'string' },
            description: 'Device ID to remove token for'
          }
        ],
        responses: {
          200: { description: 'Token removed successfully' },
          401: { description: 'Unauthorized' },
          404: { description: 'Token not found' }
        }
      }
    },

    '/api/v1/notifications/send': {
      post: {
        summary: 'Send notification',
        description: 'Send push notification to specific users',
        tags: ['Notifications'],
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  userIds: { 
                    type: 'array', 
                    items: { type: 'string' },
                    description: 'Array of user IDs to send notification to'
                  },
                  title: { type: 'string', example: 'New Message' },
                  body: { type: 'string', example: 'You have a new message' },
                  data: { 
                    type: 'object', 
                    additionalProperties: true,
                    description: 'Additional data to send with notification'
                  },
                  sound: { type: 'string', example: 'default' },
                  badge: { type: 'number', example: 1 },
                  priority: { type: 'string', enum: ['default', 'normal', 'high'], example: 'normal' },
                  channelId: { type: 'string', example: 'messages' },
                  category: { type: 'string', example: 'message' }
                },
                required: ['title', 'body']
              }
            }
          }
        },
        responses: {
          200: { description: 'Notification sent successfully' },
          401: { description: 'Unauthorized' },
          400: { description: 'Invalid request data' }
        }
      }
    },

    '/api/v1/notifications/send/bulk': {
      post: {
        summary: 'Send bulk notification',
        description: 'Send push notification to multiple devices using tokens',
        tags: ['Notifications'],
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  expoPushTokens: { 
                    type: 'array', 
                    items: { type: 'string' },
                    description: 'Array of Expo push tokens'
                  },
                  title: { type: 'string', example: 'Bulk Notification' },
                  body: { type: 'string', example: 'This is a bulk notification' },
                  data: { 
                    type: 'object', 
                    additionalProperties: true,
                    description: 'Additional data to send with notification'
                  }
                },
                required: ['expoPushTokens', 'title', 'body']
              }
            }
          }
        },
        responses: {
          200: { description: 'Bulk notification sent successfully' },
          401: { description: 'Unauthorized' },
          400: { description: 'Invalid request data' }
        }
      }
    },

    '/api/v1/notifications/stats': {
      get: {
        summary: 'Get notification statistics',
        description: 'Get notification delivery and engagement statistics',
        tags: ['Notifications'],
        security: [{ BearerAuth: [] }],
        responses: {
          200: { 
            description: 'Statistics retrieved successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        totalSent: { type: 'number', example: 1500 },
                        totalDelivered: { type: 'number', example: 1450 },
                        totalOpened: { type: 'number', example: 1200 },
                        deliveryRate: { type: 'number', example: 0.967 },
                        openRate: { type: 'number', example: 0.827 }
                      }
                    }
                  }
                }
              }
            }
          },
          401: { description: 'Unauthorized' }
        }
      }
    },

    // ==================== PRESENTATION ====================
  },
  tags: [
    { name: 'System', description: 'System health and status endpoints' },
    { name: 'Authentication', description: 'User authentication and authorization' },
    { name: 'Email OTP', description: 'Email-based OTP authentication' },
    { name: 'Google Auth', description: 'Google OAuth authentication' },
    { name: 'Apple Auth', description: 'Apple Sign-In authentication' },
    { name: 'Password Reset', description: 'Password reset functionality' },
    { name: 'PDF Read', description: 'PDF processing and AI analysis' },
    { name: 'Notifications', description: 'Push notification management' }
  ]
} as const;