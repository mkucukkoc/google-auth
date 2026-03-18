import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { pushNotificationService } from '../services/pushNotificationService';
import { logger } from '../utils/logger';
import { coinService } from '../services/coinService';

const router = Router();

const payloadSchema = z.object({
  request_id: z.string().optional(),
  user_id: z.string().min(1),
  status: z.enum(['success', 'failed']),
  kind: z.enum(['video', 'photo']).optional(),
  style_type: z.string().optional(),
  style_id: z.string().optional(),
  title: z.string().optional(),
  output_url: z.string().optional(),
  error_message: z.string().optional(),
});

router.post('/generation-status', async (req: Request, res: Response) => {
  try {
    const secret = process.env.GENERATION_WEBHOOK_SECRET || '';
    const provided = String(req.headers['x-webhook-secret'] || '');
    if (secret && secret !== provided) {
      logger.warn(
        {
          provided: provided ? '***' : '',
          hasSecret: !!secret,
        },
        'Generation webhook unauthorized'
      );
      return res.status(401).json({
        success: false,
        error: { code: 'unauthorized', message: 'Invalid webhook secret' },
      });
    }

    const payload = payloadSchema.parse(req.body);
    logger.info({ payload }, 'Generation webhook received');

    if (payload.request_id) {
      try {
        const output =
          payload.status === 'success'
            ? {
                url: payload.output_url || null,
                styleId: payload.style_id || null,
                styleType: payload.style_type || null,
                title: payload.title || null,
                requestId: payload.request_id,
              }
            : {
                error: payload.error_message || 'generation_failed',
                styleId: payload.style_id || null,
                styleType: payload.style_type || null,
                requestId: payload.request_id,
              };
        const jobResult = await coinService.updateJobByRequestId({
          uid: payload.user_id,
          requestId: payload.request_id,
          status: payload.status,
          output,
        });
        logger.info(
          {
            requestId: payload.request_id,
            userId: payload.user_id,
            status: payload.status,
            jobResult: jobResult ? { jobId: jobResult.jobId, charged: (jobResult as any)?.charged } : null,
          },
          'Generation webhook job update completed'
        );
      } catch (error) {
        logger.error(
          { err: error, requestId: payload.request_id, userId: payload.user_id },
          'Generation webhook job update failed'
        );
      }
    } else {
      logger.warn({ userId: payload.user_id, status: payload.status }, 'Generation webhook missing request_id');
    }
    const kindLabel = payload.kind || (payload.style_type === 'video' ? 'video' : 'fotograf');
    const styleLabel = payload.title ? `${payload.title} ` : '';
    const title = payload.status === 'success' ? 'Istek Hazir' : 'Istek Basarisiz';
    const body =
      payload.status === 'success'
        ? `${styleLabel}${kindLabel} isteginiz olustu. Kayitli ekranindan ulasabilirsiniz.`
        : `${styleLabel}${kindLabel} isteginiz basarisiz oldu. Lutfen tekrar deneyin.`;

    await pushNotificationService.sendPushNotificationToUser(payload.user_id, {
      title,
      body,
      data: {
        requestId: payload.request_id,
        status: payload.status,
        styleType: payload.style_type,
        styleId: payload.style_id,
        outputUrl: payload.output_url,
        errorMessage: payload.error_message,
      },
    });
    logger.info(
      {
        userId: payload.user_id,
        status: payload.status,
        requestId: payload.request_id,
      },
      'Generation webhook notification dispatched'
    );

    return res.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, 'Generation webhook failed');
    return res.status(500).json({
      success: false,
      error: { code: 'internal_error', message: 'Webhook processing failed' },
    });
  }
});

export default router;
