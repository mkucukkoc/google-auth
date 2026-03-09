import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticateToken, AuthRequest } from '../middleware/authMiddleware';
import { validate } from '../middleware/validationMiddleware';
import { ResponseBuilder } from '../types/response';
import { attachRouteLogger } from '../utils/routeLogger';
import { logger } from '../utils/logger';
import { db, FieldValue } from '../firebase';

const reportSchema = z.object({
  contentType: z.enum(['chat_message', 'image', 'video', 'audio', 'file', 'other']).optional().default('other'),
  reason: z.string().min(2).max(120),
  details: z.string().max(2000).optional(),
  contentText: z.string().max(6000).optional(),
  contentUrl: z.string().max(6000).optional(),
  contentLocalUri: z.string().max(6000).optional(),
  contentDataPreview: z.string().max(400).optional(),
  inputImagePath: z.string().max(6000).optional(),
  outputImagePath: z.string().max(6000).optional(),
  messageId: z.string().max(200).optional(),
  chatId: z.string().max(200).optional(),
  source: z.string().max(100).optional(),
  context: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
});

export function createReportRouter(): Router {
  const router = Router();
  attachRouteLogger(router, 'reports');

  router.post(
    '/',
    authenticateToken,
    validate(reportSchema),
    async (req: Request, res: Response) => {
      const authReq = req as AuthRequest;
      if (!authReq.user) {
        return res.status(401).json(ResponseBuilder.error('unauthorized', 'Authentication required'));
      }

      try {
        const userId = authReq.user.id;
        const now = new Date();
        const dateSlug = now.toISOString().replace('T', '_').replace('Z', '').replace(/[:.-]/g, '');
        const reportId = `${userId}_${dateSlug}`;
        const reportRef = db.collection('reports').doc(reportId);
        const payload = {
          userId,
          contentType: req.body?.contentType || 'other',
          reason: req.body?.reason,
          details: req.body?.details || '',
          contentText: req.body?.contentText || '',
          contentUrl: req.body?.contentUrl || '',
          contentLocalUri: req.body?.contentLocalUri || '',
          contentDataPreview: req.body?.contentDataPreview || '',
          inputImagePath: req.body?.inputImagePath || '',
          outputImagePath: req.body?.outputImagePath || '',
          messageId: req.body?.messageId || '',
          chatId: req.body?.chatId || '',
          source: req.body?.source || 'app',
          context: req.body?.context || {},
          createdAt: FieldValue.serverTimestamp(),
          createdAtIso: now.toISOString(),
          createdDate: dateSlug,
        };

        logger.info(
          {
            userId,
            reportId,
            contentType: payload.contentType,
            reason: payload.reason,
            source: payload.source,
            hasDetails: Boolean(payload.details),
            hasContentUrl: Boolean(payload.contentUrl),
            hasLocalUri: Boolean(payload.contentLocalUri),
            hasDataPreview: Boolean(payload.contentDataPreview),
            hasInputPath: Boolean(payload.inputImagePath),
            hasOutputPath: Boolean(payload.outputImagePath),
          },
          '[ReportsRoute] Report received'
        );

        await reportRef.set(payload);

        return res.json(
          ResponseBuilder.success(
            { reportId: reportRef.id },
            'Report submitted'
          )
        );
      } catch (error) {
        logger.error({ error }, '[ReportsRoute] Failed to submit report');
        return res.status(500).json(ResponseBuilder.error('REPORT_ERROR', 'Failed to submit report'));
      }
    }
  );

  return router;
}
