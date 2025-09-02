import { Router } from 'express';
import { PasswordResetService } from '../services/passwordResetService';
import { validate, authSchemas } from '../middleware/validationMiddleware';
import { authRateLimits } from '../middleware/rateLimitMiddleware';
import { AuditService } from '../services/auditService';

export function createPasswordResetRouter(): Router {
  const r = Router();

  // POST /auth/password-reset/request
  r.post('/request',
    authRateLimits.passwordReset,
    validate(authSchemas.passwordReset),
    async (req, res) => {
      try {
        const { email } = req.body;
        const ipAddress = (req as any).ip || (req as any).connection?.remoteAddress;
        const userAgent = (req as any).get('User-Agent');

        const result = await PasswordResetService.generateResetToken(
          email,
          ipAddress,
          userAgent
        );

        // Always return success to prevent email enumeration
        res.json({
          message: 'If the email exists, a password reset link has been sent',
          expiresIn: result ? result.expiresAt.toISOString() : null,
        });

        // TODO: Send email with reset link
        // if (result) {
        //   await EmailService.sendPasswordResetEmail(email, result.token);
        // }
      } catch (error) {
        console.error('Password reset request error:', error);
        res.status(500).json({
          error: 'internal_error',
          message: 'Password reset request failed',
        });
      }
    }
  );

  // POST /auth/password-reset/confirm
  r.post('/confirm',
    authRateLimits.passwordReset,
    validate(authSchemas.passwordResetConfirm),
    async (req, res) => {
      try {
        const { token, password } = req.body;
        const ipAddress = (req as any).ip || (req as any).connection?.remoteAddress;
        const userAgent = (req as any).get('User-Agent');

        const success = await PasswordResetService.verifyAndConsumeToken(
          token,
          password,
          ipAddress,
          userAgent
        );

        if (!success) {
          await AuditService.logAuthEvent('password_reset_confirm', {
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
      } catch (error) {
        console.error('Password reset confirm error:', error);
        res.status(500).json({
          error: 'internal_error',
          message: 'Password reset failed',
        });
      }
    }
  );

  return r;
}
