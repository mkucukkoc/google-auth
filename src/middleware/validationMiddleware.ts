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
 * Validation schemas for PDFRead endpoints
 */
export const pdfReadSchemas = {
  askQuestion: z.object({
    pdfText: z.string().min(1, 'PDF text is required').max(100000, 'PDF text too long'),
    question: z.string().min(1, 'Question is required').max(1000, 'Question too long'),
  }),

  analyzeImage: z.object({
    imageBase64: z.string().min(1, 'Image base64 is required'),
  }),

  generateDoc: z.object({
    prompt: z.string().min(1, 'Prompt is required').max(5000, 'Prompt too long'),
  }),

  speechToText: z.object({
    audioBase64: z.string().min(1, 'Audio base64 is required'),
  }),

  textToSpeech: z.object({
    messages: z.array(z.object({
      role: z.string(),
      content: z.string()
    })).min(1, 'At least one message is required'),
  }),

  analyzeVideo: z.object({
    videoBase64: z.string().min(1, 'Video base64 is required'),
  }),

  askWithEmbeddings: z.object({
    question: z.string().min(1, 'Question is required').max(1000, 'Question too long'),
    chatId: z.string().min(1, 'Chat ID is required'),
  }),

  searchDocs: z.object({
    query: z.string().min(1, 'Query is required').max(500, 'Query too long'),
    chatId: z.string().min(1, 'Chat ID is required'),
  }),

  summarizeUrl: z.object({
    url: z.string().url('Invalid URL format'),
  }),

  exportChat: z.object({
    chatId: z.string().min(1, 'Chat ID is required'),
    format: z.string().optional().default('pdf'),
  }),
};

/**
 * Validation schemas for chat endpoints
 */
export const chatSchemas = {
  sendMessage: z.object({
    messages: z.array(z.object({
      role: z.enum(['user', 'assistant', 'system']),
      content: z.string().min(1, 'Message content is required'),
      timestamp: z.any().optional(),
      fileName: z.string().optional(),
      fileUrl: z.string().optional(),
    })).min(1, 'At least one message is required'),
    chatId: z.string().min(1, 'Chat ID is required'),
    hasImage: z.boolean().optional().default(false),
    imageFileUrl: z.string().optional(),
  }),
  
  textToSpeech: z.object({
    messages: z.array(z.object({
      role: z.enum(['user', 'assistant', 'system']),
      content: z.string().min(1, 'Message content is required'),
      timestamp: z.any().optional(),
      fileName: z.string().optional(),
      fileUrl: z.string().optional(),
    })).min(1, 'At least one message is required'),
  }),
  
  createChat: z.object({
    title: z.string().optional(),
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
