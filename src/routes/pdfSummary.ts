import { Router, Request, Response } from 'express';
import { PDFService } from '../services/pdfService';
import { authenticateToken, AuthRequest } from '../middleware/authMiddleware';
import { validate, pdfSummarySchemas } from '../middleware/validationMiddleware';
import { authRateLimits } from '../middleware/rateLimitMiddleware';
import { auditService } from '../services/auditService';
import { logger } from '../utils/logger';
import { db, FieldValue } from '../firebase';
import { admin } from '../firebase';
import { attachRouteLogger } from '../utils/routeLogger';

export function createPDFSummaryRouter(): Router {
  const router = Router();
  attachRouteLogger(router, 'pdfSummary');

  /**
   * PDF özetleme endpoint'i
   * POST /api/v1/pdf/summarize
   */
  router.post('/summarize', 
    authRateLimits.pdfSummary,
    authenticateToken,
    validate(pdfSummarySchemas.summarize),
    async (req: AuthRequest, res: Response) => {
      const requestId = Math.random().toString(36).substring(7);
      const startTime = Date.now();
      
      try {
        const { fileUrl, chatId } = req.body;
        const userId = req.user!.id;

        logger.info({
          requestId,
          userId,
          chatId,
          fileUrl,
          operation: 'pdfSummarize'
        }, 'PDF summarization request received');

        // PDF dosyasının geçerliliğini kontrol et
        const isValidPDF = await PDFService.validatePDF(fileUrl);
        if (!isValidPDF) {
          logger.warn({
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
        const result = await PDFService.extractAndSummarizePDF({
          fileUrl,
          userId,
          chatId
        });

        if (!result.success) {
          logger.error({
            requestId,
            userId,
            chatId,
            error: result.error,
            operation: 'pdfSummarize'
          }, 'PDF summarization failed');

          return res.status(400).json(result);
        }

        // Özeti Firebase'e kaydet
        await savePDFSummaryToFirestore(userId, chatId, result.data!, requestId);

        // Audit log
        await auditService.logEvent({
          userId,
          action: 'pdf_summarized',
          resource: 'pdf_summary',
          success: true,
          details: {
            chatId,
            fileUrl,
            pageCount: result.data!.pageCount,
            wordCount: result.data!.wordCount,
            summaryLength: result.data!.summary.length
          }
        });

        const processingTime = Date.now() - startTime;
        logger.info({
          requestId,
          userId,
          chatId,
          pageCount: result.data!.pageCount,
          wordCount: result.data!.wordCount,
          summaryLength: result.data!.summary.length,
          processingTime,
          operation: 'pdfSummarize'
        }, 'PDF summarization completed successfully');

        res.json({
          ...result,
          processingTime
        });

      } catch (error: any) {
        const processingTime = Date.now() - startTime;
        logger.error({
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
    }
  );

  /**
   * PDF özet geçmişi endpoint'i
   * GET /api/v1/pdf/history/:chatId
   */
  router.get('/history/:chatId',
    authRateLimits.pdfHistory,
    authenticateToken,
    async (req: AuthRequest, res: Response) => {
      const requestId = Math.random().toString(36).substring(7);
      
      try {
        const { chatId } = req.params;
        const userId = req.user!.id;

        logger.info({
          requestId,
          userId,
          chatId,
          operation: 'pdfHistory'
        }, 'PDF summary history request received');

        // Firebase'den PDF özet geçmişini getir
        const summariesRef = db.collection('users')
          .doc(userId)
          .collection('chats')
          .doc(chatId)
          .collection('pdfSummaries')
          .orderBy('createdAt', 'desc')
          .limit(50);

        const snapshot = await summariesRef.get();
        const summaries = snapshot.docs.map((doc: any) => ({
          id: doc.id,
          ...doc.data()
        }));

        logger.info({
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

      } catch (error: any) {
        logger.error({
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
    }
  );

  return router;
}

/**
 * PDF özetini Firebase'e kaydet
 */
async function savePDFSummaryToFirestore(
  userId: string, 
  chatId: string, 
  summaryData: any, 
  requestId: string
): Promise<void> {
  try {
    logger.info({
      requestId,
      userId,
      chatId,
      operation: 'savePDFSummary'
    }, 'Saving PDF summary to Firestore');

    const summaryRef = db.collection('users')
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
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    };

    await summaryRef.set(summaryDoc);

    logger.info({
      requestId,
      userId,
      chatId,
      summaryId: summaryRef.id,
      operation: 'savePDFSummary'
    }, 'PDF summary saved to Firestore successfully');

  } catch (error: any) {
    logger.error({
      requestId,
      err: error,
      userId,
      chatId,
      operation: 'savePDFSummary'
    }, 'Failed to save PDF summary to Firestore');
    
    throw error;
  }
}
