"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rateLimiter = exports.createEndpointRateLimit = exports.cleanupRateLimits = exports.createTieredLimiter = exports.fileUploadLimiter = exports.chatLimiter = exports.userApiLimiter = exports.apiLimiter = exports.passwordResetLimiter = exports.emailOtpLimiter = exports.authLimiter = void 0;
const cacheService_1 = require("../services/cacheService");
const logger_1 = require("../utils/logger");
// Custom rate limiter using Redis
class CustomRateLimiter {
    constructor() { }
    static getInstance() {
        if (!CustomRateLimiter.instance) {
            CustomRateLimiter.instance = new CustomRateLimiter();
        }
        return CustomRateLimiter.instance;
    }
    createLimiter(config) {
        return async (req, res, next) => {
            try {
                // Skip if configured
                if (config.skip && config.skip(req)) {
                    return next();
                }
                // Generate key
                const key = config.keyGenerator ? config.keyGenerator(req) : this.getDefaultKey(req);
                const cacheKey = `rate:${key}`;
                // Get current count
                const current = await cacheService_1.cacheService.get(cacheKey) || 0;
                // Check if limit exceeded
                if (current >= config.max) {
                    logger_1.logger.warn('Rate limit exceeded', {
                        key,
                        current,
                        max: config.max,
                        ip: req.ip,
                        userAgent: req.get('User-Agent'),
                        url: req.url,
                        method: req.method,
                    });
                    return res.status(429).json({
                        success: false,
                        error: {
                            code: 'RATE_LIMIT_EXCEEDED',
                            message: config.message,
                            retryAfter: Math.ceil(config.windowMs / 1000),
                        },
                        timestamp: new Date().toISOString(),
                    });
                }
                // Increment counter
                const newCount = current + 1;
                await cacheService_1.cacheService.set(cacheKey, newCount, Math.ceil(config.windowMs / 1000));
                // Add headers
                res.set({
                    'X-RateLimit-Limit': config.max.toString(),
                    'X-RateLimit-Remaining': Math.max(0, config.max - newCount).toString(),
                    'X-RateLimit-Reset': new Date(Date.now() + config.windowMs).toISOString(),
                });
                next();
            }
            catch (error) {
                logger_1.logger.error('Rate limiter error:', error);
                // If rate limiter fails, allow request to proceed
                next();
            }
        };
    }
    getDefaultKey(req) {
        // Use IP + User-Agent for better identification
        const ip = req.ip || req.connection.remoteAddress || 'unknown';
        const userAgent = req.get('User-Agent') || 'unknown';
        return `${ip}:${Buffer.from(userAgent).toString('base64').slice(0, 10)}`;
    }
    // User-based rate limiting
    createUserLimiter(config) {
        return async (req, res, next) => {
            try {
                const userId = req.user?.id;
                if (!userId) {
                    return next();
                }
                const key = `user:${userId}`;
                const cacheKey = `rate:${key}`;
                const current = await cacheService_1.cacheService.get(cacheKey) || 0;
                if (current >= config.max) {
                    logger_1.logger.warn('User rate limit exceeded', {
                        userId,
                        current,
                        max: config.max,
                        url: req.url,
                        method: req.method,
                    });
                    return res.status(429).json({
                        success: false,
                        error: {
                            code: 'USER_RATE_LIMIT_EXCEEDED',
                            message: config.message,
                            retryAfter: Math.ceil(config.windowMs / 1000),
                        },
                        timestamp: new Date().toISOString(),
                    });
                }
                const newCount = current + 1;
                await cacheService_1.cacheService.set(cacheKey, newCount, Math.ceil(config.windowMs / 1000));
                res.set({
                    'X-RateLimit-Limit': config.max.toString(),
                    'X-RateLimit-Remaining': Math.max(0, config.max - newCount).toString(),
                    'X-RateLimit-Reset': new Date(Date.now() + config.windowMs).toISOString(),
                });
                next();
            }
            catch (error) {
                logger_1.logger.error('User rate limiter error:', error);
                next();
            }
        };
    }
    // Endpoint-specific rate limiting
    createEndpointLimiter(config) {
        return async (req, res, next) => {
            try {
                const endpoint = req.route?.path || req.path;
                const method = req.method;
                const key = `${method}:${endpoint}`;
                const cacheKey = `rate:endpoint:${key}`;
                const current = await cacheService_1.cacheService.get(cacheKey) || 0;
                if (current >= config.max) {
                    logger_1.logger.warn('Endpoint rate limit exceeded', {
                        endpoint,
                        method,
                        current,
                        max: config.max,
                        ip: req.ip,
                    });
                    return res.status(429).json({
                        success: false,
                        error: {
                            code: 'ENDPOINT_RATE_LIMIT_EXCEEDED',
                            message: config.message,
                            retryAfter: Math.ceil(config.windowMs / 1000),
                        },
                        timestamp: new Date().toISOString(),
                    });
                }
                const newCount = current + 1;
                await cacheService_1.cacheService.set(cacheKey, newCount, Math.ceil(config.windowMs / 1000));
                res.set({
                    'X-RateLimit-Limit': config.max.toString(),
                    'X-RateLimit-Remaining': Math.max(0, config.max - newCount).toString(),
                    'X-RateLimit-Reset': new Date(Date.now() + config.windowMs).toISOString(),
                });
                next();
            }
            catch (error) {
                logger_1.logger.error('Endpoint rate limiter error:', error);
                next();
            }
        };
    }
}
const rateLimiter = CustomRateLimiter.getInstance();
exports.rateLimiter = rateLimiter;
// Predefined rate limiters
exports.authLimiter = rateLimiter.createLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 attempts per window
    message: 'Too many authentication attempts, please try again later',
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
        const ip = req.ip || req.connection.remoteAddress || 'unknown';
        const email = req.body?.email || 'unknown';
        return `auth:${ip}:${email}`;
    },
});
exports.emailOtpLimiter = rateLimiter.createLimiter({
    windowMs: 60 * 1000, // 1 minute
    max: 3, // 3 OTP requests per minute
    message: 'Too many OTP requests, please wait before requesting another',
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
        const ip = req.ip || req.connection.remoteAddress || 'unknown';
        const email = req.body?.email || 'unknown';
        return `otp:${ip}:${email}`;
    },
});
exports.passwordResetLimiter = rateLimiter.createLimiter({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 3, // 3 password reset attempts per hour
    message: 'Too many password reset attempts, please try again later',
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
        const ip = req.ip || req.connection.remoteAddress || 'unknown';
        const email = req.body?.email || 'unknown';
        return `password_reset:${ip}:${email}`;
    },
});
exports.apiLimiter = rateLimiter.createLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // 100 requests per 15 minutes
    message: 'Too many API requests, please try again later',
    standardHeaders: true,
    legacyHeaders: false,
});
exports.userApiLimiter = rateLimiter.createUserLimiter({
    windowMs: 60 * 1000, // 1 minute
    max: 60, // 60 requests per minute per user
    message: 'Too many requests, please slow down',
    standardHeaders: true,
    legacyHeaders: false,
});
exports.chatLimiter = rateLimiter.createEndpointLimiter({
    windowMs: 60 * 1000, // 1 minute
    max: 10, // 10 chat requests per minute
    message: 'Too many chat requests, please slow down',
    standardHeaders: true,
    legacyHeaders: false,
});
exports.fileUploadLimiter = rateLimiter.createEndpointLimiter({
    windowMs: 60 * 1000, // 1 minute
    max: 5, // 5 file uploads per minute
    message: 'Too many file uploads, please wait before uploading more',
    standardHeaders: true,
    legacyHeaders: false,
});
// Dynamic rate limiter based on user tier
const createTieredLimiter = (freeLimit, premiumLimit) => {
    return rateLimiter.createUserLimiter({
        windowMs: 60 * 1000, // 1 minute
        max: freeLimit, // Will be overridden based on user tier
        message: 'Rate limit exceeded for your tier',
        standardHeaders: true,
        legacyHeaders: false,
        keyGenerator: (req) => {
            const userId = req.user?.id;
            const userTier = req.user?.tier || 'free';
            const limit = userTier === 'premium' ? premiumLimit : freeLimit;
            return `tiered:${userId}:${limit}`;
        },
    });
};
exports.createTieredLimiter = createTieredLimiter;
// Rate limit cleanup (run periodically)
const cleanupRateLimits = async () => {
    try {
        const patterns = [
            'rate:auth:*',
            'rate:otp:*',
            'rate:password_reset:*',
            'rate:endpoint:*',
            'rate:user:*',
            'rate:tiered:*',
        ];
        let totalDeleted = 0;
        for (const pattern of patterns) {
            const deleted = await cacheService_1.cacheService.delPattern(pattern);
            totalDeleted += deleted;
        }
        logger_1.logger.info(`Rate limit cleanup completed: ${totalDeleted} entries deleted`);
    }
    catch (error) {
        logger_1.logger.error('Rate limit cleanup failed:', error);
    }
};
exports.cleanupRateLimits = cleanupRateLimits;
// Rate limit middleware for specific endpoints
const createEndpointRateLimit = (endpoint, max, windowMs) => {
    return rateLimiter.createEndpointLimiter({
        windowMs,
        max,
        message: `Too many requests to ${endpoint}, please slow down`,
        standardHeaders: true,
        legacyHeaders: false,
    });
};
exports.createEndpointRateLimit = createEndpointRateLimit;
