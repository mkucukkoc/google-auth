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
const pino_1 = __importDefault(require("pino"));
const pino_http_1 = __importDefault(require("pino-http"));
const config_1 = require("./config");
const auth_1 = require("./routes/auth");
const emailOtp_1 = require("./routes/emailOtp");
const google_1 = require("./routes/google");
const passwordReset_1 = require("./routes/passwordReset");
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const swagger_ui_express_1 = __importDefault(require("swagger-ui-express"));
const swagger_1 = require("./swagger");
const rateLimitMiddleware_1 = require("./middleware/rateLimitMiddleware");
const sessionService_1 = require("./services/sessionService");
const auditService_1 = require("./services/auditService");
const app = (0, express_1.default)();
const logger = (0, pino_1.default)({ level: process.env.LOG_LEVEL || 'info' });
// Trust proxy for accurate IP addresses
app.set('trust proxy', 1);
app.use(express_1.default.json({ limit: '10mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '10mb' }));
app.use((0, cors_1.default)({ origin: config_1.config.corsOrigin, credentials: true }));
app.use((0, helmet_1.default)());
app.use((0, pino_http_1.default)({ logger }));
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
// API routes
app.use('/auth', (0, auth_1.createAuthRouter)());
app.use('/auth/email', (0, emailOtp_1.createEmailOtpRouter)());
app.use('/auth/google', (0, google_1.createGoogleAuthRouter)());
app.use('/auth/password-reset', (0, passwordReset_1.createPasswordResetRouter)());
// Start server
const server = app.listen(config_1.config.port, () => {
    logger.info({ port: config_1.config.port }, 'Server listening');
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
        const { PasswordResetService } = await Promise.resolve().then(() => __importStar(require('./services/passwordResetService')));
        await Promise.all([
            sessionService_1.SessionService.cleanupExpiredSessions(),
            auditService_1.AuditService.cleanupOldAuditLogs(90), // Keep 90 days
            PasswordResetService.cleanupExpiredTokens(),
            (0, rateLimitMiddleware_1.cleanupRateLimits)(),
        ]);
        logger.info('Cleanup tasks completed');
    }
    catch (error) {
        logger.error({ error }, 'Cleanup tasks failed');
    }
}, 60 * 60 * 1000); // 1 hour
