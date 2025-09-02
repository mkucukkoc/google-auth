import { Request, Response, NextFunction } from 'express';
import { Redis } from 'ioredis';
import { config } from '../config';

// Redis client for rate limiting
const redis = new Redis(config.redisUrl);

export interface RateLimitOptions {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum requests per window
  keyGenerator?: (req: Request) => string; // Custom key generator
  skipSuccessfulRequests?: boolean; // Don't count successful requests
  skipFailedRequests?: boolean; // Don't count failed requests
}

/**
 * Advanced rate limiting middleware using Redis
 */
export const createRateLimit = (options: RateLimitOptions) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const key = options.keyGenerator ? options.keyGenerator(req) : getDefaultKey(req);
      const window = Math.floor(Date.now() / options.windowMs);
      const redisKey = `rate_limit:${key}:${window}`;

      // Get current count
      const current = await redis.get(redisKey);
      const count = current ? parseInt(current, 10) : 0;

      if (count >= options.maxRequests) {
        res.status(429).json({
          error: 'rate_limit_exceeded',
          message: 'Too many requests, please try again later',
          retryAfter: options.windowMs / 1000,
        });
        return;
      }

      // Increment counter
      await redis.incr(redisKey);
      await redis.expire(redisKey, Math.ceil(options.windowMs / 1000));

      // Add rate limit headers
      res.set({
        'X-RateLimit-Limit': options.maxRequests.toString(),
        'X-RateLimit-Remaining': Math.max(0, options.maxRequests - count - 1).toString(),
        'X-RateLimit-Reset': new Date(Date.now() + options.windowMs).toISOString(),
      });

      next();
    } catch (error) {
      // If Redis is down, allow the request but log the error
      console.error('Rate limiting error:', error);
      next();
    }
  };
};

/**
 * Default key generator for rate limiting
 */
function getDefaultKey(req: Request): string {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const userAgent = req.get('User-Agent') || 'unknown';
  return `${ip}:${userAgent}`;
}

/**
 * Rate limit by IP address
 */
export const rateLimitByIP = (windowMs: number, maxRequests: number) => {
  return createRateLimit({
    windowMs,
    maxRequests,
    keyGenerator: (req) => req.ip || req.connection.remoteAddress || 'unknown',
  });
};

/**
 * Rate limit by email (for login attempts)
 */
export const rateLimitByEmail = (windowMs: number, maxRequests: number) => {
  return createRateLimit({
    windowMs,
    maxRequests,
    keyGenerator: (req) => {
      const email = req.body?.email || req.query?.email;
      return email ? `email:${email}` : 'unknown';
    },
  });
};

/**
 * Rate limit by IP + email combination
 */
export const rateLimitByIPAndEmail = (windowMs: number, maxRequests: number) => {
  return createRateLimit({
    windowMs,
    maxRequests,
    keyGenerator: (req) => {
      const ip = req.ip || req.connection.remoteAddress || 'unknown';
      const email = req.body?.email || req.query?.email || 'unknown';
      return `${ip}:${email}`;
    },
  });
};

/**
 * Rate limit by user ID (for authenticated requests)
 */
export const rateLimitByUser = (windowMs: number, maxRequests: number) => {
  return createRateLimit({
    windowMs,
    maxRequests,
    keyGenerator: (req) => {
      return req.user?.id || 'anonymous';
    },
  });
};

/**
 * Specific rate limits for authentication endpoints
 */
export const authRateLimits = {
  // Login attempts: 5 per 15 minutes per IP+email
  login: rateLimitByIPAndEmail(15 * 60 * 1000, 5),
  
  // Register attempts: 3 per hour per IP
  register: rateLimitByIP(60 * 60 * 1000, 3),
  
  // Refresh token: 10 per minute per IP
  refresh: rateLimitByIP(60 * 1000, 10),
  
  // Password reset: 3 per hour per email
  passwordReset: rateLimitByEmail(60 * 60 * 1000, 3),
  
  // General auth endpoints: 20 per minute per IP
  general: rateLimitByIP(60 * 1000, 20),
};

/**
 * Cleanup old rate limit entries (call this periodically)
 */
export const cleanupRateLimits = async (): Promise<void> => {
  try {
    const keys = await redis.keys('rate_limit:*');
    const now = Math.floor(Date.now() / 1000);
    
    for (const key of keys) {
      const ttl = await redis.ttl(key);
      if (ttl === -1) {
        // Key has no expiration, set one
        await redis.expire(key, 3600); // 1 hour default
      }
    }
  } catch (error) {
    console.error('Rate limit cleanup error:', error);
  }
};
