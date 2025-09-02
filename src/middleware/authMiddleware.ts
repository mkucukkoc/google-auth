import { Request, Response, NextFunction } from 'express';
import { TokenService } from '../services/tokenService';
import { SessionService } from '../services/sessionService';
import { AccessTokenClaims } from '../types/auth';

// Extend Express Request type to include user data
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        sessionId: string;
        jti: string;
      };
    }
  }
}

export interface AuthRequest extends Request {
  user: {
    id: string;
    sessionId: string;
    jti: string;
  };
}

/**
 * Middleware to authenticate access tokens
 */
export const authenticateToken = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ 
        error: 'unauthorized',
        message: 'Missing or invalid authorization header' 
      });
      return;
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    
    if (!token) {
      res.status(401).json({ 
        error: 'unauthorized',
        message: 'Access token is required' 
      });
      return;
    }

    // Verify and decode the token
    const claims = await TokenService.verifyAccessToken(token);
    
    // Verify session is still active
    const session = await SessionService.findById(claims.sid);
    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      res.status(401).json({ 
        error: 'unauthorized',
        message: 'Session is invalid or expired' 
      });
      return;
    }

    // Attach user info to request
    req.user = {
      id: claims.sub,
      sessionId: claims.sid,
      jti: claims.jti,
    };

    next();
  } catch (error) {
    res.status(401).json({ 
      error: 'unauthorized',
      message: 'Invalid or expired token' 
    });
  }
};

/**
 * Optional authentication middleware - doesn't fail if no token
 */
export const optionalAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      
      if (token) {
        const claims = await TokenService.verifyAccessToken(token);
        const session = await SessionService.findById(claims.sid);
        
        if (session && !session.revokedAt && session.expiresAt > new Date()) {
          req.user = {
            id: claims.sub,
            sessionId: claims.sid,
            jti: claims.jti,
          };
        }
      }
    }
    
    next();
  } catch (error) {
    // Continue without authentication
    next();
  }
};

/**
 * Middleware to check if user has specific permissions
 */
export const requirePermission = (permission: string) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ 
        error: 'unauthorized',
        message: 'Authentication required' 
      });
      return;
    }

    // For now, we'll implement basic permission checking
    // In a more complex system, you'd check user roles/permissions
    // This is a placeholder for future permission system
    next();
  };
};

/**
 * Middleware to ensure user owns the resource
 */
export const requireOwnership = (userIdParam: string = 'userId') => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ 
        error: 'unauthorized',
        message: 'Authentication required' 
      });
      return;
    }

    const resourceUserId = req.params[userIdParam] || req.body[userIdParam];
    
    if (req.user.id !== resourceUserId) {
      res.status(403).json({ 
        error: 'forbidden',
        message: 'Access denied to this resource' 
      });
      return;
    }

    next();
  };
};
