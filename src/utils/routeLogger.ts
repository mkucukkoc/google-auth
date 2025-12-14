import { Router, Request } from 'express';
import { logger } from './logger';

type LogData = Record<string, unknown>;

export function attachRouteLogger(router: Router, routeName: string) {
  router.use((req, res, next) => {
    const startTime = Date.now();
    logRouteStep(routeName, 'request_received', buildRequestLog(req));
    res.on('finish', () => {
      logRouteStep(routeName, 'response_sent', {
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
        durationMs: Date.now() - startTime,
      });
    });
    next();
  });
}

export function logRouteStep(routeName: string, step: string, data: LogData = {}) {
  logger.info({ route: routeName, step, ...data }, '[RouteLogger]');
}

function buildRequestLog(req: Request): LogData {
  return {
    method: req.method,
    path: req.originalUrl,
    ip: (req as any).ip || (req as any).connection?.remoteAddress,
    hasBody: Boolean(req.body && Object.keys(req.body).length > 0),
    query: req.query,
  };
}

