import { Router, Request, Response } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/authMiddleware';
import { authRateLimits } from '../middleware/rateLimitMiddleware';
import { auditService } from '../services/auditService';
import { logger } from '../utils/logger';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { admin } from '../firebase';
import * as firebaseAdmin from 'firebase-admin';

// Multer configuration for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allow all file types for now
    cb(null, true);
  }
});

export function createFileUploadRouter(): Router {
  const router = Router();

  /**
   * @swagger
   * /api/v1/upload/file:
   *   post:
   *     summary: Upload a file to Firebase Storage
   *     tags: [File Upload]
   *     security:
   *       - BearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         multipart/form-data:
   *           schema:
   *             type: object
   *             properties:
   *               file:
   *                 type: string
   *                 format: binary
   *                 description: File to upload
   *               chatId:
   *                 type: string
   *                 description: Chat ID for file association
   *     responses:
   *       200:
   *         description: File uploaded successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                 data:
   *                   type: object
   *                   properties:
   *                     fileName:
   *                       type: string
   *                     fileUrl:
   *                       type: string
   *                     fileSize:
   *                       type: number
   *                     mimeType:
   *                       type: string
   *       400:
   *         description: Invalid request
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Internal server error
   */
  router.post('/file',
    authRateLimits.general,
    authenticateToken,
    upload.single('file'),
    async (req: AuthRequest, res: Response) => {
      const requestId = Math.random().toString(36).substring(7);
      const startTime = Date.now();
      
      try {
        if (!req.file) {
          return res.status(400).json({
            success: false,
            error: 'no_file',
            message: 'No file provided'
          });
        }

        const { chatId } = req.body;
        const authReq = req as AuthRequest;
        const userId = authReq.user!.id;
        
        logger.info({
          requestId,
          userId,
          chatId,
          fileName: req.file.originalname,
          fileSize: req.file.size,
          mimeType: req.file.mimetype,
          operation: 'fileUpload'
        }, 'File upload request received');

        // Generate unique filename
        const fileExtension = req.file.originalname.split('.').pop() || 'bin';
        const fileName = `${uuidv4()}-${Date.now()}.${fileExtension}`;
        const storagePath = `users/${userId}/uploads/${fileName}`;

        // Upload to Firebase Storage using admin SDK
        const bucket = firebaseAdmin.storage().bucket();
        const file = bucket.file(storagePath);
        
        await file.save(req.file.buffer, {
          metadata: {
            contentType: req.file.mimetype,
            metadata: {
              originalName: req.file.originalname,
              uploadedBy: userId,
              chatId: chatId || 'unknown',
              uploadedAt: new Date().toISOString()
            }
          }
        });

        // Make file publicly readable
        await file.makePublic();

        // Get public URL
        const fileUrl = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;

        // Log the action
        await auditService.logUserAction(
          userId,
          'file_upload',
          {
            fileName: req.file.originalname,
            fileSize: req.file.size,
            mimeType: req.file.mimetype,
            storagePath,
            chatId: chatId || 'unknown',
            success: true
          }
        );

        const processingTime = Date.now() - startTime;
        
        logger.info({
          requestId,
          userId,
          chatId,
          fileName: req.file.originalname,
          fileSize: req.file.size,
          storagePath,
          fileUrl,
          processingTime,
          operation: 'fileUpload'
        }, 'File uploaded successfully');

        res.json({
          success: true,
          data: {
            fileName: req.file.originalname,
            fileUrl,
            fileSize: req.file.size,
            mimeType: req.file.mimetype,
            storagePath
          }
        });

      } catch (error) {
        const authReq = req as AuthRequest;
        logger.error({
          requestId,
          userId: authReq.user?.id,
          error,
          operation: 'fileUpload'
        }, 'File upload error');

        // Log the failed action
        if (authReq.user) {
          await auditService.logUserAction(
            authReq.user.id,
            'file_upload',
            {
              fileName: req.file?.originalname,
              fileSize: req.file?.size,
              mimeType: req.file?.mimetype,
              success: false,
              error: (error as Error).message
            }
          );
        }

        res.status(500).json({
          success: false,
          error: 'upload_failed',
          message: 'File upload failed'
        });
      }
    }
  );

  /**
   * @swagger
   * /api/v1/upload/url:
   *   post:
   *     summary: Upload a file from URL to Firebase Storage
   *     tags: [File Upload]
   *     security:
   *       - BearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - fileUrl
   *             properties:
   *               fileUrl:
   *                 type: string
   *                 description: URL of the file to upload
   *               chatId:
   *                 type: string
   *                 description: Chat ID for file association
   *               fileName:
   *                 type: string
   *                 description: Custom file name
   *     responses:
   *       200:
   *         description: File uploaded successfully
   *       400:
   *         description: Invalid request
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Internal server error
   */
  router.post('/url',
    authRateLimits.general,
    authenticateToken,
    async (req: AuthRequest, res: Response) => {
      const requestId = Math.random().toString(36).substring(7);
      const startTime = Date.now();
      
      try {
        const { fileUrl, chatId, fileName } = req.body;
        const authReq = req as AuthRequest;
        const userId = authReq.user!.id;

        if (!fileUrl) {
          return res.status(400).json({
            success: false,
            error: 'no_url',
            message: 'No file URL provided'
          });
        }

        logger.info({
          requestId,
          userId,
          chatId,
          fileUrl,
          fileName,
          operation: 'fileUploadFromUrl'
        }, 'File upload from URL request received');

        // Download file from URL
        const response = await fetch(fileUrl);
        if (!response.ok) {
          throw new Error(`Failed to download file: ${response.statusText}`);
        }

        const fileBuffer = await response.arrayBuffer();
        const contentType = response.headers.get('content-type') || 'application/octet-stream';
        
        // Generate filename
        const urlFileName = fileName || fileUrl.split('/').pop() || 'file';
        const fileExtension = urlFileName.split('.').pop() || 'bin';
        const finalFileName = `${uuidv4()}-${Date.now()}.${fileExtension}`;
        const storagePath = `users/${userId}/uploads/${finalFileName}`;

        // Upload to Firebase Storage
        const bucket = firebaseAdmin.storage().bucket();
        const file = bucket.file(storagePath);
        
        await file.save(Buffer.from(fileBuffer), {
          metadata: {
            contentType,
            metadata: {
              originalName: urlFileName,
              originalUrl: fileUrl,
              uploadedBy: userId,
              chatId: chatId || 'unknown',
              uploadedAt: new Date().toISOString()
            }
          }
        });

        // Make file publicly readable
        await file.makePublic();

        // Get public URL
        const publicUrl = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;

        // Log the action
        await auditService.logUserAction(
          userId,
          'file_upload_from_url',
          {
            originalUrl: fileUrl,
            fileName: urlFileName,
            fileSize: fileBuffer.byteLength,
            mimeType: contentType,
            storagePath,
            chatId: chatId || 'unknown',
            success: true
          }
        );

        const processingTime = Date.now() - startTime;
        
        logger.info({
          requestId,
          userId,
          chatId,
          originalUrl: fileUrl,
          fileName: urlFileName,
          fileSize: fileBuffer.byteLength,
          storagePath,
          publicUrl,
          processingTime,
          operation: 'fileUploadFromUrl'
        }, 'File uploaded from URL successfully');

        res.json({
          success: true,
          data: {
            fileName: urlFileName,
            fileUrl: publicUrl,
            fileSize: fileBuffer.byteLength,
            mimeType: contentType,
            storagePath
          }
        });

      } catch (error) {
        const authReq = req as AuthRequest;
        logger.error({
          requestId,
          userId: authReq.user?.id,
          error,
          operation: 'fileUploadFromUrl'
        }, 'File upload from URL error');

        // Log the failed action
        if (authReq.user) {
          await auditService.logUserAction(
            authReq.user.id,
            'file_upload_from_url',
            {
              originalUrl: req.body.fileUrl,
              success: false,
              error: (error as Error).message
            }
          );
        }

        res.status(500).json({
          success: false,
          error: 'upload_failed',
          message: 'File upload from URL failed'
        });
      }
    }
  );

  return router;
}
