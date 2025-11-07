import { Router, Request, Response } from 'express';
import multer from 'multer';
import { PDFReadService, PPTAdvancedPayload, DocAdvancedPayload } from '../services/pdfReadService';
import { PDFService } from '../services/pdfService';
import { authenticateToken, AuthRequest } from '../middleware/authMiddleware';
import { validate, pdfReadSchemas } from '../middleware/validationMiddleware';
import { authRateLimits } from '../middleware/rateLimitMiddleware';
import { auditService } from '../services/auditService';
import { logger } from '../utils/logger';

// Multer configuration for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'image/jpeg',
      'image/png',
      'image/gif',
      'text/plain',
      'video/mp4'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF, DOCX, XLSX, PPTX, images, videos, and text files are allowed.'));
    }
  }
});

export function createPDFReadExtendedRouter(): Router {
  const r = Router();

  // POST /pdfread/generate/doc
  r.post('/generate/doc',
    authRateLimits.general,
    authenticateToken,
    validate(pdfReadSchemas.generateDoc),
    async (req: Request, res: Response) => {
      const authReq = req as unknown as AuthRequest;
      try {
        const { prompt } = req.body;

        const result = await PDFReadService.generateDoc(prompt);

        // Log the action
        await auditService.logUserAction(
          authReq.user!.id,
          'pdf_generate_doc',
          {
            promptLength: prompt.length,
            success: result.success
          }
        );

        if (result.success) {
          res.json(result);
        } else {
          res.status(400).json(result);
        }
      } catch (error) {
        logger.error({ err: error, userId: authReq.user!.id, operation: 'generateDoc' }, 'Generate doc error');
        res.status(500).json({
          error: 'internal_error',
          message: 'Failed to generate Word document'
        });
      }
    }
  );

  // POST /pdfread/generate/excel
  r.post('/generate/excel',
    authRateLimits.general,
    authenticateToken,
    validate(pdfReadSchemas.generateDoc),
    async (req: Request, res: Response) => {
      const authReq = req as unknown as AuthRequest;
      try {
        const { prompt } = req.body;

        const result = await PDFReadService.generateExcel(prompt);

        // Log the action
        await auditService.logUserAction(
          authReq.user!.id,
          'pdf_generate_excel',
          {
            promptLength: prompt.length,
            success: result.success
          }
        );

        if (result.success) {
          res.json(result);
        } else {
          res.status(400).json(result);
        }
      } catch (error) {
        logger.error({ err: error, userId: authReq.user!.id, operation: 'generateExcel' }, 'Generate Excel error');
        res.status(500).json({
          error: 'internal_error',
          message: 'Failed to generate Excel document'
        });
      }
    }
  );

  // POST /pdfread/generate/ppt
  r.post('/generate/ppt',
    authRateLimits.general,
    authenticateToken,
    validate(pdfReadSchemas.generateDoc),
    async (req: Request, res: Response) => {
      const authReq = req as unknown as AuthRequest;
      try {
        const { prompt } = req.body;

        const result = await PDFReadService.generatePPT(prompt);

        // Log the action
        await auditService.logUserAction(
          authReq.user!.id,
          'pdf_generate_ppt',
          {
            promptLength: prompt.length,
            success: result.success
          }
        );

        if (result.success) {
          res.json(result);
        } else {
          res.status(400).json(result);
        }
      } catch (error) {
        logger.error({ err: error, userId: authReq.user!.id, operation: 'generatePPT' }, 'Generate PPT error');
        res.status(500).json({
          error: 'internal_error',
          message: 'Failed to generate PowerPoint document'
        });
      }
    }
  );

  // POST /pdfread/generate/doc-advanced
  r.post('/generate/doc-advanced',
    authRateLimits.general,
    authenticateToken,
    validate(pdfReadSchemas.generateDocAdvanced),
    async (req: Request, res: Response) => {
      const authReq = req as unknown as AuthRequest;
      try {
        const payload = req.body as DocAdvancedPayload;
        const { prompt } = payload;
        const promptLength = prompt?.length ?? 0;

        const result = await PDFReadService.generateDocAdvanced(payload);

        // Log the action
        await auditService.logUserAction(
          authReq.user!.id,
          'pdf_generate_doc_advanced',
          {
            promptLength,
            success: result.success
          }
        );

        if (result.success) {
          res.json(result);
        } else {
          res.status(400).json(result);
        }
      } catch (error) {
        logger.error({ err: error, userId: authReq.user!.id, operation: 'generateDocAdvanced' }, 'Generate advanced doc error');
        res.status(500).json({
          error: 'internal_error',
          message: 'Failed to generate advanced Word document'
        });
      }
    }
  );

  // POST /pdfread/generate/ppt-advanced
  r.post('/generate/ppt-advanced',
    authRateLimits.general,
    authenticateToken,
    validate(pdfReadSchemas.generatePPTAdvanced),
    async (req: Request, res: Response) => {
      const authReq = req as unknown as AuthRequest;
      try {
        const payload = req.body as PPTAdvancedPayload;
        const { prompt } = payload;
        const promptLength = prompt?.length ?? 0;

        const result = await PDFReadService.generatePPTAdvanced(payload);

        // Log the action
        await auditService.logUserAction(
          authReq.user!.id,
          'pdf_generate_ppt_advanced',
          {
            promptLength,
            success: result.success
          }
        );

        if (result.success) {
          res.json(result);
        } else {
          res.status(400).json(result);
        }
      } catch (error) {
        logger.error({ err: error, userId: authReq.user!.id, operation: 'generatePPTAdvanced' }, 'Generate advanced PPT error');
        res.status(500).json({
          error: 'internal_error',
          message: 'Failed to generate advanced PowerPoint document'
        });
      }
    }
  );

  // POST /pdfread/speech-to-text
  r.post('/speech-to-text',
    authRateLimits.general,
    authenticateToken,
    validate(pdfReadSchemas.speechToText),
    async (req: Request, res: Response) => {
      const authReq = req as unknown as AuthRequest;
      try {
        const { audioBase64 } = req.body;

        const result = await PDFReadService.speechToText(audioBase64);

        // Log the action
        await auditService.logUserAction(
          authReq.user!.id,
          'pdf_speech_to_text',
          {
            audioSize: audioBase64.length,
            success: result.success
          }
        );

        if (result.success) {
          res.json(result);
        } else {
          res.status(400).json(result);
        }
      } catch (error) {
        logger.error({ err: error, userId: authReq.user!.id, operation: 'speechToText' }, 'Speech to text error');
        res.status(500).json({
          error: 'internal_error',
          message: 'Failed to convert speech to text'
        });
      }
    }
  );

  // POST /pdfread/text-to-speech
  r.post('/text-to-speech',
    authRateLimits.general,
    authenticateToken,
    validate(pdfReadSchemas.textToSpeech),
    async (req: Request, res: Response) => {
      const authReq = req as unknown as AuthRequest;
      try {
        const { messages } = req.body;

        const result = await PDFReadService.textToSpeech(messages);

        // Log the action
        await auditService.logUserAction(
          authReq.user!.id,
          'pdf_text_to_speech',
          {
            messageCount: messages.length,
            success: result.success
          }
        );

        if (result.success) {
          res.json(result);
        } else {
          res.status(400).json(result);
        }
      } catch (error) {
        logger.error({ err: error, userId: authReq.user!.id, operation: 'textToSpeech' }, 'Text to speech error');
        res.status(500).json({
          error: 'internal_error',
          message: 'Failed to convert text to speech'
        });
      }
    }
  );

  // removed: /pdfread/analyze-image (now handled by pdf-read service)

  // removed: /pdfread/analyze-video (now handled by pdf-read service)

  // POST /pdfread/generate-video
  r.post('/generate-video',
    authRateLimits.general,
    authenticateToken,
    validate(pdfReadSchemas.generateDoc),
    async (req: Request, res: Response) => {
      const authReq = req as unknown as AuthRequest;
      try {
        const { prompt } = req.body;

        const result = await PDFReadService.generateVideo(prompt);

        // Log the action
        await auditService.logUserAction(
          authReq.user!.id,
          'pdf_generate_video',
          {
            promptLength: prompt.length,
            success: result.success
          }
        );

        if (result.success) {
          res.json(result);
        } else {
          res.status(400).json(result);
        }
      } catch (error) {
        logger.error({ err: error, userId: authReq.user!.id, operation: 'generateVideo' }, 'Generate video error');
        res.status(500).json({
          error: 'internal_error',
          message: 'Failed to generate video'
        });
      }
    }
  );

  // POST /pdfread/generate-video-prompt
  r.post('/generate-video-prompt',
    authRateLimits.general,
    authenticateToken,
    validate(pdfReadSchemas.generateDoc),
    async (req: Request, res: Response) => {
      const authReq = req as unknown as AuthRequest;
      try {
        const { prompt } = req.body;

        const result = await PDFReadService.generateVideoPrompt(prompt);

        // Log the action
        await auditService.logUserAction(
          authReq.user!.id,
          'pdf_generate_video_prompt',
          {
            promptLength: prompt.length,
            success: result.success
          }
        );

        if (result.success) {
          res.json(result);
        } else {
          res.status(400).json(result);
        }
      } catch (error) {
        logger.error({ err: error, userId: authReq.user!.id, operation: 'generateVideoPrompt' }, 'Generate video prompt error');
        res.status(500).json({
          error: 'internal_error',
          message: 'Failed to generate video prompt'
        });
      }
    }
  );

  // removed: /pdfread/ask-with-embeddings (now handled by pdf-read service)

  // removed: /pdfread/search-docs (now handled by pdf-read service)

  // removed: /pdfread/summarize-pdf-url (now handled by pdf-read service)

  // POST /pdfread/summarize/word-url & /pdfread/summarize-word-url
  // removed: /pdfread/summarize-word-url

  // POST /pdfread/summarize/excel-url & /pdfread/summarize-excel-url
  // removed: /pdfread/summarize-excel-url

  // POST /pdfread/summarize/ppt-url & /pdfread/summarize-ppt-url
  // removed: /pdfread/summarize-ppt-url

  // POST /pdfread/summarize/html-url & /pdfread/summarize-html-url
  // removed: /pdfread/summarize-html-url

  // POST /pdfread/summarize/json-url & /pdfread/summarize-json-url
  // removed: /pdfread/summarize-json-url

  // POST /pdfread/summarize/csv-url & /pdfread/summarize-csv-url
  // removed: /pdfread/summarize-csv-url

  // POST /pdfread/summarize/txt-url & /pdfread/summarize-txt-url
  // removed: /pdfread/summarize-txt-url

  // removed: /pdfread/ask-question (legacy)

  // POST /pdfread/export-chat
  r.post('/export-chat',
    authRateLimits.general,
    authenticateToken,
    validate(pdfReadSchemas.exportChat),
    async (req: Request, res: Response) => {
      const authReq = req as unknown as AuthRequest;
      try {
        const { chatId, format } = req.body;

        const result = await PDFReadService.exportChat(chatId, format);

        // Log the action
        await auditService.logUserAction(
          authReq.user!.id,
          'pdf_export_chat',
          {
            chatId,
            format,
            success: result.success
          }
        );

        if (result.success) {
          res.json(result);
        } else {
          res.status(400).json(result);
        }
      } catch (error) {
        logger.error({ err: error, userId: authReq.user!.id, operation: 'exportChat' }, 'Export chat error');
        res.status(500).json({
          error: 'internal_error',
          message: 'Failed to export chat'
        });
      }
    }
  );

  // removed: /pdfread/audio-isolation

  // removed: /pdfread/health

  return r;
}
