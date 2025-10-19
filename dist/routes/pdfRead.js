"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPDFReadRouter = createPDFReadRouter;
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const pdfReadService_1 = require("../services/pdfReadService");
const authMiddleware_1 = require("../middleware/authMiddleware");
const validationMiddleware_1 = require("../middleware/validationMiddleware");
const rateLimitMiddleware_1 = require("../middleware/rateLimitMiddleware");
const auditService_1 = require("../services/auditService");
const logger_1 = require("../utils/logger");
// Multer configuration for file uploads
const upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
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
        }
        else {
            cb(new Error('Invalid file type. Only PDF, DOCX, XLSX, PPTX, images, and text files are allowed.'));
        }
    }
});
function createPDFReadRouter() {
    const r = (0, express_1.Router)();
    // POST /pdfread/summarize
    r.post('/summarize', rateLimitMiddleware_1.authRateLimits.general, authMiddleware_1.authenticateToken, upload.single('file'), async (req, res) => {
        const authReq = req;
        try {
            if (!req.file) {
                return res.status(400).json({
                    error: 'no_file',
                    message: 'No file uploaded'
                });
            }
            const result = await pdfReadService_1.PDFReadService.summarizePDF(req.file.buffer, req.file.originalname);
            // Log the action
            await auditService_1.auditService.logUserAction(authReq.user.id, 'pdf_summarize', {
                fileName: req.file.originalname,
                fileSize: req.file.size,
                success: result.success
            });
            if (result.success) {
                res.json(result);
            }
            else {
                res.status(400).json(result);
            }
        }
        catch (error) {
            logger_1.logger.error({ err: error, userId: authReq.user.id, operation: 'pdfSummarize' }, 'PDF summarize error');
            res.status(500).json({
                error: 'internal_error',
                message: 'Failed to summarize PDF'
            });
        }
    });
    // POST /pdfread/ask-question
    r.post('/ask-question', rateLimitMiddleware_1.authRateLimits.general, authMiddleware_1.authenticateToken, (0, validationMiddleware_1.validate)(validationMiddleware_1.pdfReadSchemas.askQuestion), async (req, res) => {
        const authReq = req;
        try {
            const { pdfText, question } = req.body;
            const result = await pdfReadService_1.PDFReadService.askPDFQuestion(pdfText, question);
            // Log the action
            await auditService_1.auditService.logUserAction(authReq.user.id, 'pdf_ask_question', {
                questionLength: question.length,
                pdfTextLength: pdfText.length,
                success: result.success
            });
            if (result.success) {
                res.json(result);
            }
            else {
                res.status(400).json(result);
            }
        }
        catch (error) {
            logger_1.logger.error({ err: error, userId: authReq.user.id, operation: 'pdfQuestion' }, 'PDF question error');
            res.status(500).json({
                error: 'internal_error',
                message: 'Failed to answer PDF question'
            });
        }
    });
    // POST /pdfread/detect-ai
    r.post('/detect-ai', rateLimitMiddleware_1.authRateLimits.general, authMiddleware_1.authenticateToken, upload.single('file'), async (req, res) => {
        const authReq = req;
        try {
            if (!req.file) {
                return res.status(400).json({
                    error: 'no_file',
                    message: 'No file uploaded'
                });
            }
            const result = await pdfReadService_1.PDFReadService.detectAIDocument(req.file.buffer, req.file.originalname, req.file.mimetype);
            // Log the action
            await auditService_1.auditService.logUserAction(authReq.user.id, 'pdf_detect_ai', {
                fileName: req.file.originalname,
                fileSize: req.file.size,
                mimeType: req.file.mimetype,
                success: result.success
            });
            if (result.success) {
                res.json(result);
            }
            else {
                res.status(400).json(result);
            }
        }
        catch (error) {
            logger_1.logger.error({ err: error, userId: authReq.user.id, operation: 'aiDetection' }, 'AI detection error');
            res.status(500).json({
                error: 'internal_error',
                message: 'Failed to detect AI document'
            });
        }
    });
    // POST /pdfread/analyze-image
    r.post('/analyze-image', 
    // authRateLimits.general,
    // authenticateToken,
    async (req, res) => {
        try {
            const { imageBase64, fileUrl, prompt, chatId } = req.body;
            logger_1.logger.info({
                chatId,
                hasImageBase64: !!imageBase64,
                hasFileUrl: !!fileUrl,
                prompt,
                operation: 'analyzeImage'
            }, 'Image analysis request received');
            let imageData = imageBase64;
            // If fileUrl is provided instead of imageBase64, download and convert
            if (fileUrl && !imageBase64) {
                try {
                    logger_1.logger.debug('Downloading image from URL:', { fileUrl });
                    const response = await fetch(fileUrl);
                    if (!response.ok) {
                        throw new Error(`Failed to download image: ${response.statusText}`);
                    }
                    const imageBuffer = await response.arrayBuffer();
                    imageData = Buffer.from(imageBuffer).toString('base64');
                    logger_1.logger.debug('Image downloaded and converted to base64');
                }
                catch (downloadError) {
                    logger_1.logger.error('Failed to download image:', { downloadError, fileUrl });
                    return res.status(400).json({
                        success: false,
                        error: 'download_failed',
                        message: 'Failed to download image from URL'
                    });
                }
            }
            if (!imageData) {
                return res.status(400).json({
                    success: false,
                    error: 'no_image_data',
                    message: 'No image data provided (imageBase64 or fileUrl required)'
                });
            }
            const result = await pdfReadService_1.PDFReadService.analyzeImage(imageData);
            // Log the action (skip for now due to auth issues)
            // await auditService.logUserAction(
            //   authReq.user!.id,
            //   'pdf_analyze_image',
            //   {
            //     imageSize: imageData.length,
            //     success: result.success,
            //     source: fileUrl ? 'url' : 'base64'
            //   }
            // );
            if (result.success) {
                res.json(result);
            }
            else {
                res.status(400).json(result);
            }
        }
        catch (error) {
            logger_1.logger.error({ err: error, operation: 'imageAnalysis' }, 'Image analysis error');
            res.status(500).json({
                success: false,
                error: 'internal_error',
                message: 'Failed to analyze image'
            });
        }
    });
    // POST /pdfread/convert/pdf-to-word
    r.post('/convert/pdf-to-word', rateLimitMiddleware_1.authRateLimits.general, authMiddleware_1.authenticateToken, upload.single('file'), async (req, res) => {
        const authReq = req;
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
            const result = await pdfReadService_1.PDFReadService.pdfToWord(req.file.buffer, req.file.originalname);
            // Log the action
            await auditService_1.auditService.logUserAction(authReq.user.id, 'pdf_convert_word', {
                fileName: req.file.originalname,
                fileSize: req.file.size,
                success: result.success
            });
            if (result.success) {
                res.json(result);
            }
            else {
                res.status(400).json(result);
            }
        }
        catch (error) {
            logger_1.logger.error({ err: error, userId: authReq.user.id, operation: 'pdfToWord' }, 'PDF to Word error');
            res.status(500).json({
                error: 'internal_error',
                message: 'Failed to convert PDF to Word'
            });
        }
    });
    // POST /pdfread/convert/pdf-to-excel
    r.post('/convert/pdf-to-excel', rateLimitMiddleware_1.authRateLimits.general, authMiddleware_1.authenticateToken, upload.single('file'), async (req, res) => {
        const authReq = req;
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
            const result = await pdfReadService_1.PDFReadService.pdfToExcel(req.file.buffer, req.file.originalname);
            // Log the action
            await auditService_1.auditService.logUserAction(authReq.user.id, 'pdf_convert_excel', {
                fileName: req.file.originalname,
                fileSize: req.file.size,
                success: result.success
            });
            if (result.success) {
                res.json(result);
            }
            else {
                res.status(400).json(result);
            }
        }
        catch (error) {
            logger_1.logger.error({ err: error, userId: authReq.user.id, operation: 'pdfToExcel' }, 'PDF to Excel error');
            res.status(500).json({
                error: 'internal_error',
                message: 'Failed to convert PDF to Excel'
            });
        }
    });
    // POST /pdfread/convert/pdf-to-ppt
    r.post('/convert/pdf-to-ppt', rateLimitMiddleware_1.authRateLimits.general, authMiddleware_1.authenticateToken, upload.single('file'), async (req, res) => {
        const authReq = req;
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
            const result = await pdfReadService_1.PDFReadService.pdfToPPT(req.file.buffer, req.file.originalname);
            // Log the action
            await auditService_1.auditService.logUserAction(authReq.user.id, 'pdf_convert_ppt', {
                fileName: req.file.originalname,
                fileSize: req.file.size,
                success: result.success
            });
            if (result.success) {
                res.json(result);
            }
            else {
                res.status(400).json(result);
            }
        }
        catch (error) {
            logger_1.logger.error({ err: error, userId: authReq.user.id, operation: 'pdfToPPT' }, 'PDF to PPT error');
            res.status(500).json({
                error: 'internal_error',
                message: 'Failed to convert PDF to PPT'
            });
        }
    });
    // POST /pdfread/convert/word-to-pdf
    r.post('/convert/word-to-pdf', rateLimitMiddleware_1.authRateLimits.general, authMiddleware_1.authenticateToken, upload.single('file'), async (req, res) => {
        const authReq = req;
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
            const result = await pdfReadService_1.PDFReadService.wordToPDF(req.file.buffer, req.file.originalname);
            // Log the action
            await auditService_1.auditService.logUserAction(authReq.user.id, 'pdf_convert_word_to_pdf', {
                fileName: req.file.originalname,
                fileSize: req.file.size,
                success: result.success
            });
            if (result.success) {
                res.json(result);
            }
            else {
                res.status(400).json(result);
            }
        }
        catch (error) {
            logger_1.logger.error({ err: error, userId: authReq.user.id, operation: 'wordToPDF' }, 'Word to PDF error');
            res.status(500).json({
                error: 'internal_error',
                message: 'Failed to convert Word to PDF'
            });
        }
    });
    // POST /pdfread/convert/excel-to-pdf
    r.post('/convert/excel-to-pdf', rateLimitMiddleware_1.authRateLimits.general, authMiddleware_1.authenticateToken, upload.single('file'), async (req, res) => {
        const authReq = req;
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
            const result = await pdfReadService_1.PDFReadService.excelToPDF(req.file.buffer, req.file.originalname);
            // Log the action
            await auditService_1.auditService.logUserAction(authReq.user.id, 'pdf_convert_excel_to_pdf', {
                fileName: req.file.originalname,
                fileSize: req.file.size,
                success: result.success
            });
            if (result.success) {
                res.json(result);
            }
            else {
                res.status(400).json(result);
            }
        }
        catch (error) {
            logger_1.logger.error({ err: error, userId: authReq.user.id, operation: 'excelToPDF' }, 'Excel to PDF error');
            res.status(500).json({
                error: 'internal_error',
                message: 'Failed to convert Excel to PDF'
            });
        }
    });
    // POST /pdfread/convert/ppt-to-pdf
    r.post('/convert/ppt-to-pdf', rateLimitMiddleware_1.authRateLimits.general, authMiddleware_1.authenticateToken, upload.single('file'), async (req, res) => {
        const authReq = req;
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
            const result = await pdfReadService_1.PDFReadService.pptToPDF(req.file.buffer, req.file.originalname);
            // Log the action
            await auditService_1.auditService.logUserAction(authReq.user.id, 'pdf_convert_ppt_to_pdf', {
                fileName: req.file.originalname,
                fileSize: req.file.size,
                success: result.success
            });
            if (result.success) {
                res.json(result);
            }
            else {
                res.status(400).json(result);
            }
        }
        catch (error) {
            logger_1.logger.error({ err: error, userId: authReq.user.id, operation: 'pptToPDF' }, 'PPT to PDF error');
            res.status(500).json({
                error: 'internal_error',
                message: 'Failed to convert PPT to PDF'
            });
        }
    });
    return r;
}
