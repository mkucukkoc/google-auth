import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { initSentry, sentryRequestHandler, sentryTracingHandler, sentryErrorHandler } from './utils/sentry';
import { config } from './config';
import { createAuthRouter } from './routes/auth';
import { createEmailOtpRouter } from './routes/emailOtp';
import { createGoogleAuthRouter } from './routes/google';
import { createAppleAuthRouter } from './routes/apple';
import { createPasswordResetRouter } from './routes/passwordReset';
import rateLimit from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './swagger';
import { cleanupRateLimits } from './middleware/rateLimitMiddleware';
import { SessionService } from './services/sessionService';
import { AuditService } from './services/auditService';
import { cacheService } from './services/cacheService';
import { databaseManager } from './config/database';
import { backupService } from './services/backupService';
import { dataRetentionService } from './services/dataRetentionService';
import { auditService } from './services/auditService';
import { initializeWebSocket } from './services/websocketService';
import { 
  globalErrorHandler, 
  notFound, 
  handleUnhandledRejection, 
  handleUncaughtException,
  requestLogger 
} from './middleware/errorHandler';
import { logger } from './utils/logger';

// Initialize Sentry first
initSentry();

// Initialize database and cache
const initializeServices = async () => {
  try {
    // Initialize database
    await databaseManager.initialize({
      projectId: process.env.FIREBASE_PROJECT_ID || '',
      privateKey: process.env.FIREBASE_PRIVATE_KEY || '',
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL || '',
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET || '',
      maxConnections: 100,
      maxIdleTime: 300000,
      connectionTimeout: 30000,
      requestTimeout: 60000,
    });

    // Test cache connection
    const cacheConnected = await cacheService.ping();
    if (!cacheConnected) {
      logger.warn('Cache service not available, continuing without cache');
    }

    logger.info('All services initialized successfully');
  } catch (error) {
    logger.error('Service initialization failed:', error);
    process.exit(1);
  }
};

// Initialize services before creating app
await initializeServices();

const app = express();

// Trust proxy for accurate IP addresses
app.set('trust proxy', 1);

// Sentry request handler (must be first)
app.use(sentryRequestHandler);
app.use(sentryTracingHandler);

// Request logging
app.use(requestLogger);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cors({ origin: config.corsOrigin, credentials: true }));
app.use(helmet());

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

// API Versioning
const API_VERSION = process.env.API_VERSION || 'v1';

// API routes with versioning
app.use(`/api/${API_VERSION}/auth`, createAuthRouter());
app.use(`/api/${API_VERSION}/auth/email`, createEmailOtpRouter());
app.use(`/api/${API_VERSION}/auth/google`, createGoogleAuthRouter());
app.use(`/api/${API_VERSION}/auth/apple`, createAppleAuthRouter());
app.use(`/api/${API_VERSION}/auth/password-reset`, createPasswordResetRouter());

// Legacy routes (backward compatibility)
app.use('/auth', createAuthRouter());
app.use('/auth/email', createEmailOtpRouter());
app.use('/auth/google', createGoogleAuthRouter());
app.use('/auth/apple', createAppleAuthRouter());
app.use('/auth/password-reset', createPasswordResetRouter());

// Start server
const server = app.listen(config.port, () => {
  logger.info({ port: config.port }, 'Server listening');
});

// Initialize WebSocket
initializeWebSocket(server);

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

// Error handling setup
handleUncaughtException();
handleUnhandledRejection();

// 404 handler (must be before error handler)
app.use(notFound);

// Sentry error handler (must be before other error handlers)
app.use(sentryErrorHandler);

// Global error handler (must be last)
app.use(globalErrorHandler);

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

// Data retention cleanup (run daily at 3 AM)
setInterval(async () => {
  try {
    const results = await dataRetentionService.runRetentionPolicies();
    const totalDeleted = results.reduce((sum, result) => sum + result.deletedCount, 0);
    logger.info(`Data retention cleanup completed: ${totalDeleted} documents deleted`);
  } catch (error) {
    logger.error('Data retention cleanup failed:', error);
  }
}, 24 * 60 * 60 * 1000); // 24 hours

// Backup tasks (run daily at 2 AM)
setInterval(async () => {
  try {
    const backupResult = await backupService.createFullBackup();
    if (backupResult.success) {
      logger.info(`Daily backup completed: ${backupResult.backupId}`);
    } else {
      logger.error(`Daily backup failed: ${backupResult.error}`);
    }
  } catch (error) {
    logger.error('Backup task failed:', error);
  }
}, 24 * 60 * 60 * 1000); // 24 hours

// Cleanup old backups (run weekly)
setInterval(async () => {
  try {
    const deletedCount = await backupService.cleanupOldBackups();
    logger.info(`Backup cleanup completed: ${deletedCount} old backups deleted`);
  } catch (error) {
    logger.error('Backup cleanup failed:', error);
  }
}, 7 * 24 * 60 * 60 * 1000); // 7 days

