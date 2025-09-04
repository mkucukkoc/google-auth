"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAuthRouter = createAuthRouter;
const express_1 = require("express");
const userService_1 = require("../services/userService");
const sessionService_1 = require("../services/sessionService");
const auditService_1 = require("../services/auditService");
const authMiddleware_1 = require("../middleware/authMiddleware");
const validationMiddleware_1 = require("../middleware/validationMiddleware");
const rateLimitMiddleware_1 = require("../middleware/rateLimitMiddleware");
const firebase_admin_1 = __importDefault(require("firebase-admin"));
function createAuthRouter() {
    const r = (0, express_1.Router)();
    // POST /auth/register
    r.post('/register', rateLimitMiddleware_1.authRateLimits.register, (0, validationMiddleware_1.validate)(validationMiddleware_1.authSchemas.register), async (req, res) => {
        try {
            const { email, password, device, deviceId, name } = req.body;
            const ipAddress = req.ip || req.connection?.remoteAddress;
            const userAgent = req.get('User-Agent');
            // Check if email is already registered
            if (await userService_1.UserService.isEmailRegistered(email)) {
                await auditService_1.AuditService.logAuthEvent('register', {
                    ipAddress,
                    userAgent,
                    deviceInfo: device,
                    success: false,
                    errorMessage: 'Email already registered',
                });
                return res.status(409).json({
                    error: 'email_already_registered',
                    message: 'An account with this email already exists'
                });
            }
            // Create user
            const user = await userService_1.UserService.createUser({ email, password, device, deviceId, name });
            // Create session
            const { session, tokens } = await sessionService_1.SessionService.createSession(user.id, device, deviceId, ipAddress, userAgent);
            // Log successful registration
            await auditService_1.AuditService.logAuthEvent('register', {
                userId: user.id,
                sessionId: session.id,
                ipAddress,
                userAgent,
                deviceInfo: device,
                success: true,
            });
            const response = {
                ...tokens,
                user: {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    avatar: user.avatar,
                },
                deviceId,
            };
            res.status(201).json(response);
        }
        catch (error) {
            console.error('Registration error:', error);
            res.status(500).json({
                error: 'internal_error',
                message: 'Registration failed'
            });
        }
    });
    // POST /auth/login
    r.post('/login', rateLimitMiddleware_1.authRateLimits.login, (0, validationMiddleware_1.validate)(validationMiddleware_1.authSchemas.login), async (req, res) => {
        try {
            const { email, password, device, deviceId } = req.body;
            const ipAddress = req.ip || req.connection?.remoteAddress;
            const userAgent = req.get('User-Agent');
            // Find user
            const user = await userService_1.UserService.findByEmail(email);
            if (!user) {
                await auditService_1.AuditService.logAuthEvent('login', {
                    ipAddress,
                    userAgent,
                    deviceInfo: device,
                    success: false,
                    errorMessage: 'User not found',
                });
                return res.status(401).json({
                    error: 'invalid_credentials',
                    message: 'Invalid email or password'
                });
            }
            // Check if user is locked
            if (userService_1.UserService.isUserLocked(user)) {
                await auditService_1.AuditService.logAuthEvent('login', {
                    userId: user.id,
                    ipAddress,
                    userAgent,
                    deviceInfo: device,
                    success: false,
                    errorMessage: 'Account locked',
                });
                return res.status(423).json({
                    error: 'account_locked',
                    message: 'Account is temporarily locked due to too many failed attempts'
                });
            }
            // Verify password
            const isValidPassword = await userService_1.UserService.verifyPassword(user, password);
            if (!isValidPassword) {
                await userService_1.UserService.incrementFailedAttempts(user.id);
                await auditService_1.AuditService.logAuthEvent('login', {
                    userId: user.id,
                    ipAddress,
                    userAgent,
                    deviceInfo: device,
                    success: false,
                    errorMessage: 'Invalid password',
                });
                return res.status(401).json({
                    error: 'invalid_credentials',
                    message: 'Invalid email or password'
                });
            }
            // Reset failed attempts on successful login
            await userService_1.UserService.resetFailedAttempts(user.id);
            // Verify Firebase authentication user exists
            try {
                const firebaseUser = await firebase_admin_1.default.auth().getUser(user.id);
                console.log('Firebase user verified for login:', firebaseUser.uid, firebaseUser.email);
            }
            catch (error) {
                console.error('Firebase user verification failed during login:', error);
                // Continue with login even if Firebase verification fails
            }
            // Create session
            const { session, tokens } = await sessionService_1.SessionService.createSession(user.id, device, deviceId, ipAddress, userAgent);
            // Log successful login
            await auditService_1.AuditService.logAuthEvent('login', {
                userId: user.id,
                sessionId: session.id,
                ipAddress,
                userAgent,
                deviceInfo: device,
                success: true,
            });
            const response = {
                ...tokens,
                user: {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    avatar: user.avatar,
                },
                deviceId,
            };
            res.json(response);
        }
        catch (error) {
            console.error('Login error:', error);
            res.status(500).json({
                error: 'internal_error',
                message: 'Login failed'
            });
        }
    });
    // POST /auth/refresh
    r.post('/refresh', rateLimitMiddleware_1.authRateLimits.refresh, (0, validationMiddleware_1.validate)(validationMiddleware_1.authSchemas.refresh), async (req, res) => {
        try {
            const { refreshToken, sessionId, deviceId } = req.body;
            const ipAddress = req.ip || req.connection?.remoteAddress;
            const userAgent = req.get('User-Agent');
            try {
                const result = await sessionService_1.SessionService.verifyAndRotateRefreshToken(sessionId, refreshToken, deviceId);
                if (!result) {
                    await auditService_1.AuditService.logAuthEvent('refresh', {
                        sessionId,
                        ipAddress,
                        userAgent,
                        success: false,
                        errorMessage: 'Invalid session or token',
                    });
                    return res.status(401).json({
                        error: 'invalid_refresh_token',
                        message: 'Invalid or expired refresh token'
                    });
                }
                // Log successful refresh
                await auditService_1.AuditService.logAuthEvent('refresh', {
                    userId: result.session.userId,
                    sessionId: result.session.id,
                    ipAddress,
                    userAgent,
                    success: true,
                });
                res.json(result.tokens);
            }
            catch (error) {
                if (error.message === 'REUSE_DETECTED') {
                    await auditService_1.AuditService.logAuthEvent('reuse_detected', {
                        sessionId,
                        ipAddress,
                        userAgent,
                        success: false,
                        errorMessage: 'Refresh token reuse detected',
                    });
                    return res.status(401).json({
                        error: 'token_reuse_detected',
                        message: 'Security violation detected. All sessions have been revoked.'
                    });
                }
                throw error;
            }
        }
        catch (error) {
            console.error('Refresh error:', error);
            res.status(500).json({
                error: 'internal_error',
                message: 'Token refresh failed'
            });
        }
    });
    // POST /auth/logout
    r.post('/logout', rateLimitMiddleware_1.authRateLimits.general, (0, validationMiddleware_1.validate)(validationMiddleware_1.authSchemas.logout), async (req, res) => {
        try {
            const { sessionId } = req.body;
            const ipAddress = req.ip || req.connection?.remoteAddress;
            const userAgent = req.get('User-Agent');
            const success = await sessionService_1.SessionService.revokeSession(sessionId);
            if (success) {
                await auditService_1.AuditService.logAuthEvent('logout', {
                    sessionId,
                    ipAddress,
                    userAgent,
                    success: true,
                });
            }
            res.json({ success });
        }
        catch (error) {
            console.error('Logout error:', error);
            res.status(500).json({
                error: 'internal_error',
                message: 'Logout failed'
            });
        }
    });
    // POST /auth/logout-all
    r.post('/logout-all', rateLimitMiddleware_1.authRateLimits.general, authMiddleware_1.authenticateToken, async (req, res) => {
        const authReq = req;
        try {
            const ipAddress = req.ip || req.connection?.remoteAddress;
            const userAgent = req.get('User-Agent');
            await sessionService_1.SessionService.revokeAllUserSessions(authReq.user.id);
            await auditService_1.AuditService.logAuthEvent('logout_all', {
                userId: authReq.user.id,
                ipAddress,
                userAgent,
                success: true,
            });
            res.json({ success: true });
        }
        catch (error) {
            console.error('Logout all error:', error);
            res.status(500).json({
                error: 'internal_error',
                message: 'Logout failed'
            });
        }
    });
    // GET /auth/me
    r.get('/me', authMiddleware_1.authenticateToken, async (req, res) => {
        const authReq = req;
        try {
            const user = await userService_1.UserService.findById(authReq.user.id);
            if (!user) {
                return res.status(404).json({
                    error: 'user_not_found',
                    message: 'User not found'
                });
            }
            res.json({
                id: user.id,
                email: user.email,
                name: user.name,
                avatar: user.avatar,
                isEmailVerified: user.isEmailVerified,
                createdAt: user.createdAt,
                lastLoginAt: user.lastLoginAt,
            });
        }
        catch (error) {
            console.error('Get user error:', error);
            res.status(500).json({
                error: 'internal_error',
                message: 'Failed to get user information'
            });
        }
    });
    return r;
}
