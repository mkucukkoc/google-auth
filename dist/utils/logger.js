"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logBusinessEvent = exports.logSecurityEvent = exports.logPerformance = exports.logError = exports.requestLogger = exports.logger = void 0;
const pino_1 = __importDefault(require("pino"));
const isDevelopment = process.env.NODE_ENV === 'development';
const isProduction = process.env.NODE_ENV === 'production';
// Base logger configuration
const baseConfig = {
    level: process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info'),
    timestamp: pino_1.default.stdTimeFunctions.isoTime,
    formatters: {
        level: (label) => {
            return { level: label.toUpperCase() };
        },
    },
    serializers: {
        req: (req) => ({
            method: req.method,
            url: req.url,
            headers: {
                'user-agent': req.headers['user-agent'],
                'content-type': req.headers['content-type'],
            },
            remoteAddress: req.remoteAddress,
        }),
        res: (res) => ({
            statusCode: res.statusCode,
            headers: res.headers,
        }),
        err: (err) => ({
            type: err.constructor.name,
            message: err.message,
            stack: err.stack,
            ...err,
        }),
    },
};
// Development logger (pretty print)
const developmentLogger = (0, pino_1.default)({
    ...baseConfig,
    transport: {
        target: 'pino-pretty',
        options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
        },
    },
});
// Production logger (JSON format)
const productionLogger = (0, pino_1.default)({
    ...baseConfig,
    transport: isProduction ? {
        target: 'pino/file',
        options: {
            destination: './logs/app.log',
            mkdir: true,
        },
    } : undefined,
});
// Choose logger based on environment
exports.logger = isDevelopment ? developmentLogger : productionLogger;
// Request logging middleware
const requestLogger = (req, res, next) => {
    const start = Date.now();
    // Generate request ID
    const requestId = req.headers['x-request-id'] ||
        Math.random().toString(36).substr(2, 9);
    req.requestId = requestId;
    res.set('X-Request-ID', requestId);
    // Log request
    exports.logger.info({
        req,
        requestId,
        message: 'Incoming request',
    }, `${req.method} ${req.url}`);
    // Override res.end to log response
    const originalEnd = res.end;
    res.end = function (chunk, encoding) {
        const duration = Date.now() - start;
        exports.logger.info({
            res,
            requestId,
            duration,
            message: 'Request completed',
        }, `${req.method} ${req.url} - ${res.statusCode} (${duration}ms)`);
        originalEnd.call(this, chunk, encoding);
    };
    next();
};
exports.requestLogger = requestLogger;
// Error logging helper
const logError = (error, context) => {
    exports.logger.error({
        err: error,
        context,
        message: 'Error occurred',
    }, error.message);
};
exports.logError = logError;
// Performance logging helper
const logPerformance = (operation, duration, metadata) => {
    exports.logger.info({
        operation,
        duration,
        metadata,
        message: 'Performance metric',
    }, `${operation} completed in ${duration}ms`);
};
exports.logPerformance = logPerformance;
// Security event logging
const logSecurityEvent = (event, details) => {
    exports.logger.warn({
        securityEvent: event,
        details,
        message: 'Security event detected',
    }, `Security: ${event}`);
};
exports.logSecurityEvent = logSecurityEvent;
// Business logic logging
const logBusinessEvent = (event, userId, metadata) => {
    exports.logger.info({
        businessEvent: event,
        userId,
        metadata,
        message: 'Business event',
    }, `Business: ${event}`);
};
exports.logBusinessEvent = logBusinessEvent;
