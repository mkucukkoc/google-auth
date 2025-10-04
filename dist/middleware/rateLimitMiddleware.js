"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authRateLimits = void 0;
exports.cleanupRateLimits = cleanupRateLimits;
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const logger_1 = require("../utils/logger");
// Rate limiting configurations for different auth endpoints
exports.authRateLimits = {
    // Registration rate limiting - more restrictive
    register: (0, express_rate_limit_1.default)({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 5, // 5 attempts per window
        message: {
            error: 'rate_limit_exceeded',
            message: 'Too many registration attempts. Please try again later.'
        },
        standardHeaders: true,
        legacyHeaders: false,
    }),
    // Login rate limiting - moderate
    login: (0, express_rate_limit_1.default)({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 10, // 10 attempts per window
        message: {
            error: 'rate_limit_exceeded',
            message: 'Too many login attempts. Please try again later.'
        },
        standardHeaders: true,
        legacyHeaders: false,
    }),
    // Refresh token rate limiting - more permissive
    refresh: (0, express_rate_limit_1.default)({
        windowMs: 5 * 60 * 1000, // 5 minutes
        max: 20, // 20 attempts per window
        message: {
            error: 'rate_limit_exceeded',
            message: 'Too many refresh attempts. Please try again later.'
        },
        standardHeaders: true,
        legacyHeaders: false,
    }),
    // General auth operations
    general: (0, express_rate_limit_1.default)({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 30, // 30 attempts per window
        message: {
            error: 'rate_limit_exceeded',
            message: 'Too many requests. Please try again later.'
        },
        standardHeaders: true,
        legacyHeaders: false,
    }),
    // Password reset rate limiting - very restrictive
    passwordReset: (0, express_rate_limit_1.default)({
        windowMs: 60 * 60 * 1000, // 1 hour
        max: 3, // 3 attempts per hour
        message: {
            error: 'rate_limit_exceeded',
            message: 'Too many password reset attempts. Please try again later.'
        },
        standardHeaders: true,
        legacyHeaders: false,
    }),
    // Email OTP rate limiting
    emailOtp: (0, express_rate_limit_1.default)({
        windowMs: 5 * 60 * 1000, // 5 minutes
        max: 3, // 3 attempts per window
        message: {
            error: 'rate_limit_exceeded',
            message: 'Too many OTP requests. Please try again later.'
        },
        standardHeaders: true,
        legacyHeaders: false,
    }),
};
// Cleanup function for rate limit stores
function cleanupRateLimits() {
    // This is a placeholder - express-rate-limit handles cleanup automatically
    // In a production environment, you might want to implement custom cleanup
    // for distributed rate limiting scenarios
    logger_1.logger.info({ operation: 'rateLimitCleanup' }, 'Rate limit cleanup completed');
}
