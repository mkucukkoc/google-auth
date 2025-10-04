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
    r.post('/generate/doc-advanced', rateLimitMiddleware_1.authRateLimits.general, authMiddleware_1.authenticateToken, (0, validationMiddleware_1.validate)(validationMiddleware_1.pdfReadSchemas.generateDoc), async (req, res) => {
        const authReq = req;
        try {
            const { prompt } = req.body;
            const result = await pdfReadService_1.PDFReadService.generateDocAdvanced(prompt);
            // Log the action
            await auditService_1.auditService.logUserAction(authReq.user.id, 'pdf_generate_doc_advanced', {
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
            logger_1.logger.error({ err: error, userId: authReq.user.id, operation: 'generateDocAdvanced' }, 'Generate advanced doc error');
            res.status(500).json({
                error: 'internal_error',
                message: 'Failed to generate advanced Word document'
            });
        }
    });
    // POST /pdfread/generate/ppt-advanced
    r.post('/generate/ppt-advanced', rateLimitMiddleware_1.authRateLimits.general, authMiddleware_1.authenticateToken, (0, validationMiddleware_1.validate)(validationMiddleware_1.pdfReadSchemas.generateDoc), async (req, res) => {
        const authReq = req;
        try {
            const { prompt } = req.body;
            const result = await pdfReadService_1.PDFReadService.generatePPTAdvanced(prompt);
            // Log the action
            await auditService_1.auditService.logUserAction(authReq.user.id, 'pdf_generate_ppt_advanced', {
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
    // POST /pdfread/image-caption
    r.post('/image-caption', rateLimitMiddleware_1.authRateLimits.general, authMiddleware_1.authenticateToken, (0, validationMiddleware_1.validate)(validationMiddleware_1.pdfReadSchemas.analyzeImage), async (req, res) => {
        const authReq = req;
        try {
            const { imageBase64 } = req.body;
            const result = await pdfReadService_1.PDFReadService.imageCaption(imageBase64);
            // Log the action
            await auditService_1.auditService.logUserAction(authReq.user.id, 'pdf_image_caption', {
                imageSize: imageBase64.length,
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
            logger_1.logger.error({ err: error, userId: authReq.user.id, operation: 'imageCaption' }, 'Image caption error');
            res.status(500).json({
                error: 'internal_error',
                message: 'Failed to generate image caption'
            });
        }
    });
    // POST /pdfread/analyze-video
    r.post('/analyze-video', rateLimitMiddleware_1.authRateLimits.general, authMiddleware_1.authenticateToken, (0, validationMiddleware_1.validate)(validationMiddleware_1.pdfReadSchemas.analyzeVideo), async (req, res) => {
        const authReq = req;
        try {
            const { videoBase64 } = req.body;
            const result = await pdfReadService_1.PDFReadService.analyzeVideo(videoBase64);
            // Log the action
            await auditService_1.auditService.logUserAction(authReq.user.id, 'pdf_analyze_video', {
                videoSize: videoBase64.length,
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
            logger_1.logger.error({ err: error, userId: authReq.user.id, operation: 'analyzeVideo' }, 'Video analysis error');
            res.status(500).json({
                error: 'internal_error',
                message: 'Failed to analyze video'
            });
        }
    });
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
    // POST /pdfread/ask-with-embeddings
    r.post('/ask-with-embeddings', rateLimitMiddleware_1.authRateLimits.general, authMiddleware_1.authenticateToken, (0, validationMiddleware_1.validate)(validationMiddleware_1.pdfReadSchemas.askWithEmbeddings), async (req, res) => {
        const authReq = req;
        try {
            const { question, chatId } = req.body;
            const result = await pdfReadService_1.PDFReadService.askWithEmbeddings(question, chatId);
            // Log the action
            await auditService_1.auditService.logUserAction(authReq.user.id, 'pdf_ask_with_embeddings', {
                questionLength: question.length,
                chatId,
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
            logger_1.logger.error({ err: error, userId: authReq.user.id, operation: 'askWithEmbeddings' }, 'Ask with embeddings error');
            res.status(500).json({
                error: 'internal_error',
                message: 'Failed to answer question with embeddings'
            });
        }
    });
    // POST /pdfread/search-docs
    r.post('/search-docs', rateLimitMiddleware_1.authRateLimits.general, authMiddleware_1.authenticateToken, (0, validationMiddleware_1.validate)(validationMiddleware_1.pdfReadSchemas.searchDocs), async (req, res) => {
        const authReq = req;
        try {
            const { query, chatId } = req.body;
            const result = await pdfReadService_1.PDFReadService.searchDocs(query, chatId);
            // Log the action
            await auditService_1.auditService.logUserAction(authReq.user.id, 'pdf_search_docs', {
                queryLength: query.length,
                chatId,
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
            logger_1.logger.error({ err: error, userId: authReq.user.id, operation: 'searchDocs' }, 'Search docs error');
            res.status(500).json({
                error: 'internal_error',
                message: 'Failed to search documents'
            });
        }
    });
    // POST /pdfread/summarize/pdf-url
    r.post('/summarize/pdf-url', rateLimitMiddleware_1.authRateLimits.general, authMiddleware_1.authenticateToken, (0, validationMiddleware_1.validate)(validationMiddleware_1.pdfReadSchemas.summarizeUrl), async (req, res) => {
        const authReq = req;
        try {
            const { url } = req.body;
            const result = await pdfReadService_1.PDFReadService.summarizePDFUrl(url);
            // Log the action
            await auditService_1.auditService.logUserAction(authReq.user.id, 'pdf_summarize_pdf_url', {
                url,
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
            logger_1.logger.error({ err: error, userId: authReq.user.id, operation: 'summarizePDFUrl' }, 'Summarize PDF URL error');
            res.status(500).json({
                error: 'internal_error',
                message: 'Failed to summarize PDF URL'
            });
        }
    });
    // POST /pdfread/summarize/word-url
    r.post('/summarize/word-url', rateLimitMiddleware_1.authRateLimits.general, authMiddleware_1.authenticateToken, (0, validationMiddleware_1.validate)(validationMiddleware_1.pdfReadSchemas.summarizeUrl), async (req, res) => {
        const authReq = req;
        try {
            const { url } = req.body;
            const result = await pdfReadService_1.PDFReadService.summarizeWordUrl(url);
            // Log the action
            await auditService_1.auditService.logUserAction(authReq.user.id, 'pdf_summarize_word_url', {
                url,
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
            logger_1.logger.error({ err: error, userId: authReq.user.id, operation: 'summarizeWordUrl' }, 'Summarize Word URL error');
            res.status(500).json({
                error: 'internal_error',
                message: 'Failed to summarize Word URL'
            });
        }
    });
    // POST /pdfread/summarize/excel-url
    r.post('/summarize/excel-url', rateLimitMiddleware_1.authRateLimits.general, authMiddleware_1.authenticateToken, (0, validationMiddleware_1.validate)(validationMiddleware_1.pdfReadSchemas.summarizeUrl), async (req, res) => {
        const authReq = req;
        try {
            const { url } = req.body;
            const result = await pdfReadService_1.PDFReadService.summarizeExcelUrl(url);
            // Log the action
            await auditService_1.auditService.logUserAction(authReq.user.id, 'pdf_summarize_excel_url', {
                url,
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
            logger_1.logger.error({ err: error, userId: authReq.user.id, operation: 'summarizeExcelUrl' }, 'Summarize Excel URL error');
            res.status(500).json({
                error: 'internal_error',
                message: 'Failed to summarize Excel URL'
            });
        }
    });
    // POST /pdfread/summarize/ppt-url
    r.post('/summarize/ppt-url', rateLimitMiddleware_1.authRateLimits.general, authMiddleware_1.authenticateToken, (0, validationMiddleware_1.validate)(validationMiddleware_1.pdfReadSchemas.summarizeUrl), async (req, res) => {
        const authReq = req;
        try {
            const { url } = req.body;
            const result = await pdfReadService_1.PDFReadService.summarizePPTUrl(url);
            // Log the action
            await auditService_1.auditService.logUserAction(authReq.user.id, 'pdf_summarize_ppt_url', {
                url,
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
            logger_1.logger.error({ err: error, userId: authReq.user.id, operation: 'summarizePPTUrl' }, 'Summarize PPT URL error');
            res.status(500).json({
                error: 'internal_error',
                message: 'Failed to summarize PPT URL'
            });
        }
    });
    // POST /pdfread/summarize/html-url
    r.post('/summarize/html-url', rateLimitMiddleware_1.authRateLimits.general, authMiddleware_1.authenticateToken, (0, validationMiddleware_1.validate)(validationMiddleware_1.pdfReadSchemas.summarizeUrl), async (req, res) => {
        const authReq = req;
        try {
            const { url } = req.body;
            const result = await pdfReadService_1.PDFReadService.summarizeHTMLUrl(url);
            // Log the action
            await auditService_1.auditService.logUserAction(authReq.user.id, 'pdf_summarize_html_url', {
                url,
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
            logger_1.logger.error({ err: error, userId: authReq.user.id, operation: 'summarizeHTMLUrl' }, 'Summarize HTML URL error');
            res.status(500).json({
                error: 'internal_error',
                message: 'Failed to summarize HTML URL'
            });
        }
    });
    // POST /pdfread/summarize/json-url
    r.post('/summarize/json-url', rateLimitMiddleware_1.authRateLimits.general, authMiddleware_1.authenticateToken, (0, validationMiddleware_1.validate)(validationMiddleware_1.pdfReadSchemas.summarizeUrl), async (req, res) => {
        const authReq = req;
        try {
            const { url } = req.body;
            const result = await pdfReadService_1.PDFReadService.summarizeJSONUrl(url);
            // Log the action
            await auditService_1.auditService.logUserAction(authReq.user.id, 'pdf_summarize_json_url', {
                url,
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
            logger_1.logger.error({ err: error, userId: authReq.user.id, operation: 'summarizeJSONUrl' }, 'Summarize JSON URL error');
            res.status(500).json({
                error: 'internal_error',
                message: 'Failed to summarize JSON URL'
            });
        }
    });
    // POST /pdfread/summarize/csv-url
    r.post('/summarize/csv-url', rateLimitMiddleware_1.authRateLimits.general, authMiddleware_1.authenticateToken, (0, validationMiddleware_1.validate)(validationMiddleware_1.pdfReadSchemas.summarizeUrl), async (req, res) => {
        const authReq = req;
        try {
            const { url } = req.body;
            const result = await pdfReadService_1.PDFReadService.summarizeCSVUrl(url);
            // Log the action
            await auditService_1.auditService.logUserAction(authReq.user.id, 'pdf_summarize_csv_url', {
                url,
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
            logger_1.logger.error({ err: error, userId: authReq.user.id, operation: 'summarizeCSVUrl' }, 'Summarize CSV URL error');
            res.status(500).json({
                error: 'internal_error',
                message: 'Failed to summarize CSV URL'
            });
        }
    });
    // POST /pdfread/summarize/txt-url
    r.post('/summarize/txt-url', rateLimitMiddleware_1.authRateLimits.general, authMiddleware_1.authenticateToken, (0, validationMiddleware_1.validate)(validationMiddleware_1.pdfReadSchemas.summarizeUrl), async (req, res) => {
        const authReq = req;
        try {
            const { url } = req.body;
            const result = await pdfReadService_1.PDFReadService.summarizeTXTUrl(url);
            // Log the action
            await auditService_1.auditService.logUserAction(authReq.user.id, 'pdf_summarize_txt_url', {
                url,
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
            logger_1.logger.error({ err: error, userId: authReq.user.id, operation: 'summarizeTXTUrl' }, 'Summarize TXT URL error');
            res.status(500).json({
                error: 'internal_error',
                message: 'Failed to summarize TXT URL'
            });
        }
    });
    // POST /pdfread/ask-file-question
    r.post('/ask-file-question', rateLimitMiddleware_1.authRateLimits.general, authMiddleware_1.authenticateToken, upload.single('file'), async (req, res) => {
        const authReq = req;
        try {
            if (!req.file) {
                return res.status(400).json({
                    error: 'no_file',
                    message: 'No file uploaded'
                });
            }
            const { question } = req.body;
            const result = await pdfReadService_1.PDFReadService.askFileQuestion(req.file.buffer, req.file.originalname, question, req.file.mimetype);
            // Log the action
            await auditService_1.auditService.logUserAction(authReq.user.id, 'pdf_ask_file_question', {
                fileName: req.file.originalname,
                fileSize: req.file.size,
                mimeType: req.file.mimetype,
                questionLength: question.length,
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
            logger_1.logger.error({ err: error, userId: authReq.user.id, operation: 'askFileQuestion' }, 'Ask file question error');
            res.status(500).json({
                error: 'internal_error',
                message: 'Failed to answer file question'
            });
        }
    });
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
    // GET /pdfread/health
    r.get('/health', async (req, res) => {
        try {
            const result = await pdfReadService_1.PDFReadService.healthCheck();
            if (result.success) {
                res.json(result);
            }
            else {
                res.status(503).json(result);
            }
        }
        catch (error) {
            logger_1.logger.error({ err: error, operation: 'healthCheck' }, 'Health check error');
            res.status(503).json({
                error: 'service_unavailable',
                message: 'PDFRead service is not available'
            });
        }
    });
    return r;
}
