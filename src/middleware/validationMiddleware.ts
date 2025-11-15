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
    user_id: z.string().optional(),
    chat_id: z.string().optional(),
  }),

  generateDoc: z.object({
    prompt: z.string().min(1, 'Prompt is required').max(5000, 'Prompt too long'),
  }),

  generateDocAdvanced: z.object({
    prompt: z.string().min(1, 'Prompt is required').max(5000, 'Prompt too long'),
    language: z.enum(['tr', 'en']).optional(),
    title: z.string().max(200, 'Title too long').optional(),
    page_goal: z.number().int().min(1, 'Page goal must be at least 1').max(200, 'Page goal too large').optional(),
    include_cover: z.boolean().optional(),
    include_toc: z.boolean().optional(),
    header_text: z.string().max(500, 'Header text too long').optional(),
    footer_text: z.string().max(500, 'Footer text too long').optional(),
    page_numbers: z.boolean().optional(),
    paper_size: z.string().max(50, 'Paper size too long').optional(),
    orientation: z.enum(['portrait', 'landscape']).optional(),
    margins_mm: z.object({
      top: z.number().min(0, 'Margin must be positive').optional(),
      bottom: z.number().min(0, 'Margin must be positive').optional(),
      left: z.number().min(0, 'Margin must be positive').optional(),
      right: z.number().min(0, 'Margin must be positive').optional(),
    }).partial().optional(),
    font: z.string().max(100, 'Font too long').optional(),
    font_size_pt: z.number().min(1, 'Font size must be at least 1').max(72, 'Font size too large').optional(),
    line_spacing: z.number().min(0.5, 'Line spacing too small').max(3, 'Line spacing too large').optional(),
    outline: z.array(z.string().min(1, 'Outline item cannot be empty')).max(100, 'Too many outline items').optional(),
    references: z.array(z.string().min(1, 'Reference cannot be empty')).max(100, 'Too many references').optional(),
    reference_style: z.string().max(100, 'Reference style too long').optional(),
    watermark_text: z.string().max(200, 'Watermark text too long').optional(),
  }).passthrough(),

  generatePPTAdvanced: z.object({
    prompt: z.string().min(1, 'Prompt is required').max(5000, 'Prompt too long'),
    language: z.enum(['tr', 'en']).optional(),
    audience: z.string().max(200, 'Audience description too long').optional(),
    purpose: z.string().max(200, 'Purpose description too long').optional(),
    title: z.string().max(200, 'Title too long').optional(),
    outline: z.array(z.string().min(1, 'Outline item cannot be empty')).max(100, 'Too many outline items').optional(),
    slide_goal: z.number().int().min(1, 'Slide goal must be at least 1').max(200, 'Slide goal too large').optional(),
    charts_allowed: z.boolean().optional(),
    image_policy: z.enum(['generate', 'none']).optional(),
    image_style: z.string().max(300, 'Image style too long').optional(),
    speaker_notes: z.boolean().optional(),
    aspect_ratio: z.enum(['16:9', '4:3']).optional(),
    include_cover: z.boolean().optional(),
    include_agenda: z.boolean().optional(),
    include_summary: z.boolean().optional(),
    include_qna: z.boolean().optional(),
    include_closing: z.boolean().optional(),
    slide_numbers: z.boolean().optional(),
    header_text: z.string().max(200, 'Header text too long').optional(),
    footer_text: z.string().max(200, 'Footer text too long').optional(),
    logo_url: z.string().url('Logo URL must be valid').optional(),
    theme: z.object({
      mode: z.enum(['light', 'dark']).optional(),
      primary: z.string().optional(),
      secondary: z.string().optional(),
      accent: z.string().optional(),
      title_font: z.string().optional(),
      body_font: z.string().optional(),
    }).partial().optional(),
    brand_kit: z.object({
      primary: z.string().optional(),
      secondary: z.string().optional(),
      accent: z.string().optional(),
      title_font: z.string().optional(),
      body_font: z.string().optional(),
      logo_url: z.string().url('Logo URL must be valid').optional(),
    }).partial().optional(),
    references: z.array(z.string().min(1, 'Reference cannot be empty')).max(100, 'Too many references').optional(),
  }).passthrough(),

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
    user_id: z.string().optional(),
    chat_id: z.string().optional(),
  }),

  audioIsolation: z.object({
    audioBase64: z.string().min(1, 'Audio base64 is required'),
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
 * Validation schemas for PDF summary endpoints
 */
export const pdfSummarySchemas = {
  summarize: z.object({
    fileUrl: z.string().url('Geçerli bir dosya URL\'si giriniz'),
    chatId: z.string().uuid('Geçerli bir chat ID giriniz'),
  }),
};

const deleteReasonEnum = z.enum(['security', 'dissatisfied', 'not_using', 'switching_service', 'other']);
const deviceInfoSchema = z.object({
  os: z.string().optional(),
  model: z.string().optional(),
  appVersion: z.string().optional(),
  platform: z.string().optional(),
}).partial();

export const deleteAccountSchemas = {
  initiate: z.object({
    deleteReason: deleteReasonEnum,
    deleteReasonNote: z.string().max(1000, 'Açıklama en fazla 1000 karakter olabilir').optional(),
    confirmPermanentDeletion: z.boolean().refine(value => value === true, {
      message: 'Kalıcı silme onayı verilmelidir',
    }),
    gdprAcknowledged: z.boolean().refine(value => value === true, {
      message: 'GDPR/KVKK bilgilendirmesi onaylanmalıdır',
    }),
    skipDataExport: z.boolean().optional(),
    initiatedFrom: z.string().max(50).optional(),
    appVersion: z.string().max(50).optional(),
    locale: z.string().max(10).optional(),
    deviceInfo: deviceInfoSchema.optional(),
    platform: z.string().max(50).optional(),
    anonymous: z.boolean().optional(),
  }),
  dataExport: z.object({
    forceRegenerate: z.boolean().optional(),
  }),
  restore: z.object({
    confirmationCode: z.string().min(4).max(12).optional(),
    reason: z.string().max(500).optional(),
  }),
  jobParams: z.object({
    jobId: z.string().min(10, 'Geçerli bir jobId gereklidir'),
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
