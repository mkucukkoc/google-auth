import { Router, Request, Response } from 'express';
import multer from 'multer';
import { PDFReadService } from '../services/pdfReadService';
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
        if (!req.file) {
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
          res.json(result);
        } else {
          res.status(400).json(result);
        }
      } catch (error) {
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
        if (!req.file) {
          return res.status(400).json({
            error: 'no_file',
            message: 'No file uploaded'
          });
        }

        if (req.file.mimetype !== 'application/pdf') {
          return res.status(400).json({
            error: 'invalid_file_type',
            message: 'Only PDF files are allowed for this conversion'
          });
        }

        const result = await PDFReadService.pdfToWord(
          req.file.buffer,
          req.file.originalname
        );

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
          res.json(result);
        } else {
          res.status(400).json(result);
        }
      } catch (error) {
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
        if (!req.file) {
          return res.status(400).json({
            error: 'no_file',
            message: 'No file uploaded'
          });
        }

        if (req.file.mimetype !== 'application/pdf') {
          return res.status(400).json({
            error: 'invalid_file_type',
            message: 'Only PDF files are allowed for this conversion'
          });
        }

        const result = await PDFReadService.pdfToExcel(
          req.file.buffer,
          req.file.originalname
        );

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
          res.json(result);
        } else {
          res.status(400).json(result);
        }
      } catch (error) {
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
        if (!req.file) {
          return res.status(400).json({
            error: 'no_file',
            message: 'No file uploaded'
          });
        }

        if (req.file.mimetype !== 'application/pdf') {
          return res.status(400).json({
            error: 'invalid_file_type',
            message: 'Only PDF files are allowed for this conversion'
          });
        }

        const result = await PDFReadService.pdfToPPT(
          req.file.buffer,
          req.file.originalname
        );

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
          res.json(result);
        } else {
          res.status(400).json(result);
        }
      } catch (error) {
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
        if (!req.file) {
          return res.status(400).json({
            error: 'no_file',
            message: 'No file uploaded'
          });
        }

        if (req.file.mimetype !== 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
          return res.status(400).json({
            error: 'invalid_file_type',
            message: 'Only Word files are allowed for this conversion'
          });
        }

        const result = await PDFReadService.wordToPDF(
          req.file.buffer,
          req.file.originalname
        );

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
          res.json(result);
        } else {
          res.status(400).json(result);
        }
      } catch (error) {
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
        if (!req.file) {
          return res.status(400).json({
            error: 'no_file',
            message: 'No file uploaded'
          });
        }

        if (req.file.mimetype !== 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
          return res.status(400).json({
            error: 'invalid_file_type',
            message: 'Only Excel files are allowed for this conversion'
          });
        }

        const result = await PDFReadService.excelToPDF(
          req.file.buffer,
          req.file.originalname
        );

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
          res.json(result);
        } else {
          res.status(400).json(result);
        }
      } catch (error) {
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
        if (!req.file) {
          return res.status(400).json({
            error: 'no_file',
            message: 'No file uploaded'
          });
        }

        if (req.file.mimetype !== 'application/vnd.openxmlformats-officedocument.presentationml.presentation') {
          return res.status(400).json({
            error: 'invalid_file_type',
            message: 'Only PowerPoint files are allowed for this conversion'
          });
        }

        const result = await PDFReadService.pptToPDF(
          req.file.buffer,
          req.file.originalname
        );

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
          res.json(result);
        } else {
          res.status(400).json(result);
        }
      } catch (error) {
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
