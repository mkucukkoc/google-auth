import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

/**
 * Validation middleware factory
 */
export const validate = (schema: z.ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: 'validation_error',
          message: 'Invalid request data',
          details: error.issues.map((err: any) => ({
            field: err.path.join('.'),
            message: err.message,
          })),
        });
        return;
      }
      
      res.status(400).json({
        error: 'validation_error',
        message: 'Invalid request data',
      });
    }
  };
};

/**
 * Validation schemas for auth endpoints
 */
export const authSchemas = {
  register: z.object({
    email: z.string().email('Invalid email format'),
    password: z.string().min(8, 'Password must be at least 8 characters')
      .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'Password must contain at least one lowercase letter, one uppercase letter, and one number'),
    device: z.object({
      os: z.string().optional(),
      model: z.string().optional(),
      appVersion: z.string().optional(),
      platform: z.string().optional(),
    }),
    deviceId: z.string().optional(),
    name: z.string().min(1, 'Name is required').max(100, 'Name too long').optional(),
  }),

  login: z.object({
    email: z.string().email('Invalid email format'),
    password: z.string().min(1, 'Password is required'),
    device: z.object({
      os: z.string().optional(),
      model: z.string().optional(),
      appVersion: z.string().optional(),
      platform: z.string().optional(),
    }),
    deviceId: z.string().optional(),
  }),

  refresh: z.object({
    refreshToken: z.string().min(1, 'Refresh token is required'),
    sessionId: z.string().uuid('Invalid session ID format'),
    deviceId: z.string().optional(),
  }),

  logout: z.object({
    sessionId: z.string().uuid('Invalid session ID format'),
  }),

  passwordReset: z.object({
    email: z.string().email('Invalid email format'),
  }),

  passwordResetConfirm: z.object({
    token: z.string().min(1, 'Reset token is required'),
    password: z.string().min(8, 'Password must be at least 8 characters')
      .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'Password must contain at least one lowercase letter, one uppercase letter, and one number'),
  }),

  // 2FA schemas (for future implementation)
  enable2FA: z.object({
    method: z.enum(['totp', 'sms']),
    phoneNumber: z.string().optional(),
  }),

  verify2FA: z.object({
    code: z.string().min(6, '2FA code must be at least 6 characters'),
    backupCode: z.string().optional(),
  }),
};

/**
 * Query parameter validation
 */
export const validateQuery = (schema: z.ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      schema.parse(req.query);
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: 'validation_error',
          message: 'Invalid query parameters',
          details: error.issues.map((err: any) => ({
            field: err.path.join('.'),
            message: err.message,
          })),
        });
        return;
      }
      
      res.status(400).json({
        error: 'validation_error',
        message: 'Invalid query parameters',
      });
    }
  };
};

/**
 * Params validation
 */
export const validateParams = (schema: z.ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      schema.parse(req.params);
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: 'validation_error',
          message: 'Invalid URL parameters',
          details: error.issues.map((err: any) => ({
            field: err.path.join('.'),
            message: err.message,
          })),
        });
        return;
      }
      
      res.status(400).json({
        error: 'validation_error',
        message: 'Invalid URL parameters',
      });
    }
  };
};
