"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticateToken = authenticateToken;
exports.optionalAuth = optionalAuth;
exports.requireAdmin = requireAdmin;
const tokenService_1 = require("../services/tokenService");
const userService_1 = require("../services/userService");
const sessionService_1 = require("../services/sessionService");
const logger_1 = require("../utils/logger");
// JWT token authentication middleware
async function authenticateToken(req, res, next) {
    const requestId = Math.random().toString(36).substring(7);
    const startTime = Date.now();
    try {
        logger_1.logger.info({
            requestId,
            operation: 'authenticateToken',
            endpoint: req.path,
            method: req.method,
            userAgent: req.headers['user-agent'],
            ip: req.ip,
            headers: {
                authorization: req.headers.authorization ? 'Bearer ***' : 'none',
                contentType: req.headers['content-type'],
                accept: req.headers.accept
            }
        }, 'Starting authentication process');
        const authHeader = req.headers.authorization;
        logger_1.logger.debug({
            requestId,
            authHeader: authHeader ? 'Bearer ***' : 'none',
            authHeaderLength: authHeader?.length || 0
        }, 'Authorization header analysis');
        const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
        if (!token) {
            logger_1.logger.warn({
                requestId,
                endpoint: req.path,
                method: req.method,
                authHeader: authHeader || 'none'
            }, 'No access token provided');
            res.status(401).json({
                error: 'access_denied',
                message: 'Access token required'
            });
            return;
        }
        logger_1.logger.info({
            requestId,
            tokenLength: token.length,
            tokenPreview: token.substring(0, 20) + '...',
            tokenParts: token.split('.').map((part, index) => ({
                part: index,
                length: part.length,
                preview: part.substring(0, 10) + '...'
            })),
            endpoint: req.path,
            method: req.method
        }, 'Token analysis completed, starting verification');
        const decoded = await tokenService_1.TokenService.verifyAccessToken(token);
        logger_1.logger.info({
            requestId,
            hasDecoded: !!decoded,
            decoded: decoded ? {
                sub: decoded.sub,
                sid: decoded.sid,
                jti: decoded.jti,
                iat: decoded.iat,
                exp: decoded.exp,
                iss: decoded.iss,
                aud: decoded.aud,
                expDate: new Date(decoded.exp * 1000).toISOString(),
                iatDate: new Date(decoded.iat * 1000).toISOString()
            } : null
        }, 'Token verification result');
        if (!decoded) {
            logger_1.logger.warn({
                requestId,
                tokenLength: token.length,
                tokenPreview: token.substring(0, 20) + '...',
                endpoint: req.path,
                method: req.method
            }, 'Token verification failed');
            res.status(401).json({
                error: 'invalid_token',
                message: 'Invalid or expired access token'
            });
            return;
        }
        logger_1.logger.info({
            requestId,
            userId: decoded.sub,
            sessionId: decoded.sid,
            endpoint: req.path,
            method: req.method
        }, 'Token verified successfully, fetching user data');
        // Get user information
        logger_1.logger.debug({
            requestId,
            userId: decoded.sub,
            operation: 'fetchUser'
        }, 'Fetching user from database');
        const user = await userService_1.UserService.findById(decoded.sub);
        logger_1.logger.info({
            requestId,
            userId: decoded.sub,
            hasUser: !!user,
            userData: user ? {
                id: user.id,
                email: user.email,
                name: user.name,
                isLocked: userService_1.UserService.isUserLocked(user),
                createdAt: user.createdAt,
                lastLoginAt: user.lastLoginAt
            } : null
        }, 'User fetch result');
        if (!user) {
            logger_1.logger.error({
                requestId,
                userId: decoded.sub,
                endpoint: req.path,
                method: req.method
            }, 'User not found in database');
            res.status(401).json({
                error: 'user_not_found',
                message: 'User not found'
            });
            return;
        }
        // Check if user is locked
        const isLocked = userService_1.UserService.isUserLocked(user);
        logger_1.logger.debug({
            requestId,
            userId: decoded.sub,
            isLocked
        }, 'User lock status check');
        if (isLocked) {
            logger_1.logger.warn({
                requestId,
                userId: decoded.sub,
                endpoint: req.path,
                method: req.method
            }, 'Account is locked');
            res.status(423).json({
                error: 'account_locked',
                message: 'Account is temporarily locked'
            });
            return;
        }
        // Verify session is still active
        logger_1.logger.info({
            requestId,
            sessionId: decoded.sid,
            userId: decoded.sub,
            operation: 'sessionValidation'
        }, 'Starting session validation');
        const session = await sessionService_1.SessionService.findById(decoded.sid);
        const now = new Date();
        const sessionExpiresAt = session?.expiresAt;
        let isExpired = false;
        let timeUntilExpiry = 0;
        if (session && sessionExpiresAt) {
            // Handle Firestore Timestamp objects
            let sessionExpiresAtDate;
            if (sessionExpiresAt && typeof sessionExpiresAt === 'object' && 'toDate' in sessionExpiresAt) {
                // Firestore Timestamp
                sessionExpiresAtDate = sessionExpiresAt.toDate();
            }
            else if (sessionExpiresAt instanceof Date) {
                // Regular Date
                sessionExpiresAtDate = sessionExpiresAt;
            }
            else {
                // Fallback
                sessionExpiresAtDate = new Date(sessionExpiresAt);
            }
            isExpired = sessionExpiresAtDate < now;
            timeUntilExpiry = sessionExpiresAtDate.getTime() - now.getTime();
        }
        logger_1.logger.info({
            requestId,
            sessionId: decoded.sid,
            hasSession: !!session,
            sessionData: session ? {
                id: session.id,
                userId: session.userId,
                revokedAt: session.revokedAt,
                expiresAt: sessionExpiresAt,
                expiresAtDate: sessionExpiresAt ? (typeof sessionExpiresAt === 'object' && 'toDate' in sessionExpiresAt ? sessionExpiresAt.toDate().toISOString() : new Date(sessionExpiresAt).toISOString()) : null,
                now: now.toISOString(),
                isExpired,
                timeUntilExpiry,
                timeUntilExpiryMinutes: timeUntilExpiry / (1000 * 60)
            } : null
        }, 'Session validation result');
        if (!session || session.revokedAt || isExpired) {
            logger_1.logger.warn({
                requestId,
                sessionId: decoded.sid,
                hasSession: !!session,
                isRevoked: !!session?.revokedAt,
                isExpired,
                revokedAt: session?.revokedAt,
                endpoint: req.path,
                method: req.method
            }, 'Session validation failed');
            res.status(401).json({
                error: 'session_expired',
                message: 'Session has expired or been revoked'
            });
            return;
        }
        logger_1.logger.info({
            requestId,
            sessionId: decoded.sid,
            userId: decoded.sub,
            timeUntilExpiry,
            timeUntilExpiryMinutes: timeUntilExpiry / (1000 * 60)
        }, 'Session validation successful');
        // Add user to request object
        req.user = {
            id: user.id,
            email: user.email,
            name: user.name,
            avatar: user.avatar,
        };
        const processingTime = Date.now() - startTime;
        logger_1.logger.info({
            requestId,
            userId: decoded.sub,
            sessionId: decoded.sid,
            endpoint: req.path,
            method: req.method,
            processingTimeMs: processingTime,
            success: true
        }, 'Authentication completed successfully');
        next();
    }
    catch (error) {
        const processingTime = Date.now() - startTime;
        logger_1.logger.error({
            requestId,
            error: error instanceof Error ? {
                name: error.name,
                message: error.message,
                stack: error.stack
            } : error,
            endpoint: req.path,
            method: req.method,
            processingTimeMs: processingTime,
            operation: 'authentication'
        }, 'Authentication error occurred');
        res.status(500).json({
            error: 'internal_error',
            message: 'Authentication failed'
        });
    }
}
// Optional authentication middleware (doesn't fail if no token)
async function optionalAuth(req, res, next) {
    try {
        const authHeader = req.headers.authorization;
        const token = authHeader && authHeader.split(' ')[1];
        if (token) {
            const decoded = await tokenService_1.TokenService.verifyAccessToken(token);
            if (decoded) {
                const user = await userService_1.UserService.findById(decoded.sub);
                if (user && !userService_1.UserService.isUserLocked(user)) {
                    const session = await sessionService_1.SessionService.findById(decoded.sid);
                    if (session && !session.revokedAt && session.expiresAt > new Date()) {
                        req.user = {
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
    }
    catch (error) {
        // For optional auth, we don't fail on error, just continue without user
        logger_1.logger.warn({ err: error, operation: 'optionalAuth' }, 'Optional auth error');
        next();
    }
}
// Admin role check middleware
function requireAdmin(req, res, next) {
    const authReq = req;
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
