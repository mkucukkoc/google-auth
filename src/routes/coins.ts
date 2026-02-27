import { Router, Request, Response } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/authMiddleware';
import { validate, coinSchemas } from '../middleware/validationMiddleware';
import { ResponseBuilder } from '../types/response';
import { coinService, CoinServiceError } from '../services/coinService';
import { attachRouteLogger } from '../utils/routeLogger';
import { logger } from '../utils/logger';

export function createCoinRouter(): Router {
  const router = Router();
  attachRouteLogger(router, 'coins');

  const handleError = (res: Response, error: unknown) => {
    const message = error instanceof Error ? error.message : 'Coin işleminde hata oluştu';
    if (error instanceof CoinServiceError) {
      const status =
        error.code === 'INSUFFICIENT_COINS'
          ? 402
          : error.code === 'JOB_FORBIDDEN'
            ? 403
            : 400;
      return res.status(status).json(ResponseBuilder.error(error.code, message));
    }
    logger.error({ error }, '[CoinsRoute] unexpected error');
    return res.status(500).json(ResponseBuilder.error('COIN_ERROR', message));
  };

  router.get('/balance', authenticateToken, async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    if (!authReq.user) {
      return res.status(401).json(ResponseBuilder.error('unauthorized', 'Authentication required'));
    }

    try {
      const balance = await coinService.getBalance(authReq.user.id);
      return res.json(ResponseBuilder.success(balance, 'Coin bakiyesi getirildi'));
    } catch (error) {
      return handleError(res, error);
    }
  });

  router.post(
    '/purchase/verify',
    authenticateToken,
    validate(coinSchemas.purchaseVerify),
    async (req: Request, res: Response) => {
      const authReq = req as AuthRequest;
      if (!authReq.user) {
        return res.status(401).json(ResponseBuilder.error('unauthorized', 'Authentication required'));
      }

      try {
        const result = await coinService.verifyPurchase({
          uid: authReq.user.id,
          provider: req.body?.provider,
          productId: req.body?.productId,
          transactionId: req.body?.transactionId,
          providerEventId: req.body?.providerEventId,
          platform: req.body?.platform,
          coins: req.body?.coins,
          metadata: {
            ...req.body?.metadata,
            purchaseToken: req.body?.purchaseToken,
            receipt: req.body?.receipt,
          },
        });
        return res.json(ResponseBuilder.success(result, 'Coin satın alma işlendi'));
      } catch (error) {
        return handleError(res, error);
      }
    }
  );

  router.post(
    '/spend-and-create-job',
    authenticateToken,
    validate(coinSchemas.spendAndCreateJob),
    async (req: Request, res: Response) => {
      const authReq = req as AuthRequest;
      if (!authReq.user) {
        return res.status(401).json(ResponseBuilder.error('unauthorized', 'Authentication required'));
      }

      try {
        const result = await coinService.spendAndCreateJob({
          uid: authReq.user.id,
          kind: req.body?.kind,
          costCoins: req.body?.costCoins,
          input: req.body?.input,
          requestId: req.body?.requestId,
        });
        return res.json(ResponseBuilder.success(result, 'Job oluşturuldu'));
      } catch (error) {
        return handleError(res, error);
      }
    }
  );

  return router;
}
