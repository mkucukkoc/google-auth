import { Router, Request, Response } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/authMiddleware';
import { authRateLimits } from '../middleware/rateLimitMiddleware';
import { validate, deleteAccountSchemas, validateParams } from '../middleware/validationMiddleware';
import { deleteAccountService, DeleteAccountError } from '../services/deleteAccountService';
import { dataExportService } from '../services/dataExportService';
import { DeleteAccountRequestBody } from '../types/deleteAccount';
import { ResponseBuilder } from '../types/response';
import { logger } from '../utils/logger';
import { config } from '../config';

export function createDeleteAccountRouter(): Router {
  const r = Router();

  r.post(
    '/',
    authRateLimits.deleteAccount,
    authenticateToken,
    validate(deleteAccountSchemas.initiate),
    async (req: Request, res: Response) => {
      const authReq = req as AuthRequest;
      if (!authReq.user) {
        return res.status(401).json(ResponseBuilder.error('unauthorized', 'Authentication required'));
      }

      const body = req.body as DeleteAccountRequestBody;

      try {
        const result = await deleteAccountService.initiateDeletion(authReq.user.id, body, {
          ipAddress: req.ip,
          userAgent: req.get('User-Agent') || undefined,
          country: req.get('x-country') || undefined,
          city: req.get('x-city') || undefined,
        });
        return res
          .status(202)
          .json(ResponseBuilder.success(result, 'Delete account işlemi başlatıldı'));
      } catch (error) {
        return handleDeleteAccountError(res, error);
      }
    }
  );

  r.post(
    '/export',
    authenticateToken,
    validate(deleteAccountSchemas.dataExport),
    async (req: Request, res: Response) => {
      const authReq = req as AuthRequest;
      if (!authReq.user) {
        return res.status(401).json(ResponseBuilder.error('unauthorized', 'Authentication required'));
      }

      if (!config.deleteAccount.dataExportEnabled) {
        return res
          .status(403)
          .json(
            ResponseBuilder.error(
              'EXPORT_DISABLED',
              'Veri indirme özelliği bu ortamda devre dışı bırakıldı'
            )
          );
      }

      try {
        const archive = await dataExportService.generateUserExport(authReq.user.id);
        return res.json(ResponseBuilder.success(archive, 'Veri arşiviniz hazır'));
      } catch (error) {
        logger.error({ err: error, userId: authReq.user.id }, 'Data export failed');
        return res
          .status(500)
          .json(ResponseBuilder.error('EXPORT_FAILED', 'Veri arşivi oluşturulamadı'));
      }
    }
  );

  r.post(
    '/restore',
    authenticateToken,
    validate(deleteAccountSchemas.restore),
    async (req: Request, res: Response) => {
      const authReq = req as AuthRequest;
      if (!authReq.user) {
        return res.status(401).json(ResponseBuilder.error('unauthorized', 'Authentication required'));
      }

      try {
        const result = await deleteAccountService.restoreAccount(authReq.user.id, {
          ipAddress: req.ip,
          userAgent: req.get('User-Agent') || undefined,
        });
        return res.json(ResponseBuilder.success(result, 'Hesap geri alındı'));
      } catch (error) {
        return handleDeleteAccountError(res, error);
      }
    }
  );

  r.get(
    '/jobs/:jobId',
    authenticateToken,
    validateParams(deleteAccountSchemas.jobParams),
    async (req: Request, res: Response) => {
      const authReq = req as AuthRequest;
      if (!authReq.user) {
        return res.status(401).json(ResponseBuilder.error('unauthorized', 'Authentication required'));
      }
      const { jobId } = req.params;
      try {
        const job = await deleteAccountService.getJob(jobId);
        if (!job || job.userId !== authReq.user.id) {
          return res
            .status(404)
            .json(ResponseBuilder.error('JOB_NOT_FOUND', 'Silme kaydı bulunamadı'));
        }
        return res.json(ResponseBuilder.success(job));
      } catch (error) {
        logger.error({ err: error, jobId }, 'Failed to fetch delete job');
        return res
          .status(500)
          .json(ResponseBuilder.error('JOB_LOOKUP_FAILED', 'İşlem geçmişi alınamadı'));
      }
    }
  );

  r.get('/jobs/latest', authenticateToken, async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    if (!authReq.user) {
      return res.status(401).json(ResponseBuilder.error('unauthorized', 'Authentication required'));
    }

    try {
      const job = await deleteAccountService.getLatestJobForUser(authReq.user.id);
      if (!job) {
        return res
          .status(404)
          .json(ResponseBuilder.error('JOB_NOT_FOUND', 'Herhangi bir silme kaydı yok'));
      }
      return res.json(ResponseBuilder.success(job));
    } catch (error) {
      logger.error({ err: error, userId: authReq.user.id }, 'Failed to fetch latest job');
      return res
        .status(500)
        .json(ResponseBuilder.error('JOB_LOOKUP_FAILED', 'İşlem geçmişi alınamadı'));
    }
  });

  return r;
}

function handleDeleteAccountError(res: Response, error: unknown) {
  if (error instanceof DeleteAccountError) {
    return res.status(error.status).json(ResponseBuilder.error(error.code, error.message, error.details));
  }
  logger.error({ err: error }, 'Delete account endpoint failed');
  return res
    .status(500)
    .json(ResponseBuilder.error('DELETE_FAILED', 'Delete account işlemi tamamlanamadı'));
}


