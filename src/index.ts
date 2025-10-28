import 'dotenv/config';

// Polyfill for DOMMatrix (required by pdf-parse in server environment)
if (typeof globalThis.DOMMatrix === 'undefined') {
  globalThis.DOMMatrix = class DOMMatrix {
    constructor(init?: string | number[]) {
      // Simple DOMMatrix implementation for server-side
      this.a = 1;
      this.b = 0;
      this.c = 0;
      this.d = 1;
      this.e = 0;
      this.f = 0;
      
      if (init) {
        if (typeof init === 'string') {
          // Parse matrix string
          const values = init.replace(/matrix\(|\)/g, '').split(',').map(Number);
          if (values.length === 6) {
            [this.a, this.b, this.c, this.d, this.e, this.f] = values;
          }
        } else if (Array.isArray(init) && init.length === 6) {
          [this.a, this.b, this.c, this.d, this.e, this.f] = init;
        }
      }
    }
    
    a: number;
    b: number;
    c: number;
    d: number;
    e: number;
    f: number;
    
    scale(scaleX: number, scaleY: number = scaleX) {
      return new DOMMatrix([this.a * scaleX, this.b * scaleY, this.c * scaleX, this.d * scaleY, this.e, this.f]);
    }
    
    translate(tx: number, ty: number) {
      return new DOMMatrix([this.a, this.b, this.c, this.d, this.e + tx, this.f + ty]);
    }
    
    toString() {
      return `matrix(${this.a}, ${this.b}, ${this.c}, ${this.d}, ${this.e}, ${this.f})`;
    }
  } as any;
}
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
import { createPDFReadRouter } from './routes/pdfRead';
import { createPDFReadExtendedRouter } from './routes/pdfReadExtended';
import { createPDFSummaryRouter } from './routes/pdfSummary';
import { createChatRouter } from './routes/chatBridge';
import notificationRouter from './routes/notifications';
import rateLimit from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './swagger';
import { cleanupRateLimits } from './middleware/rateLimitMiddleware';
import { SessionService } from './services/sessionService';
import { auditService } from './services/auditService';
import { cacheService } from './services/cacheService';
import { databaseManager } from './config/database';
import { backupService } from './services/backupService';
import { dataRetentionService } from './services/dataRetentionService';
import { initializeWebSocket } from './services/websocketService';
import { 
  globalErrorHandler, 
  notFound, 
  handleUnhandledRejection, 
  handleUncaughtException
} from './middleware/errorHandler';
import { logger } from './utils/logger';
import { initializeRedis } from './redis';

// Initialize Sentry first
initSentry();

// Test logger configuration
logger.info({
  environment: process.env.NODE_ENV,
  isRender: process.env.RENDER === 'true',
  logLevel: process.env.LOG_LEVEL || 'info',
  message: 'Logger initialized successfully'
}, 'Server starting up with logger configuration');

// Initialize database and cache
const initializeServices = async () => {
  try {
    // Initialize Redis first
    await initializeRedis();

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
let app: express.Application;

const startServer = async () => {
  try {
    // Initialize services first
    await initializeServices();
    
    // Create app after services are initialized
    app = express();
    
    // Trust proxy for accurate IP addresses
    app.set('trust proxy', 1);

    // Request logging
    // app.use(requestLogger); // Commented out - not available

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
    app.use(`/api/${API_VERSION}/pdfread`, createPDFReadRouter());
    app.use(`/api/${API_VERSION}/pdfread`, createPDFReadExtendedRouter());
    app.use(`/api/${API_VERSION}/pdf`, createPDFSummaryRouter());
    app.use(`/api/${API_VERSION}/chat`, createChatRouter());


    // Legacy routes (backward compatibility)
    app.use('/auth', createAuthRouter());
    app.use('/auth/email', createEmailOtpRouter());
    app.use('/auth/google', createGoogleAuthRouter());
    app.use('/auth/apple', createAppleAuthRouter());
    app.use('/auth/password-reset', createPasswordResetRouter());
    app.use('/pdfread', createPDFReadRouter());
    app.use('/pdfread', createPDFReadExtendedRouter());
    app.use('/pdf', createPDFSummaryRouter());
    app.use('/notifications', notificationRouter);

    // 404 handler (must be before error handler)
    app.use(notFound);

    // Sentry error handler (must be before other error handlers)
    app.use(sentryErrorHandler);

    // Global error handler (must be last)
    app.use(globalErrorHandler);

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

    // Cleanup tasks (run every hour)
    setInterval(async () => {
      try {
        const { PasswordResetService } = await import('./services/passwordResetService');
        await Promise.all([
          SessionService.cleanupExpiredSessions(),
          auditService.cleanupOldAuditLogs(90), // Keep 90 days
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

  } catch (error) {
    logger.error('Server startup failed:', error);
    process.exit(1);
  }
};

// Start the server
startServer().catch(err => {
  logger.error({ error: err }, 'Failed to start server');
  process.exit(1);
});

