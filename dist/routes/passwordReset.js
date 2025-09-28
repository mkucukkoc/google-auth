"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPasswordResetRouter = createPasswordResetRouter;
const express_1 = require("express");
const passwordResetService_1 = require("../services/passwordResetService");
const validationMiddleware_1 = require("../middleware/validationMiddleware");
const rateLimitMiddleware_1 = require("../middleware/rateLimitMiddleware");
const auditService_1 = require("../services/auditService");
function createPasswordResetRouter() {
    const r = (0, express_1.Router)();
    // POST /auth/password-reset/request
    r.post('/request', rateLimitMiddleware_1.authRateLimits.passwordReset, (0, validationMiddleware_1.validate)(validationMiddleware_1.authSchemas.passwordReset), async (req, res) => {
        try {
            const { email } = req.body;
            const ipAddress = req.ip || req.connection?.remoteAddress;
            const userAgent = req.get('User-Agent');
            const result = await passwordResetService_1.PasswordResetService.generateResetToken(email, ipAddress, userAgent);
            // Always return success to prevent email enumeration
            res.json({
                message: 'If the email exists, a password reset link has been sent',
                expiresIn: result ? result.expiresAt.toISOString() : null,
            });
            // TODO: Send email with reset link
            // if (result) {
            //   await EmailService.sendPasswordResetEmail(email, result.token);
            // }
        }
        catch (error) {
            console.error('Password reset request error:', error);
            res.status(500).json({
                error: 'internal_error',
                message: 'Password reset request failed',
            });
        }
    });
    // POST /auth/password-reset/confirm
    r.post('/confirm', rateLimitMiddleware_1.authRateLimits.passwordReset, (0, validationMiddleware_1.validate)(validationMiddleware_1.authSchemas.passwordResetConfirm), async (req, res) => {
        try {
            const { token, password } = req.body;
            const ipAddress = req.ip || req.connection?.remoteAddress;
            const userAgent = req.get('User-Agent');
            const success = await passwordResetService_1.PasswordResetService.verifyAndConsumeToken(token, password, ipAddress, userAgent);
            if (!success) {
                await auditService_1.auditService.logAuthEvent('password_reset_confirm', {
                    ipAddress,
                    userAgent,
                    success: false,
                    errorMessage: 'Invalid or expired token',
                });
                return res.status(400).json({
                    error: 'invalid_token',
                    message: 'Invalid or expired password reset token',
                });
            }
            res.json({
                message: 'Password has been reset successfully. Please log in with your new password.',
            });
        }
        catch (error) {
            console.error('Password reset confirm error:', error);
            res.status(500).json({
                error: 'internal_error',
                message: 'Password reset failed',
            });
        }
    });
    return r;
}
