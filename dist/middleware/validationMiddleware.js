"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateParams = exports.validateQuery = exports.authSchemas = exports.validate = void 0;
const zod_1 = require("zod");
/**
 * Validation middleware factory
 */
const validate = (schema) => {
    return (req, res, next) => {
        try {
            schema.parse(req.body);
            next();
        }
        catch (error) {
            if (error instanceof zod_1.z.ZodError) {
                res.status(400).json({
                    error: 'validation_error',
                    message: 'Invalid request data',
                    details: error.issues.map((err) => ({
                        field: err.path.join('.'),
                        message: err.message,
                    })),
                });
                return;
            }
            res.status(400).json({
                error: 'validation_error',
                message: 'Invalid request data',
            });
        }
    };
};
exports.validate = validate;
/**
 * Validation schemas for auth endpoints
 */
exports.authSchemas = {
    register: zod_1.z.object({
        email: zod_1.z.string().email('Invalid email format'),
        password: zod_1.z.string().min(8, 'Password must be at least 8 characters')
            .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'Password must contain at least one lowercase letter, one uppercase letter, and one number'),
        device: zod_1.z.object({
            os: zod_1.z.string().optional(),
            model: zod_1.z.string().optional(),
            appVersion: zod_1.z.string().optional(),
            platform: zod_1.z.string().optional(),
        }),
        deviceId: zod_1.z.string().optional(),
        name: zod_1.z.string().min(1, 'Name is required').max(100, 'Name too long').optional(),
    }),
    login: zod_1.z.object({
        email: zod_1.z.string().email('Invalid email format'),
        password: zod_1.z.string().min(1, 'Password is required'),
        device: zod_1.z.object({
            os: zod_1.z.string().optional(),
            model: zod_1.z.string().optional(),
            appVersion: zod_1.z.string().optional(),
            platform: zod_1.z.string().optional(),
        }),
        deviceId: zod_1.z.string().optional(),
    }),
    refresh: zod_1.z.object({
        refreshToken: zod_1.z.string().min(1, 'Refresh token is required'),
        sessionId: zod_1.z.string().uuid('Invalid session ID format'),
        deviceId: zod_1.z.string().optional(),
    }),
    logout: zod_1.z.object({
        sessionId: zod_1.z.string().uuid('Invalid session ID format'),
    }),
    passwordReset: zod_1.z.object({
        email: zod_1.z.string().email('Invalid email format'),
    }),
    passwordResetConfirm: zod_1.z.object({
        token: zod_1.z.string().min(1, 'Reset token is required'),
        password: zod_1.z.string().min(8, 'Password must be at least 8 characters')
            .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'Password must contain at least one lowercase letter, one uppercase letter, and one number'),
    }),
    // 2FA schemas (for future implementation)
    enable2FA: zod_1.z.object({
        method: zod_1.z.enum(['totp', 'sms']),
        phoneNumber: zod_1.z.string().optional(),
    }),
    verify2FA: zod_1.z.object({
        code: zod_1.z.string().min(6, '2FA code must be at least 6 characters'),
        backupCode: zod_1.z.string().optional(),
    }),
};
/**
 * Query parameter validation
 */
const validateQuery = (schema) => {
    return (req, res, next) => {
        try {
            schema.parse(req.query);
            next();
        }
        catch (error) {
            if (error instanceof zod_1.z.ZodError) {
                res.status(400).json({
                    error: 'validation_error',
                    message: 'Invalid query parameters',
                    details: error.issues.map((err) => ({
                        field: err.path.join('.'),
                        message: err.message,
                    })),
                });
                return;
            }
            res.status(400).json({
                error: 'validation_error',
                message: 'Invalid query parameters',
            });
        }
    };
};
exports.validateQuery = validateQuery;
/**
 * Params validation
 */
const validateParams = (schema) => {
    return (req, res, next) => {
        try {
            schema.parse(req.params);
            next();
        }
        catch (error) {
            if (error instanceof zod_1.z.ZodError) {
                res.status(400).json({
                    error: 'validation_error',
                    message: 'Invalid URL parameters',
                    details: error.issues.map((err) => ({
                        field: err.path.join('.'),
                        message: err.message,
                    })),
                });
                return;
            }
            res.status(400).json({
                error: 'validation_error',
                message: 'Invalid URL parameters',
            });
        }
    };
};
exports.validateParams = validateParams;
