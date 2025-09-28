import rateLimit from 'express-rate-limit';

// Rate limiting configurations for different auth endpoints
export const authRateLimits = {
  // Registration rate limiting - more restrictive
  register: rateLimit({
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
  login: rateLimit({
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
  refresh: rateLimit({
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
  general: rateLimit({
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
  passwordReset: rateLimit({
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
  emailOtp: rateLimit({
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
export function cleanupRateLimits(): void {
  // This is a placeholder - express-rate-limit handles cleanup automatically
  // In a production environment, you might want to implement custom cleanup
  // for distributed rate limiting scenarios
  console.log('Rate limit cleanup completed');
}





