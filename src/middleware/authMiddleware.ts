import { Request, Response, NextFunction } from 'express';
import { TokenService } from '../services/tokenService';
import { UserService } from '../services/userService';
import { SessionService } from '../services/sessionService';
import { logger } from '../utils/logger';

// Extend Request interface to include user
export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    name?: string;
    avatar?: string;
  };
}

// JWT token authentication middleware
export async function authenticateToken(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      res.status(401).json({
        error: 'access_denied',
        message: 'Access token required'
      });
      return;
    }

    // Verify the token
    logger.info({ 
      token: token.substring(0, 20) + '...',
      tokenLength: token.length,
      endpoint: req.path,
      method: req.method,
      fullToken: token // DEBUG: Show full token
    }, 'Verifying access token');
    
    const decoded = await TokenService.verifyAccessToken(token);
    
    if (!decoded) {
      logger.warn({ 
        token: token.substring(0, 20) + '...',
        tokenLength: token.length,
        endpoint: req.path,
        method: req.method
      }, 'Token verification failed');
      res.status(401).json({
        error: 'invalid_token',
        message: 'Invalid or expired access token'
      });
      return;
    }
    
    logger.info({ 
      userId: decoded.sub,
      endpoint: req.path,
      method: req.method
    }, 'Token verified successfully');

    // Get user information
    const user = await UserService.findById(decoded.sub);
    
    if (!user) {
      res.status(401).json({
        error: 'user_not_found',
        message: 'User not found'
      });
      return;
    }

    // Check if user is locked
    if (UserService.isUserLocked(user)) {
      res.status(423).json({
        error: 'account_locked',
        message: 'Account is temporarily locked'
      });
      return;
    }

    // Verify session is still active
    const session = await SessionService.findById(decoded.sid);
    
    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      res.status(401).json({
        error: 'session_expired',
        message: 'Session has expired or been revoked'
      });
      return;
    }

    // Add user to request object
    (req as AuthRequest).user = {
      id: user.id,
      email: user.email,
      name: user.name,
      avatar: user.avatar,
    };

    next();
  } catch (error) {
    logger.error({ err: error, operation: 'authentication' }, 'Authentication error');
    res.status(500).json({
      error: 'internal_error',
      message: 'Authentication failed'
    });
  }
}

// Optional authentication middleware (doesn't fail if no token)
export async function optionalAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      const decoded = await TokenService.verifyAccessToken(token);
      
      if (decoded) {
        const user = await UserService.findById(decoded.sub);
        
        if (user && !UserService.isUserLocked(user)) {
          const session = await SessionService.findById(decoded.sid);
          
          if (session && !session.revokedAt && session.expiresAt > new Date()) {
            (req as AuthRequest).user = {
              id: user.id,
              email: user.email,
              name: user.name,
              avatar: user.avatar,
            };
          }
        }
      }
    }

    next();
  } catch (error) {
    // For optional auth, we don't fail on error, just continue without user
    logger.warn({ err: error, operation: 'optionalAuth' }, 'Optional auth error');
    next();
  }
}

// Admin role check middleware
export function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const authReq = req as AuthRequest;
  
  if (!authReq.user) {
    res.status(401).json({
      error: 'access_denied',
      message: 'Authentication required'
    });
    return;
  }

  // For now, we don't have role-based access control
  // This is a placeholder for future implementation
  // You would check user.role or user.permissions here
  
  next();
}
