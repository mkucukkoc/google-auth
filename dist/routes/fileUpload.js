"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createFileUploadRouter = createFileUploadRouter;
const express_1 = require("express");
const authMiddleware_1 = require("../middleware/authMiddleware");
const rateLimitMiddleware_1 = require("../middleware/rateLimitMiddleware");
const auditService_1 = require("../services/auditService");
const logger_1 = require("../utils/logger");
const multer_1 = __importDefault(require("multer"));
const uuid_1 = require("uuid");
const firebaseAdmin = __importStar(require("firebase-admin"));
// Multer configuration for file uploads
const storage = multer_1.default.memoryStorage();
const upload = (0, multer_1.default)({
    storage,
    limits: {
        fileSize: 25 * 1024 * 1024, // 25MB limit
    },
    fileFilter: (req, file, cb) => {
        // Allow all file types for now
        cb(null, true);
    }
});
function createFileUploadRouter() {
    const router = (0, express_1.Router)();
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
    router.post('/file', rateLimitMiddleware_1.authRateLimits.general, authMiddleware_1.authenticateToken, upload.single('file'), async (req, res) => {
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
            const authReq = req;
            const userId = authReq.user.id;
            logger_1.logger.info({
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
            const fileName = `${(0, uuid_1.v4)()}-${Date.now()}.${fileExtension}`;
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
            await auditService_1.auditService.logUserAction(userId, 'file_upload', {
                fileName: req.file.originalname,
                fileSize: req.file.size,
                mimeType: req.file.mimetype,
                storagePath,
                chatId: chatId || 'unknown',
                success: true
            });
            const processingTime = Date.now() - startTime;
            logger_1.logger.info({
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
        }
        catch (error) {
            const authReq = req;
            logger_1.logger.error({
                requestId,
                userId: authReq.user?.id,
                error,
                operation: 'fileUpload'
            }, 'File upload error');
            // Log the failed action
            if (authReq.user) {
                await auditService_1.auditService.logUserAction(authReq.user.id, 'file_upload', {
                    fileName: req.file?.originalname,
                    fileSize: req.file?.size,
                    mimeType: req.file?.mimetype,
                    success: false,
                    error: error.message
                });
            }
            res.status(500).json({
                success: false,
                error: 'upload_failed',
                message: 'File upload failed'
            });
        }
    });
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
    router.post('/url', rateLimitMiddleware_1.authRateLimits.general, authMiddleware_1.authenticateToken, async (req, res) => {
        const requestId = Math.random().toString(36).substring(7);
        const startTime = Date.now();
        try {
            const { fileUrl, chatId, fileName } = req.body;
            const authReq = req;
            const userId = authReq.user.id;
            if (!fileUrl) {
                return res.status(400).json({
                    success: false,
                    error: 'no_url',
                    message: 'No file URL provided'
                });
            }
            logger_1.logger.info({
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
            const finalFileName = `${(0, uuid_1.v4)()}-${Date.now()}.${fileExtension}`;
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
            await auditService_1.auditService.logUserAction(userId, 'file_upload_from_url', {
                originalUrl: fileUrl,
                fileName: urlFileName,
                fileSize: fileBuffer.byteLength,
                mimeType: contentType,
                storagePath,
                chatId: chatId || 'unknown',
                success: true
            });
            const processingTime = Date.now() - startTime;
            logger_1.logger.info({
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
        }
        catch (error) {
            const authReq = req;
            logger_1.logger.error({
                requestId,
                userId: authReq.user?.id,
                error,
                operation: 'fileUploadFromUrl'
            }, 'File upload from URL error');
            // Log the failed action
            if (authReq.user) {
                await auditService_1.auditService.logUserAction(authReq.user.id, 'file_upload_from_url', {
                    originalUrl: req.body.fileUrl,
                    success: false,
                    error: error.message
                });
            }
            res.status(500).json({
                success: false,
                error: 'upload_failed',
                message: 'File upload from URL failed'
            });
        }
    });
    return router;
}
