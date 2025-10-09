"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPDFSummaryRouter = createPDFSummaryRouter;
const express_1 = require("express");
const pdfService_1 = require("../services/pdfService");
const authMiddleware_1 = require("../middleware/authMiddleware");
const validationMiddleware_1 = require("../middleware/validationMiddleware");
const rateLimitMiddleware_1 = require("../middleware/rateLimitMiddleware");
const auditService_1 = require("../services/auditService");
const logger_1 = require("../utils/logger");
const firebase_1 = require("../firebase");
const firebase_admin_1 = __importDefault(require("firebase-admin"));
function createPDFSummaryRouter() {
    const router = (0, express_1.Router)();
    /**
     * PDF özetleme endpoint'i
     * POST /api/v1/pdf/summarize
     */
    router.post('/summarize', rateLimitMiddleware_1.authRateLimits.pdfSummary, authMiddleware_1.authenticateToken, (0, validationMiddleware_1.validate)(validationMiddleware_1.pdfSummarySchemas.summarize), async (req, res) => {
        const requestId = Math.random().toString(36).substring(7);
        const startTime = Date.now();
        try {
            const { fileUrl, chatId } = req.body;
            const userId = req.user.id;
            logger_1.logger.info({
                requestId,
                userId,
                chatId,
                fileUrl,
                operation: 'pdfSummarize'
            }, 'PDF summarization request received');
            // PDF dosyasının geçerliliğini kontrol et
            const isValidPDF = await pdfService_1.PDFService.validatePDF(fileUrl);
            if (!isValidPDF) {
                logger_1.logger.warn({
                    requestId,
                    userId,
                    fileUrl,
                    operation: 'pdfSummarize'
                }, 'Invalid PDF file provided');
                return res.status(400).json({
                    success: false,
                    error: {
                        code: 'invalid_pdf_file',
                        message: 'Geçersiz PDF dosyası. Dosya PDF formatında ve 25MB\'dan küçük olmalıdır.'
                    }
                });
            }
            // PDF'den metin çıkar ve özet oluştur
            const result = await pdfService_1.PDFService.extractAndSummarizePDF({
                fileUrl,
                userId,
                chatId
            });
            if (!result.success) {
                logger_1.logger.error({
                    requestId,
                    userId,
                    chatId,
                    error: result.error,
                    operation: 'pdfSummarize'
                }, 'PDF summarization failed');
                return res.status(400).json(result);
            }
            // Özeti Firebase'e kaydet
            await savePDFSummaryToFirestore(userId, chatId, result.data, requestId);
            // Audit log
            await auditService_1.auditService.logEvent({
                userId,
                action: 'pdf_summarized',
                resource: 'pdf_summary',
                success: true,
                details: {
                    chatId,
                    fileUrl,
                    pageCount: result.data.pageCount,
                    wordCount: result.data.wordCount,
                    summaryLength: result.data.summary.length
                }
            });
            const processingTime = Date.now() - startTime;
            logger_1.logger.info({
                requestId,
                userId,
                chatId,
                pageCount: result.data.pageCount,
                wordCount: result.data.wordCount,
                summaryLength: result.data.summary.length,
                processingTime,
                operation: 'pdfSummarize'
            }, 'PDF summarization completed successfully');
            res.json({
                ...result,
                processingTime
            });
        }
        catch (error) {
            const processingTime = Date.now() - startTime;
            logger_1.logger.error({
                requestId,
                err: error,
                userId: req.user?.id,
                processingTime,
                operation: 'pdfSummarize'
            }, 'PDF summarization request failed');
            res.status(500).json({
                success: false,
                error: {
                    code: 'internal_server_error',
                    message: 'Sunucu hatası oluştu'
                }
            });
        }
    });
    /**
     * PDF özet geçmişi endpoint'i
     * GET /api/v1/pdf/history/:chatId
     */
    router.get('/history/:chatId', rateLimitMiddleware_1.authRateLimits.pdfHistory, authMiddleware_1.authenticateToken, async (req, res) => {
        const requestId = Math.random().toString(36).substring(7);
        try {
            const { chatId } = req.params;
            const userId = req.user.id;
            logger_1.logger.info({
                requestId,
                userId,
                chatId,
                operation: 'pdfHistory'
            }, 'PDF summary history request received');
            // Firebase'den PDF özet geçmişini getir
            const summariesRef = firebase_1.db.collection('users')
                .doc(userId)
                .collection('chats')
                .doc(chatId)
                .collection('pdfSummaries')
                .orderBy('createdAt', 'desc')
                .limit(50);
            const snapshot = await summariesRef.get();
            const summaries = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            logger_1.logger.info({
                requestId,
                userId,
                chatId,
                summaryCount: summaries.length,
                operation: 'pdfHistory'
            }, 'PDF summary history retrieved successfully');
            res.json({
                success: true,
                data: {
                    summaries,
                    count: summaries.length
                },
                message: 'PDF özet geçmişi başarıyla alındı'
            });
        }
        catch (error) {
            logger_1.logger.error({
                requestId,
                err: error,
                userId: req.user?.id,
                chatId: req.params.chatId,
                operation: 'pdfHistory'
            }, 'PDF summary history request failed');
            res.status(500).json({
                success: false,
                error: {
                    code: 'internal_server_error',
                    message: 'Sunucu hatası oluştu'
                }
            });
        }
    });
    return router;
}
/**
 * PDF özetini Firebase'e kaydet
 */
async function savePDFSummaryToFirestore(userId, chatId, summaryData, requestId) {
    try {
        logger_1.logger.info({
            requestId,
            userId,
            chatId,
            operation: 'savePDFSummary'
        }, 'Saving PDF summary to Firestore');
        const summaryRef = firebase_1.db.collection('users')
            .doc(userId)
            .collection('chats')
            .doc(chatId)
            .collection('pdfSummaries')
            .doc();
        const summaryDoc = {
            id: summaryRef.id,
            chatId,
            userId,
            summary: summaryData.summary,
            pageCount: summaryData.pageCount,
            wordCount: summaryData.wordCount,
            extractedText: summaryData.extractedText.substring(0, 1000) + '...', // İlk 1000 karakter
            processingTime: summaryData.processingTime,
            createdAt: firebase_admin_1.default.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase_admin_1.default.firestore.FieldValue.serverTimestamp()
        };
        await summaryRef.set(summaryDoc);
        logger_1.logger.info({
            requestId,
            userId,
            chatId,
            summaryId: summaryRef.id,
            operation: 'savePDFSummary'
        }, 'PDF summary saved to Firestore successfully');
    }
    catch (error) {
        logger_1.logger.error({
            requestId,
            err: error,
            userId,
            chatId,
            operation: 'savePDFSummary'
        }, 'Failed to save PDF summary to Firestore');
        throw error;
    }
}
