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
        logger_1.logger.info({
            token: token.substring(0, 20) + '...',
            tokenLength: token.length,
            endpoint: req.path,
            method: req.method,
            fullToken: token, // DEBUG: Show full token
            tokenParts: token.split('.')
        }, 'Verifying access token');
        const decoded = await tokenService_1.TokenService.verifyAccessToken(token);
        if (!decoded) {
            logger_1.logger.warn({
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
        logger_1.logger.info({
            userId: decoded.sub,
            endpoint: req.path,
            method: req.method
        }, 'Token verified successfully');
        // Get user information
        const user = await userService_1.UserService.findById(decoded.sub);
        if (!user) {
            res.status(401).json({
                error: 'user_not_found',
                message: 'User not found'
            });
            return;
        }
        // Check if user is locked
        if (userService_1.UserService.isUserLocked(user)) {
            res.status(423).json({
                error: 'account_locked',
                message: 'Account is temporarily locked'
            });
            return;
        }
        // Verify session is still active
        const session = await sessionService_1.SessionService.findById(decoded.sid);
        if (!session || session.revokedAt || session.expiresAt < new Date()) {
            res.status(401).json({
                error: 'session_expired',
                message: 'Session has expired or been revoked'
            });
            return;
        }
        // Add user to request object
        req.user = {
            id: user.id,
            email: user.email,
            name: user.name,
            avatar: user.avatar,
        };
        next();
    }
    catch (error) {
        logger_1.logger.error({ err: error, operation: 'authentication' }, 'Authentication error');
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
