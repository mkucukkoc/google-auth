import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pino from 'pino';
import pinoHttp from 'pino-http';
import { config } from './config';
import { createAuthRouter } from './routes/auth';
import { createEmailOtpRouter } from './routes/emailOtp';
import { createGoogleAuthRouter } from './routes/google';
import { createPasswordResetRouter } from './routes/passwordReset';
import rateLimit from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './swagger';
import { cleanupRateLimits } from './middleware/rateLimitMiddleware';
import { SessionService } from './services/sessionService';
import { AuditService } from './services/auditService';

const app = express();
const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

// Trust proxy for accurate IP addresses
app.set('trust proxy', 1);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cors({ origin: config.corsOrigin, credentials: true }));
app.use(helmet());
app.use(pinoHttp({ logger }));

// Global rate limiting
const limiter = rateLimit({ 
  windowMs: 60_000, 
  max: 100,
  message: {
    error: 'rate_limit_exceeded',
    message: 'Too many requests from this IP, please try again later.'
  }
});
app.use(limiter);

// Swagger documentation
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Health check
app.get('/health', (_req, res) => {
  res.json({ 
    ok: true, 
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0'
  });
});

// API routes
app.use('/auth', createAuthRouter());
app.use('/auth/email', createEmailOtpRouter());
app.use('/auth/google', createGoogleAuthRouter());
app.use('/auth/password-reset', createPasswordResetRouter());

// Start server
const server = app.listen(config.port, () => {
  logger.info({ port: config.port }, 'Server listening');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(() => {
    logger.info('Process terminated');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  server.close(() => {
    logger.info('Process terminated');
    process.exit(0);
  });
});

// Cleanup tasks (run every hour)
setInterval(async () => {
  try {
    const { PasswordResetService } = await import('./services/passwordResetService');
    await Promise.all([
      SessionService.cleanupExpiredSessions(),
      AuditService.cleanupOldAuditLogs(90), // Keep 90 days
      PasswordResetService.cleanupExpiredTokens(),
      cleanupRateLimits(),
    ]);
    logger.info('Cleanup tasks completed');
  } catch (error) {
    logger.error({ error }, 'Cleanup tasks failed');
  }
}, 60 * 60 * 1000); // 1 hour

