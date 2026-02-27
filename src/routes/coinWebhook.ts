import { Router, Request, Response } from 'express';
import { validate, coinSchemas } from '../middleware/validationMiddleware';
import { ResponseBuilder } from '../types/response';
import { coinService, CoinServiceError } from '../services/coinService';
import { attachRouteLogger } from '../utils/routeLogger';
import { logger } from '../utils/logger';

export function createCoinWebhookRouter(): Router {
  const router = Router();
  attachRouteLogger(router, 'coinWebhook');

  const webhookSecret = (process.env.COIN_WEBHOOK_SECRET || '').trim();

  const handleError = (res: Response, error: unknown) => {
    const message = error instanceof Error ? error.message : 'Webhook hatası';
    if (error instanceof CoinServiceError) {
      return res.status(400).json(ResponseBuilder.error(error.code, message));
    }
    logger.error({ error }, '[CoinWebhook] unexpected error');
    return res.status(500).json(ResponseBuilder.error('WEBHOOK_ERROR', message));
  };

  router.post('/', validate(coinSchemas.webhook), async (req: Request, res: Response) => {
    if (webhookSecret) {
      const receivedSecret = String(req.headers['x-webhook-secret'] || '').trim();
      if (!receivedSecret || receivedSecret !== webhookSecret) {
        return res.status(401).json(ResponseBuilder.error('WEBHOOK_UNAUTHORIZED', 'Webhook doğrulama hatası'));
      }
    }

    try {
      const result = await coinService.handleWebhook({
        provider: req.body?.provider,
        eventId: req.body?.eventId,
        uid: req.body?.uid,
        productId: req.body?.productId,
        status: req.body?.status,
        coins: req.body?.coins,
        metadata: req.body?.metadata,
      });
      return res.json(ResponseBuilder.success(result, 'Webhook işlendi'));
    } catch (error) {
      return handleError(res, error);
    }
  });

  return router;
}
