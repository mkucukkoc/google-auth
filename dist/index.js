"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const sentry_1 = require("./utils/sentry");
const config_1 = require("./config");
const auth_1 = require("./routes/auth");
const emailOtp_1 = require("./routes/emailOtp");
const google_1 = require("./routes/google");
const apple_1 = require("./routes/apple");
const passwordReset_1 = require("./routes/passwordReset");
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const swagger_ui_express_1 = __importDefault(require("swagger-ui-express"));
const swagger_1 = require("./swagger");
const rateLimitMiddleware_1 = require("./middleware/rateLimitMiddleware");
const sessionService_1 = require("./services/sessionService");
const auditService_1 = require("./services/auditService");
const cacheService_1 = require("./services/cacheService");
const database_1 = require("./config/database");
const backupService_1 = require("./services/backupService");
const dataRetentionService_1 = require("./services/dataRetentionService");
const websocketService_1 = require("./services/websocketService");
const errorHandler_1 = require("./middleware/errorHandler");
const logger_1 = require("./utils/logger");
// Initialize Sentry first
(0, sentry_1.initSentry)();
// Initialize database and cache
const initializeServices = async () => {
    try {
        // Initialize database
        await database_1.databaseManager.initialize({
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
        const cacheConnected = await cacheService_1.cacheService.ping();
        if (!cacheConnected) {
            logger_1.logger.warn('Cache service not available, continuing without cache');
        }
        logger_1.logger.info('All services initialized successfully');
    }
    catch (error) {
        logger_1.logger.error('Service initialization failed:', error);
        process.exit(1);
    }
};
// Initialize services before creating app
// Initialize services
initializeServices().catch(err => {
    logger_1.logger.error({ error: err }, 'Failed to initialize services');
    process.exit(1);
});
const app = (0, express_1.default)();
// Trust proxy for accurate IP addresses
app.set('trust proxy', 1);
// Sentry request handler (must be first)
app.use(sentry_1.sentryRequestHandler);
app.use(sentry_1.sentryTracingHandler);
// Request logging
// app.use(requestLogger); // Commented out - not available
app.use(express_1.default.json({ limit: '10mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '10mb' }));
app.use((0, cors_1.default)({ origin: config_1.config.corsOrigin, credentials: true }));
app.use((0, helmet_1.default)());
// Global rate limiting
const limiter = (0, express_rate_limit_1.default)({
    windowMs: 60000,
    max: 100,
    message: {
        error: 'rate_limit_exceeded',
        message: 'Too many requests from this IP, please try again later.'
    }
});
app.use(limiter);
// Swagger documentation
app.use('/docs', swagger_ui_express_1.default.serve, swagger_ui_express_1.default.setup(swagger_1.swaggerSpec));
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
app.use(`/api/${API_VERSION}/auth`, (0, auth_1.createAuthRouter)());
app.use(`/api/${API_VERSION}/auth/email`, (0, emailOtp_1.createEmailOtpRouter)());
app.use(`/api/${API_VERSION}/auth/google`, (0, google_1.createGoogleAuthRouter)());
app.use(`/api/${API_VERSION}/auth/apple`, (0, apple_1.createAppleAuthRouter)());
app.use(`/api/${API_VERSION}/auth/password-reset`, (0, passwordReset_1.createPasswordResetRouter)());
// Legacy routes (backward compatibility)
app.use('/auth', (0, auth_1.createAuthRouter)());
app.use('/auth/email', (0, emailOtp_1.createEmailOtpRouter)());
app.use('/auth/google', (0, google_1.createGoogleAuthRouter)());
app.use('/auth/apple', (0, apple_1.createAppleAuthRouter)());
app.use('/auth/password-reset', (0, passwordReset_1.createPasswordResetRouter)());
// Start server
const server = app.listen(config_1.config.port, () => {
    logger_1.logger.info({ port: config_1.config.port }, 'Server listening');
});
// Initialize WebSocket
(0, websocketService_1.initializeWebSocket)(server);
// Graceful shutdown
process.on('SIGTERM', () => {
    logger_1.logger.info('SIGTERM received, shutting down gracefully');
    server.close(() => {
        logger_1.logger.info('Process terminated');
        process.exit(0);
    });
});
process.on('SIGINT', () => {
    logger_1.logger.info('SIGINT received, shutting down gracefully');
    server.close(() => {
        logger_1.logger.info('Process terminated');
        process.exit(0);
    });
});
// Error handling setup
(0, errorHandler_1.handleUncaughtException)();
(0, errorHandler_1.handleUnhandledRejection)();
// 404 handler (must be before error handler)
app.use(errorHandler_1.notFound);
// Sentry error handler (must be before other error handlers)
app.use(sentry_1.sentryErrorHandler);
// Global error handler (must be last)
app.use(errorHandler_1.globalErrorHandler);
// Cleanup tasks (run every hour)
setInterval(async () => {
    try {
        const { PasswordResetService } = await Promise.resolve().then(() => __importStar(require('./services/passwordResetService')));
        await Promise.all([
            sessionService_1.SessionService.cleanupExpiredSessions(),
            auditService_1.auditService.cleanupOldAuditLogs(90), // Keep 90 days
            PasswordResetService.cleanupExpiredTokens(),
            (0, rateLimitMiddleware_1.cleanupRateLimits)(),
        ]);
        logger_1.logger.info('Cleanup tasks completed');
    }
    catch (error) {
        logger_1.logger.error({ error }, 'Cleanup tasks failed');
    }
}, 60 * 60 * 1000); // 1 hour
// Data retention cleanup (run daily at 3 AM)
setInterval(async () => {
    try {
        const results = await dataRetentionService_1.dataRetentionService.runRetentionPolicies();
        const totalDeleted = results.reduce((sum, result) => sum + result.deletedCount, 0);
        logger_1.logger.info(`Data retention cleanup completed: ${totalDeleted} documents deleted`);
    }
    catch (error) {
        logger_1.logger.error('Data retention cleanup failed:', error);
    }
}, 24 * 60 * 60 * 1000); // 24 hours
// Backup tasks (run daily at 2 AM)
setInterval(async () => {
    try {
        const backupResult = await backupService_1.backupService.createFullBackup();
        if (backupResult.success) {
            logger_1.logger.info(`Daily backup completed: ${backupResult.backupId}`);
        }
        else {
            logger_1.logger.error(`Daily backup failed: ${backupResult.error}`);
        }
    }
    catch (error) {
        logger_1.logger.error('Backup task failed:', error);
    }
}, 24 * 60 * 60 * 1000); // 24 hours
// Cleanup old backups (run weekly)
setInterval(async () => {
    try {
        const deletedCount = await backupService_1.backupService.cleanupOldBackups();
        logger_1.logger.info(`Backup cleanup completed: ${deletedCount} old backups deleted`);
    }
    catch (error) {
        logger_1.logger.error('Backup cleanup failed:', error);
    }
}, 7 * 24 * 60 * 60 * 1000); // 7 days
