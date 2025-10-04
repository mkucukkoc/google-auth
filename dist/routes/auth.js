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
const response_1 = require("../types/response");
const firebase_admin_1 = __importDefault(require("firebase-admin"));
const crypto_1 = require("crypto");
const email_1 = require("../email");
const redis_1 = require("../redis");
const firebase_1 = require("../firebase");
const logger_1 = require("../utils/logger");
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
                await auditService_1.auditService.logAuthEvent('register', {
                    ipAddress,
                    userAgent,
                    deviceInfo: device,
                    success: false,
                    errorMessage: 'Email already registered',
                });
                return res.status(409).json(response_1.ResponseBuilder.error('email_already_registered', 'An account with this email already exists'));
            }
            // Create user
            const user = await userService_1.UserService.createUser({ email, password, device, deviceId, name });
            // Create session
            const { session, tokens } = await sessionService_1.SessionService.createSession(user.id, device, deviceId, ipAddress, userAgent);
            // Log successful registration
            await auditService_1.auditService.logAuthEvent('register', {
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
            res.status(201).json(response_1.ResponseBuilder.success(response, 'User registered successfully'));
        }
        catch (error) {
            logger_1.logger.error({ err: error, email: req.body.email, operation: 'register' }, 'Registration error');
            res.status(500).json(response_1.ResponseBuilder.error('internal_error', 'Registration failed'));
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
                await auditService_1.auditService.logAuthEvent('login', {
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
                await auditService_1.auditService.logAuthEvent('login', {
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
                await auditService_1.auditService.logAuthEvent('login', {
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
                logger_1.logger.info({ userId: firebaseUser.uid, email: firebaseUser.email, operation: 'firebaseVerification' }, 'Firebase user verified for login');
            }
            catch (error) {
                logger_1.logger.warn({ err: error, userId: user.id, operation: 'firebaseVerification' }, 'Firebase user verification failed during login');
                // Continue with login even if Firebase verification fails
            }
            // Create session
            const { session, tokens } = await sessionService_1.SessionService.createSession(user.id, device, deviceId, ipAddress, userAgent);
            // Log successful login
            await auditService_1.auditService.logAuthEvent('login', {
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
            logger_1.logger.error({ err: error, email: req.body.email, operation: 'login' }, 'Login error');
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
                    await auditService_1.auditService.logAuthEvent('refresh', {
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
                await auditService_1.auditService.logAuthEvent('refresh', {
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
                    await auditService_1.auditService.logAuthEvent('reuse_detected', {
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
            logger_1.logger.error({ err: error, operation: 'refresh' }, 'Refresh error');
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
                await auditService_1.auditService.logAuthEvent('logout', {
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
            await auditService_1.auditService.logAuthEvent('logout_all', {
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
    // POST /auth/register/email/start - Send verification code for registration
    r.post('/register/email/start', rateLimitMiddleware_1.authRateLimits.register, async (req, res) => {
        try {
            const { email } = req.body;
            if (!email) {
                return res.status(400).json({
                    error: 'invalid_request',
                    message: 'Email is required'
                });
            }
            // Check if email is already registered
            if (await userService_1.UserService.isEmailRegistered(email)) {
                return res.status(409).json({
                    error: 'email_already_registered',
                    message: 'An account with this email already exists'
                });
            }
            // Rate limiting for email sending
            const key = `register_otp:rl:${email}`;
            const rl = (await (0, redis_1.getJson)(key)) || { count: 0 };
            if (rl.count >= 5) {
                return res.status(429).json({
                    error: 'rate_limited',
                    message: 'Too many verification attempts. Please try again later.'
                });
            }
            rl.count += 1;
            await (0, redis_1.setJson)(key, rl, 600); // 10 minutes
            // Generate and store OTP
            const code = ((0, crypto_1.randomInt)(0, 999999) + '').padStart(6, '0');
            const codeHash = sha256(code);
            await firebase_1.db.collection('registerOtpCodes').add({
                email,
                codeHash,
                expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
                createdAt: new Date()
            });
            // Send email
            try {
                await (0, email_1.sendOtpEmail)(email, code);
            }
            catch (emailError) {
                console.error('Failed to send verification email:', emailError);
                // Don't fail the request if email sending fails
            }
            res.json({
                success: true,
                message: 'Verification code sent to your email'
            });
        }
        catch (error) {
            console.error('Send registration OTP error:', error);
            res.status(500).json({
                error: 'internal_error',
                message: 'Failed to send verification code'
            });
        }
    });
    // POST /auth/register/email/verify - Verify code and complete registration
    r.post('/register/email/verify', rateLimitMiddleware_1.authRateLimits.register, async (req, res) => {
        try {
            const { email, otp, password, name, device, deviceId } = req.body;
            if (!email || !otp || !password || !device || !deviceId) {
                return res.status(400).json({
                    error: 'invalid_request',
                    message: 'Email, OTP, password, device, and deviceId are required'
                });
            }
            // Verify OTP - Get all records for email and sort in memory
            const recordSnap = await firebase_1.db
                .collection('registerOtpCodes')
                .where('email', '==', email)
                .get();
            if (recordSnap.empty) {
                return res.status(400).json({
                    error: 'invalid_otp',
                    message: 'Invalid or expired verification code'
                });
            }
            // Sort by createdAt in memory and get the most recent
            const sortedDocs = recordSnap.docs.sort((a, b) => {
                const aTime = a.data().createdAt?.toDate?.() || new Date(0);
                const bTime = b.data().createdAt?.toDate?.() || new Date(0);
                return bTime.getTime() - aTime.getTime();
            });
            const doc = sortedDocs[0];
            const record = doc.data();
            if (record.expiresAt.toDate() < new Date()) {
                await doc.ref.delete(); // Clean up expired code
                return res.status(400).json({
                    error: 'invalid_otp',
                    message: 'Verification code has expired'
                });
            }
            const isMatch = record.codeHash === sha256(otp);
            if (!isMatch) {
                return res.status(400).json({
                    error: 'invalid_otp',
                    message: 'Invalid verification code'
                });
            }
            // Clean up the OTP code
            await doc.ref.delete();
            // Check if email is still available (double-check)
            if (await userService_1.UserService.isEmailRegistered(email)) {
                return res.status(409).json({
                    error: 'email_already_registered',
                    message: 'An account with this email already exists'
                });
            }
            // Create user
            const user = await userService_1.UserService.createUser({ email, password, device, deviceId, name });
            // Create session
            const ipAddress = req.ip || req.connection?.remoteAddress;
            const userAgent = req.get('User-Agent');
            const { session, tokens } = await sessionService_1.SessionService.createSession(user.id, device, deviceId, ipAddress, userAgent);
            // Log successful registration
            await auditService_1.auditService.logAuthEvent('register', {
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
            console.error('Verify registration OTP error:', error);
            res.status(500).json({
                error: 'internal_error',
                message: 'Registration verification failed'
            });
        }
    });
    return r;
}
// Helper functions
function sha256(input) {
    return (0, crypto_1.createHash)('sha256').update(input).digest('hex');
}
