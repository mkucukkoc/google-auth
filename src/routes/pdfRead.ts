import { Router, Request, Response } from 'express';
import multer from 'multer';
import { PDFReadService } from '../services/pdfReadService';
import { authenticateToken, AuthRequest } from '../middleware/authMiddleware';
import { validate, pdfReadSchemas } from '../middleware/validationMiddleware';
import { authRateLimits } from '../middleware/rateLimitMiddleware';
import { auditService } from '../services/auditService';
import { logger } from '../utils/logger';
import { attachRouteLogger } from '../utils/routeLogger';

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
      'text/plain'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF, DOCX, XLSX, PPTX, images, and text files are allowed.'));
    }
  }
});

export function createPDFReadRouter(): Router {
  const r = Router();
  attachRouteLogger(r, 'pdfRead');

  // removed: /pdfread/summarize (handled by pdf-read service)

  // removed: /pdfread/ask-question (handled by pdf-read service)

  // POST /pdfread/detect-ai
  r.post('/detect-ai',
    authRateLimits.general,
    authenticateToken,
    upload.single('file'),
    async (req: Request, res: Response) => {
      const authReq = req as unknown as AuthRequest;
      try {
        logPdfRoute('detect_ai_request_received', {
          userId: authReq.user?.id,
          hasFile: !!req.file,
          fileName: req.file?.originalname,
        });
        if (!req.file) {
          logPdfRoute('detect_ai_missing_file', { userId: authReq.user?.id });
          return res.status(400).json({
            error: 'no_file',
            message: 'No file uploaded'
          });
        }

        const result = await PDFReadService.detectAIDocument(
          req.file.buffer,
          req.file.originalname,
          req.file.mimetype
        );
        logPdfRoute('detect_ai_service_result', { userId: authReq.user?.id, success: result.success });

        // Log the action
        await auditService.logUserAction(
          authReq.user!.id,
          'pdf_detect_ai',
          {
            fileName: req.file.originalname,
            fileSize: req.file.size,
            mimeType: req.file.mimetype,
            success: result.success
          }
        );

        if (result.success) {
          logPdfRoute('detect_ai_success_response', { userId: authReq.user?.id });
          res.json(result);
        } else {
          logPdfRoute('detect_ai_failed_response', { userId: authReq.user?.id });
          res.status(400).json(result);
        }
      } catch (error) {
        logPdfRoute('detect_ai_error', { userId: authReq.user?.id, error: (error as Error)?.message });
        logger.error({ err: error, userId: authReq.user!.id, operation: 'aiDetection' }, 'AI detection error');
        res.status(500).json({
          error: 'internal_error',
          message: 'Failed to detect AI document'
        });
      }
    }
  );

  // removed: /pdfread/analyze-image (handled by pdf-read service)

  // POST /pdfread/convert/pdf-to-word
  r.post('/convert/pdf-to-word',
    authRateLimits.general,
    authenticateToken,
    upload.single('file'),
    async (req: Request, res: Response) => {
      const authReq = req as unknown as AuthRequest;
      try {
        logPdfRoute('pdf_to_word_request_received', {
          userId: authReq.user?.id,
          hasFile: !!req.file,
          fileName: req.file?.originalname,
          mimeType: req.file?.mimetype,
        });
        if (!req.file) {
          logPdfRoute('pdf_to_word_missing_file', { userId: authReq.user?.id });
          return res.status(400).json({
            error: 'no_file',
            message: 'No file uploaded'
          });
        }

        if (req.file.mimetype !== 'application/pdf') {
          logPdfRoute('pdf_to_word_invalid_mime', { userId: authReq.user?.id, mimeType: req.file.mimetype });
          return res.status(400).json({
            error: 'invalid_file_type',
            message: 'Only PDF files are allowed for this conversion'
          });
        }

        const result = await PDFReadService.pdfToWord(
          req.file.buffer,
          req.file.originalname
        );
        logPdfRoute('pdf_to_word_service_result', { userId: authReq.user?.id, success: result.success });

        // Log the action
        await auditService.logUserAction(
          authReq.user!.id,
          'pdf_convert_word',
          {
            fileName: req.file.originalname,
            fileSize: req.file.size,
            success: result.success
          }
        );

        if (result.success) {
          logPdfRoute('pdf_to_word_success_response', { userId: authReq.user?.id });
          res.json(result);
        } else {
          logPdfRoute('pdf_to_word_failed_response', { userId: authReq.user?.id });
          res.status(400).json(result);
        }
      } catch (error) {
        logPdfRoute('pdf_to_word_error', { userId: authReq.user?.id, error: (error as Error)?.message });
        logger.error({ err: error, userId: authReq.user!.id, operation: 'pdfToWord' }, 'PDF to Word error');
        res.status(500).json({
          error: 'internal_error',
          message: 'Failed to convert PDF to Word'
        });
      }
    }
  );

  // POST /pdfread/convert/pdf-to-excel
  r.post('/convert/pdf-to-excel',
    authRateLimits.general,
    authenticateToken,
    upload.single('file'),
    async (req: Request, res: Response) => {
      const authReq = req as unknown as AuthRequest;
      try {
        logPdfRoute('pdf_to_excel_request_received', {
          userId: authReq.user?.id,
          hasFile: !!req.file,
          fileName: req.file?.originalname,
          mimeType: req.file?.mimetype,
        });
        if (!req.file) {
          logPdfRoute('pdf_to_excel_missing_file', { userId: authReq.user?.id });
          return res.status(400).json({
            error: 'no_file',
            message: 'No file uploaded'
          });
        }

        if (req.file.mimetype !== 'application/pdf') {
          logPdfRoute('pdf_to_excel_invalid_mime', { userId: authReq.user?.id, mimeType: req.file.mimetype });
          return res.status(400).json({
            error: 'invalid_file_type',
            message: 'Only PDF files are allowed for this conversion'
          });
        }

        const result = await PDFReadService.pdfToExcel(
          req.file.buffer,
          req.file.originalname
        );
        logPdfRoute('pdf_to_excel_service_result', { userId: authReq.user?.id, success: result.success });

        // Log the action
        await auditService.logUserAction(
          authReq.user!.id,
          'pdf_convert_excel',
          {
            fileName: req.file.originalname,
            fileSize: req.file.size,
            success: result.success
          }
        );

        if (result.success) {
          logPdfRoute('pdf_to_excel_success_response', { userId: authReq.user?.id });
          res.json(result);
        } else {
          logPdfRoute('pdf_to_excel_failed_response', { userId: authReq.user?.id });
          res.status(400).json(result);
        }
      } catch (error) {
        logPdfRoute('pdf_to_excel_error', { userId: authReq.user?.id, error: (error as Error)?.message });
        logger.error({ err: error, userId: authReq.user!.id, operation: 'pdfToExcel' }, 'PDF to Excel error');
        res.status(500).json({
          error: 'internal_error',
          message: 'Failed to convert PDF to Excel'
        });
      }
    }
  );

  // POST /pdfread/convert/pdf-to-ppt
  r.post('/convert/pdf-to-ppt',
    authRateLimits.general,
    authenticateToken,
    upload.single('file'),
    async (req: Request, res: Response) => {
      const authReq = req as unknown as AuthRequest;
      try {
        logPdfRoute('pdf_to_ppt_request_received', {
          userId: authReq.user?.id,
          hasFile: !!req.file,
          fileName: req.file?.originalname,
          mimeType: req.file?.mimetype,
        });
        if (!req.file) {
          logPdfRoute('pdf_to_ppt_missing_file', { userId: authReq.user?.id });
          return res.status(400).json({
            error: 'no_file',
            message: 'No file uploaded'
          });
        }

        if (req.file.mimetype !== 'application/pdf') {
          logPdfRoute('pdf_to_ppt_invalid_mime', { userId: authReq.user?.id, mimeType: req.file.mimetype });
          return res.status(400).json({
            error: 'invalid_file_type',
            message: 'Only PDF files are allowed for this conversion'
          });
        }

        const result = await PDFReadService.pdfToPPT(
          req.file.buffer,
          req.file.originalname
        );
        logPdfRoute('pdf_to_ppt_service_result', { userId: authReq.user?.id, success: result.success });

        // Log the action
        await auditService.logUserAction(
          authReq.user!.id,
          'pdf_convert_ppt',
          {
            fileName: req.file.originalname,
            fileSize: req.file.size,
            success: result.success
          }
        );

        if (result.success) {
          logPdfRoute('pdf_to_ppt_success_response', { userId: authReq.user?.id });
          res.json(result);
        } else {
          logPdfRoute('pdf_to_ppt_failed_response', { userId: authReq.user?.id });
          res.status(400).json(result);
        }
      } catch (error) {
        logPdfRoute('pdf_to_ppt_error', { userId: authReq.user?.id, error: (error as Error)?.message });
        logger.error({ err: error, userId: authReq.user!.id, operation: 'pdfToPPT' }, 'PDF to PPT error');
        res.status(500).json({
          error: 'internal_error',
          message: 'Failed to convert PDF to PPT'
        });
      }
    }
  );

  // POST /pdfread/convert/word-to-pdf
  r.post('/convert/word-to-pdf',
    authRateLimits.general,
    authenticateToken,
    upload.single('file'),
    async (req: Request, res: Response) => {
      const authReq = req as unknown as AuthRequest;
      try {
        logPdfRoute('word_to_pdf_request_received', {
          userId: authReq.user?.id,
          hasFile: !!req.file,
          fileName: req.file?.originalname,
          mimeType: req.file?.mimetype,
        });
        if (!req.file) {
          logPdfRoute('word_to_pdf_missing_file', { userId: authReq.user?.id });
          return res.status(400).json({
            error: 'no_file',
            message: 'No file uploaded'
          });
        }

        if (req.file.mimetype !== 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
          logPdfRoute('word_to_pdf_invalid_mime', { userId: authReq.user?.id, mimeType: req.file.mimetype });
          return res.status(400).json({
            error: 'invalid_file_type',
            message: 'Only Word files are allowed for this conversion'
          });
        }

        const result = await PDFReadService.wordToPDF(
          req.file.buffer,
          req.file.originalname
        );
        logPdfRoute('word_to_pdf_service_result', { userId: authReq.user?.id, success: result.success });

        // Log the action
        await auditService.logUserAction(
          authReq.user!.id,
          'pdf_convert_word_to_pdf',
          {
            fileName: req.file.originalname,
            fileSize: req.file.size,
            success: result.success
          }
        );

        if (result.success) {
          logPdfRoute('word_to_pdf_success_response', { userId: authReq.user?.id });
          res.json(result);
        } else {
          logPdfRoute('word_to_pdf_failed_response', { userId: authReq.user?.id });
          res.status(400).json(result);
        }
      } catch (error) {
        logPdfRoute('word_to_pdf_error', { userId: authReq.user?.id, error: (error as Error)?.message });
        logger.error({ err: error, userId: authReq.user!.id, operation: 'wordToPDF' }, 'Word to PDF error');
        res.status(500).json({
          error: 'internal_error',
          message: 'Failed to convert Word to PDF'
        });
      }
    }
  );

  // POST /pdfread/convert/excel-to-pdf
  r.post('/convert/excel-to-pdf',
    authRateLimits.general,
    authenticateToken,
    upload.single('file'),
    async (req: Request, res: Response) => {
      const authReq = req as unknown as AuthRequest;
      try {
        logPdfRoute('excel_to_pdf_request_received', {
          userId: authReq.user?.id,
          hasFile: !!req.file,
          fileName: req.file?.originalname,
          mimeType: req.file?.mimetype,
        });
        if (!req.file) {
          logPdfRoute('excel_to_pdf_missing_file', { userId: authReq.user?.id });
          return res.status(400).json({
            error: 'no_file',
            message: 'No file uploaded'
          });
        }

        if (req.file.mimetype !== 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
          logPdfRoute('excel_to_pdf_invalid_mime', { userId: authReq.user?.id, mimeType: req.file.mimetype });
          return res.status(400).json({
            error: 'invalid_file_type',
            message: 'Only Excel files are allowed for this conversion'
          });
        }

        const result = await PDFReadService.excelToPDF(
          req.file.buffer,
          req.file.originalname
        );
        logPdfRoute('excel_to_pdf_service_result', { userId: authReq.user?.id, success: result.success });

        // Log the action
        await auditService.logUserAction(
          authReq.user!.id,
          'pdf_convert_excel_to_pdf',
          {
            fileName: req.file.originalname,
            fileSize: req.file.size,
            success: result.success
          }
        );

        if (result.success) {
          logPdfRoute('excel_to_pdf_success_response', { userId: authReq.user?.id });
          res.json(result);
        } else {
          logPdfRoute('excel_to_pdf_failed_response', { userId: authReq.user?.id });
          res.status(400).json(result);
        }
      } catch (error) {
        logPdfRoute('excel_to_pdf_error', { userId: authReq.user?.id, error: (error as Error)?.message });
        logger.error({ err: error, userId: authReq.user!.id, operation: 'excelToPDF' }, 'Excel to PDF error');
        res.status(500).json({
          error: 'internal_error',
          message: 'Failed to convert Excel to PDF'
        });
      }
    }
  );

  // POST /pdfread/convert/ppt-to-pdf
  r.post('/convert/ppt-to-pdf',
    authRateLimits.general,
    authenticateToken,
    upload.single('file'),
    async (req: Request, res: Response) => {
      const authReq = req as unknown as AuthRequest;
      try {
        logPdfRoute('ppt_to_pdf_request_received', {
          userId: authReq.user?.id,
          hasFile: !!req.file,
          fileName: req.file?.originalname,
          mimeType: req.file?.mimetype,
        });
        if (!req.file) {
          logPdfRoute('ppt_to_pdf_missing_file', { userId: authReq.user?.id });
          return res.status(400).json({
            error: 'no_file',
            message: 'No file uploaded'
          });
        }

        if (req.file.mimetype !== 'application/vnd.openxmlformats-officedocument.presentationml.presentation') {
          logPdfRoute('ppt_to_pdf_invalid_mime', { userId: authReq.user?.id, mimeType: req.file.mimetype });
          return res.status(400).json({
            error: 'invalid_file_type',
            message: 'Only PowerPoint files are allowed for this conversion'
          });
        }

        const result = await PDFReadService.pptToPDF(
          req.file.buffer,
          req.file.originalname
        );
        logPdfRoute('ppt_to_pdf_service_result', { userId: authReq.user?.id, success: result.success });

        // Log the action
        await auditService.logUserAction(
          authReq.user!.id,
          'pdf_convert_ppt_to_pdf',
          {
            fileName: req.file.originalname,
            fileSize: req.file.size,
            success: result.success
          }
        );

        if (result.success) {
          logPdfRoute('ppt_to_pdf_success_response', { userId: authReq.user?.id });
          res.json(result);
        } else {
          logPdfRoute('ppt_to_pdf_failed_response', { userId: authReq.user?.id });
          res.status(400).json(result);
        }
      } catch (error) {
        logPdfRoute('ppt_to_pdf_error', { userId: authReq.user?.id, error: (error as Error)?.message });
        logger.error({ err: error, userId: authReq.user!.id, operation: 'pptToPDF' }, 'PPT to PDF error');
        res.status(500).json({
          error: 'internal_error',
          message: 'Failed to convert PPT to PDF'
        });
      }
    }
  );

  return r;
}

function logPdfRoute(step: string, data: Record<string, unknown>) {
  logger.info({ step, ...data }, '[PDFRead]');
}
