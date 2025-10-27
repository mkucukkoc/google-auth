"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPDFReadExtendedRouter = createPDFReadExtendedRouter;
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
            'text/plain',
            'video/mp4'
        ];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        }
        else {
            cb(new Error('Invalid file type. Only PDF, DOCX, XLSX, PPTX, images, videos, and text files are allowed.'));
        }
    }
});
function createPDFReadExtendedRouter() {
    const r = (0, express_1.Router)();
    // POST /pdfread/generate/doc
    r.post('/generate/doc', rateLimitMiddleware_1.authRateLimits.general, authMiddleware_1.authenticateToken, (0, validationMiddleware_1.validate)(validationMiddleware_1.pdfReadSchemas.generateDoc), async (req, res) => {
        const authReq = req;
        try {
            const { prompt } = req.body;
            const result = await pdfReadService_1.PDFReadService.generateDoc(prompt);
            // Log the action
            await auditService_1.auditService.logUserAction(authReq.user.id, 'pdf_generate_doc', {
                promptLength: prompt.length,
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
            logger_1.logger.error({ err: error, userId: authReq.user.id, operation: 'generateDoc' }, 'Generate doc error');
            res.status(500).json({
                error: 'internal_error',
                message: 'Failed to generate Word document'
            });
        }
    });
    // POST /pdfread/generate/excel
    r.post('/generate/excel', rateLimitMiddleware_1.authRateLimits.general, authMiddleware_1.authenticateToken, (0, validationMiddleware_1.validate)(validationMiddleware_1.pdfReadSchemas.generateDoc), async (req, res) => {
        const authReq = req;
        try {
            const { prompt } = req.body;
            const result = await pdfReadService_1.PDFReadService.generateExcel(prompt);
            // Log the action
            await auditService_1.auditService.logUserAction(authReq.user.id, 'pdf_generate_excel', {
                promptLength: prompt.length,
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
            logger_1.logger.error({ err: error, userId: authReq.user.id, operation: 'generateExcel' }, 'Generate Excel error');
            res.status(500).json({
                error: 'internal_error',
                message: 'Failed to generate Excel document'
            });
        }
    });
    // POST /pdfread/generate/ppt
    r.post('/generate/ppt', rateLimitMiddleware_1.authRateLimits.general, authMiddleware_1.authenticateToken, (0, validationMiddleware_1.validate)(validationMiddleware_1.pdfReadSchemas.generateDoc), async (req, res) => {
        const authReq = req;
        try {
            const { prompt } = req.body;
            const result = await pdfReadService_1.PDFReadService.generatePPT(prompt);
            // Log the action
            await auditService_1.auditService.logUserAction(authReq.user.id, 'pdf_generate_ppt', {
                promptLength: prompt.length,
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
            logger_1.logger.error({ err: error, userId: authReq.user.id, operation: 'generatePPT' }, 'Generate PPT error');
            res.status(500).json({
                error: 'internal_error',
                message: 'Failed to generate PowerPoint document'
            });
        }
    });
    // POST /pdfread/generate/doc-advanced
    r.post('/generate/doc-advanced', rateLimitMiddleware_1.authRateLimits.general, authMiddleware_1.authenticateToken, (0, validationMiddleware_1.validate)(validationMiddleware_1.pdfReadSchemas.generateDocAdvanced), async (req, res) => {
        const authReq = req;
        try {
            const payload = req.body;
            const { prompt } = payload;
            const promptLength = prompt?.length ?? 0;
            const result = await pdfReadService_1.PDFReadService.generateDocAdvanced(payload);
            // Log the action
            await auditService_1.auditService.logUserAction(authReq.user.id, 'pdf_generate_doc_advanced', {
                promptLength,
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
            logger_1.logger.error({ err: error, userId: authReq.user.id, operation: 'generateDocAdvanced' }, 'Generate advanced doc error');
            res.status(500).json({
                error: 'internal_error',
                message: 'Failed to generate advanced Word document'
            });
        }
    });
    // POST /pdfread/generate/ppt-advanced
    r.post('/generate/ppt-advanced', rateLimitMiddleware_1.authRateLimits.general, authMiddleware_1.authenticateToken, (0, validationMiddleware_1.validate)(validationMiddleware_1.pdfReadSchemas.generatePPTAdvanced), async (req, res) => {
        const authReq = req;
        try {
            const payload = req.body;
            const { prompt } = payload;
            const promptLength = prompt?.length ?? 0;
            const result = await pdfReadService_1.PDFReadService.generatePPTAdvanced(payload);
            // Log the action
            await auditService_1.auditService.logUserAction(authReq.user.id, 'pdf_generate_ppt_advanced', {
                promptLength,
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
            logger_1.logger.error({ err: error, userId: authReq.user.id, operation: 'generatePPTAdvanced' }, 'Generate advanced PPT error');
            res.status(500).json({
                error: 'internal_error',
                message: 'Failed to generate advanced PowerPoint document'
            });
        }
    });
    // POST /pdfread/speech-to-text
    r.post('/speech-to-text', rateLimitMiddleware_1.authRateLimits.general, authMiddleware_1.authenticateToken, (0, validationMiddleware_1.validate)(validationMiddleware_1.pdfReadSchemas.speechToText), async (req, res) => {
        const authReq = req;
        try {
            const { audioBase64 } = req.body;
            const result = await pdfReadService_1.PDFReadService.speechToText(audioBase64);
            // Log the action
            await auditService_1.auditService.logUserAction(authReq.user.id, 'pdf_speech_to_text', {
                audioSize: audioBase64.length,
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
            logger_1.logger.error({ err: error, userId: authReq.user.id, operation: 'speechToText' }, 'Speech to text error');
            res.status(500).json({
                error: 'internal_error',
                message: 'Failed to convert speech to text'
            });
        }
    });
    // POST /pdfread/text-to-speech
    r.post('/text-to-speech', rateLimitMiddleware_1.authRateLimits.general, authMiddleware_1.authenticateToken, (0, validationMiddleware_1.validate)(validationMiddleware_1.pdfReadSchemas.textToSpeech), async (req, res) => {
        const authReq = req;
        try {
            const { messages } = req.body;
            const result = await pdfReadService_1.PDFReadService.textToSpeech(messages);
            // Log the action
            await auditService_1.auditService.logUserAction(authReq.user.id, 'pdf_text_to_speech', {
                messageCount: messages.length,
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
            logger_1.logger.error({ err: error, userId: authReq.user.id, operation: 'textToSpeech' }, 'Text to speech error');
            res.status(500).json({
                error: 'internal_error',
                message: 'Failed to convert text to speech'
            });
        }
    });
    // removed: /pdfread/analyze-image (now handled by pdf-read service)
    // removed: /pdfread/analyze-video (now handled by pdf-read service)
    // POST /pdfread/generate-video
    r.post('/generate-video', rateLimitMiddleware_1.authRateLimits.general, authMiddleware_1.authenticateToken, (0, validationMiddleware_1.validate)(validationMiddleware_1.pdfReadSchemas.generateDoc), async (req, res) => {
        const authReq = req;
        try {
            const { prompt } = req.body;
            const result = await pdfReadService_1.PDFReadService.generateVideo(prompt);
            // Log the action
            await auditService_1.auditService.logUserAction(authReq.user.id, 'pdf_generate_video', {
                promptLength: prompt.length,
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
            logger_1.logger.error({ err: error, userId: authReq.user.id, operation: 'generateVideo' }, 'Generate video error');
            res.status(500).json({
                error: 'internal_error',
                message: 'Failed to generate video'
            });
        }
    });
    // POST /pdfread/generate-video-prompt
    r.post('/generate-video-prompt', rateLimitMiddleware_1.authRateLimits.general, authMiddleware_1.authenticateToken, (0, validationMiddleware_1.validate)(validationMiddleware_1.pdfReadSchemas.generateDoc), async (req, res) => {
        const authReq = req;
        try {
            const { prompt } = req.body;
            const result = await pdfReadService_1.PDFReadService.generateVideoPrompt(prompt);
            // Log the action
            await auditService_1.auditService.logUserAction(authReq.user.id, 'pdf_generate_video_prompt', {
                promptLength: prompt.length,
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
            logger_1.logger.error({ err: error, userId: authReq.user.id, operation: 'generateVideoPrompt' }, 'Generate video prompt error');
            res.status(500).json({
                error: 'internal_error',
                message: 'Failed to generate video prompt'
            });
        }
    });
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
    r.post('/export-chat', rateLimitMiddleware_1.authRateLimits.general, authMiddleware_1.authenticateToken, (0, validationMiddleware_1.validate)(validationMiddleware_1.pdfReadSchemas.exportChat), async (req, res) => {
        const authReq = req;
        try {
            const { chatId, format } = req.body;
            const result = await pdfReadService_1.PDFReadService.exportChat(chatId, format);
            // Log the action
            await auditService_1.auditService.logUserAction(authReq.user.id, 'pdf_export_chat', {
                chatId,
                format,
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
            logger_1.logger.error({ err: error, userId: authReq.user.id, operation: 'exportChat' }, 'Export chat error');
            res.status(500).json({
                error: 'internal_error',
                message: 'Failed to export chat'
            });
        }
    });
    // removed: /pdfread/audio-isolation
    // removed: /pdfread/health
    return r;
}
