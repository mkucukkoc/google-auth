import { Router, Request, Response } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/authMiddleware';
import { ResponseBuilder } from '../types/response';
import { coinService, CoinServiceError } from '../services/coinService';
import { attachRouteLogger } from '../utils/routeLogger';
import { logger } from '../utils/logger';
import { validate, coinSchemas } from '../middleware/validationMiddleware';

export function createCoinJobsRouter(): Router {
  const router = Router();
  attachRouteLogger(router, 'coinJobs');

  const handleError = (res: Response, error: unknown) => {
    const message = error instanceof Error ? error.message : 'Job sorgulama hatası';
    if (error instanceof CoinServiceError) {
      const status = error.code === 'JOB_FORBIDDEN' ? 403 : 400;
      return res.status(status).json(ResponseBuilder.error(error.code, message));
    }
    logger.error({ error }, '[CoinJobsRoute] unexpected error');
    return res.status(500).json(ResponseBuilder.error('JOB_ERROR', message));
  };

  router.get('/:jobId', authenticateToken, async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    if (!authReq.user) {
      return res.status(401).json(ResponseBuilder.error('unauthorized', 'Authentication required'));
    }

    const jobId = req.params?.jobId;
    if (!jobId) {
      return res.status(400).json(ResponseBuilder.error('JOB_ID_REQUIRED', 'jobId zorunludur'));
    }

    try {
      const job = await coinService.getJob(authReq.user.id, jobId);
      if (!job) {
        return res.status(404).json(ResponseBuilder.error('NOT_FOUND', 'Job bulunamadı'));
      }
      return res.json(ResponseBuilder.success(job, 'Job getirildi'));
    } catch (error) {
      return handleError(res, error);
    }
  });

  router.patch(
    '/:jobId',
    authenticateToken,
    validate(coinSchemas.jobUpdate),
    async (req: Request, res: Response) => {
      const authReq = req as AuthRequest;
      if (!authReq.user) {
        return res.status(401).json(ResponseBuilder.error('unauthorized', 'Authentication required'));
      }

      const jobId = req.params?.jobId;
      if (!jobId) {
        return res.status(400).json(ResponseBuilder.error('JOB_ID_REQUIRED', 'jobId zorunludur'));
      }

      try {
        const result = await coinService.updateJob({
          uid: authReq.user.id,
          jobId,
          status: req.body?.status,
          output: req.body?.output,
        });
        return res.json(ResponseBuilder.success(result, 'Job güncellendi'));
      } catch (error) {
        return handleError(res, error);
      }
    }
  );

  return router;
}
