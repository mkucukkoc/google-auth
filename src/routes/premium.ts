import { Router, Request, Response } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/authMiddleware';
import { validate, premiumSchemas } from '../middleware/validationMiddleware';
import { ResponseBuilder } from '../types/response';
import { premiumService, PremiumServiceError } from '../services/premiumService';
import { logger } from '../utils/logger';

export function createPremiumRouter(): Router {
  const router = Router();

  router.post(
    '/customer-info',
    authenticateToken,
    validate(premiumSchemas.customerInfo),
    async (req: Request, res: Response) => {
      const authReq = req as AuthRequest;
      if (!authReq.user) {
        return res.status(401).json(ResponseBuilder.error('unauthorized', 'Authentication required'));
      }

      logger.info(
        {
          userId: authReq.user.id,
          source: req.body?.source,
          platform: req.body?.platform,
        },
        'Premium customer-info sync request'
      );

      try {
        const result = await premiumService.syncFromCustomerInfo(authReq.user.id, req.body);
        logger.info({ userId: authReq.user.id, premium: result.premium }, 'Premium customer-info sync success');
        return res.json(ResponseBuilder.success(result, 'Premium bilgileri güncellendi'));
      } catch (error) {
        return handlePremiumError(res, error);
      }
    }
  );

  router.post(
    '/restore',
    authenticateToken,
    validate(premiumSchemas.restore),
    async (req: Request, res: Response) => {
      const authReq = req as AuthRequest;
      if (!authReq.user) {
        return res.status(401).json(ResponseBuilder.error('unauthorized', 'Authentication required'));
      }

      logger.info({ userId: authReq.user.id }, 'Premium restore request');

      try {
        const result = await premiumService.restoreFromRevenueCat(authReq.user.id, {
          appUserId: req.body?.appUserId,
          requestId: req.body?.requestId,
        });
        logger.info({ userId: authReq.user.id, premium: result.premium }, 'Premium restore success');
        return res.json(
          ResponseBuilder.success(
            result,
            result.premium ? 'Satın almalarınız geri yüklendi' : 'Aktif abonelik bulunamadı'
          )
        );
      } catch (error) {
        return handlePremiumError(res, error);
      }
    }
  );

  router.post(
    '/sync',
    authenticateToken,
    validate(premiumSchemas.restore),
    async (req: Request, res: Response) => {
      const authReq = req as AuthRequest;
      if (!authReq.user) {
        return res.status(401).json(ResponseBuilder.error('unauthorized', 'Authentication required'));
      }

      logger.info({ userId: authReq.user.id }, 'Premium manual sync request');

      try {
        const result = await premiumService.syncFromRevenueCat(authReq.user.id, {
          appUserId: req.body?.appUserId,
          requestId: req.body?.requestId,
          source: req.body?.source,
        });
        logger.info({ userId: authReq.user.id, premium: result.premium }, 'Premium manual sync success');
        return res.json(ResponseBuilder.success(result, 'Premium bilgileri RevenueCat ile senkronize edildi'));
      } catch (error) {
        return handlePremiumError(res, error);
      }
    }
  );

  router.get('/status', authenticateToken, async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    if (!authReq.user) {
      return res.status(401).json(ResponseBuilder.error('unauthorized', 'Authentication required'));
    }

    try {
      const status = await premiumService.getStatus(authReq.user.id);
      if (!status) {
        return res.status(404).json(ResponseBuilder.error('NOT_FOUND', 'Premium kaydı bulunamadı'));
      }
      return res.json(ResponseBuilder.success(status));
    } catch (error) {
      logger.error({ err: error, userId: authReq.user.id }, 'Failed to fetch premium status');
      return res.status(500).json(ResponseBuilder.error('PREMIUM_STATUS_FAILED', 'Premium durumu alınamadı'));
    }
  });

  return router;
}

function handlePremiumError(res: Response, error: any) {
  if (error instanceof PremiumServiceError) {
    const logPayload = { err: error, code: error.code };
    if (error.code === 'ENTITLEMENT_NOT_FOUND') {
      logger.info(logPayload, 'Premium service info: entitlement not found');
    } else {
      logger.warn(logPayload, 'Premium service error');
    }
    return res.status(error.status).json(ResponseBuilder.error(error.code, error.message));
  }

  logger.error({ err: error }, 'Premium endpoint failure');
  return res.status(500).json(ResponseBuilder.error('PREMIUM_OPERATION_FAILED', 'Premium işlemi tamamlanamadı'));
}

