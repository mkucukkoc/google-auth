"use strict";
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
const firebase_1 = require("../firebase");
const crypto_1 = require("crypto");
const email_1 = require("../email");
const redis_1 = require("../redis");
const logger_1 = require("../utils/logger");
const config_1 = require("../config");
function createAuthRouter() {
    const r = (0, express_1.Router)();
    // POST /auth/register
    r.post('/register', rateLimitMiddleware_1.authRateLimits.register, (0, validationMiddleware_1.validate)(validationMiddleware_1.authSchemas.register), async (req, res) => {
        try {
            const { email, password, device, deviceId, name } = req.body;
            const ipAddress = req.ip || req.connection?.remoteAddress;
            const userAgent = req.get('User-Agent');
            logger_1.logger.info({ email, deviceId, device, name, ipAddress }, 'Registration request payload');
            // Check if email is already registered
            let existingUser = await userService_1.UserService.findByEmail(email);
            if (existingUser) {
                const userRecord = existingUser;
                const isGoogleAccount = userRecord.provider === 'google' || (!userRecord.provider && !userRecord.passwordHash);
                const errorCode = isGoogleAccount ? 'google_account_exists' : 'email_already_registered';
                const errorMessage = isGoogleAccount
                    ? "This email is registered with a Google account. Please use 'Sign in with Google'."
                    : 'An account with this email already exists';
                const wasSoftDeleted = !isGoogleAccount && (userRecord.isDeleted || userRecord.is_deleted);
                if (wasSoftDeleted) {
                    await restoreSoftDeletedUser(userRecord.id);
                    if (password) {
                        await userService_1.UserService.updatePassword(userRecord.id, password);
                    }
                    const profileUpdates = {};
                    if (name && name !== userRecord.name) {
                        profileUpdates.name = name;
                    }
                    if (Object.keys(profileUpdates).length > 0) {
                        await userService_1.UserService.updateUser(userRecord.id, profileUpdates);
                    }
                    const reactivatedUser = {
                        ...userRecord,
                        ...profileUpdates,
                        isDeleted: false,
                        is_deleted: false,
                        deletedAt: null,
                        premiumCancelledAt: null,
                    };
                    existingUser = reactivatedUser;
                    await userService_1.UserService.resetFailedAttempts(userRecord.id);
                    const { session, tokens } = await sessionService_1.SessionService.createSession(userRecord.id, device, deviceId, ipAddress, userAgent);
                    await auditService_1.auditService.logAuthEvent('register', {
                        userId: userRecord.id,
                        sessionId: session.id,
                        ipAddress,
                        userAgent,
                        deviceInfo: device,
                        success: true,
                        reactivated: true,
                    });
                    logger_1.logger.info({ userId: userRecord.id }, 'Soft-deleted email/password user reactivated, cleaning artifacts');
                    await cleanupDeletedAccountArtifacts(userRecord.id);
                    let firebaseCustomToken;
                    try {
                        firebaseCustomToken = await firebase_1.admin.auth().createCustomToken(reactivatedUser.id, {
                            email: reactivatedUser.email,
                            provider: reactivatedUser.provider ?? 'password',
                        });
                    }
                    catch (error) {
                        logger_1.logger.warn({ error, userId: reactivatedUser.id, operation: 'register_reactivate' }, 'Failed to create Firebase custom token');
                    }
                    const response = {
                        ...tokens,
                        user: {
                            id: reactivatedUser.id,
                            email: reactivatedUser.email,
                            name: reactivatedUser.name,
                            avatar: reactivatedUser.avatar,
                        },
                        deviceId,
                        firebaseCustomToken,
                    };
                    await cleanupDeletedAccountArtifacts(userRecord.id);
                    return res
                        .status(200)
                        .json(response_1.ResponseBuilder.success(response, 'Existing account restored and signed in'));
                }
                await auditService_1.auditService.logAuthEvent('register', {
                    ipAddress,
                    userAgent,
                    deviceInfo: device,
                    success: false,
                    errorMessage,
                });
                return res.status(409).json({
                    error: errorCode,
                    message: errorMessage,
                });
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
            let firebaseCustomToken;
            try {
                firebaseCustomToken = await firebase_1.admin.auth().createCustomToken(user.id, {
                    email: user.email,
                    provider: user.provider ?? 'password',
                });
            }
            catch (error) {
                logger_1.logger.warn({ error, userId: user.id, operation: 'register' }, 'Failed to create Firebase custom token');
            }
            const response = {
                ...tokens,
                user: {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    avatar: user.avatar,
                },
                deviceId,
                firebaseCustomToken,
            };
            logger_1.logger.debug({ email, userId: user.id, response }, 'Registration response payload');
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
            logger_1.logger.info({ email, deviceId, device, ipAddress }, 'Login request payload');
            const foundUser = await userService_1.UserService.findByEmail(email);
            if (!foundUser) {
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
            let user = foundUser;
            const isSoftDeleted = user.isDeleted || user.is_deleted;
            if (isSoftDeleted) {
                await auditService_1.auditService.logAuthEvent('login', {
                    userId: user.id,
                    ipAddress,
                    userAgent,
                    deviceInfo: device,
                    success: false,
                    errorMessage: 'Account deleted, registration required',
                });
                return res.status(404).json({
                    error: 'account_deleted',
                    message: 'Hesabınız silinmiş. Lütfen yeniden kayıt olun.',
                });
            }
            const isGoogleAccount = user.provider === 'google' || (!user.provider && !user.passwordHash);
            if (isGoogleAccount) {
                const errorMessage = "Bu e-posta Google hesabı ile kayıtlı, lütfen 'Google ile giriş yap' seçeneğini kullanın.";
                await auditService_1.auditService.logAuthEvent('login', {
                    userId: user.id,
                    ipAddress,
                    userAgent,
                    deviceInfo: device,
                    success: false,
                    errorMessage,
                });
                return res.status(409).json({
                    error: 'google_account_exists',
                    message: errorMessage,
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
                const firebaseUser = await firebase_1.admin.auth().getUser(user.id);
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
            let firebaseCustomToken;
            try {
                firebaseCustomToken = await firebase_1.admin.auth().createCustomToken(user.id, {
                    email: user.email,
                    provider: user.provider ?? 'password',
                });
            }
            catch (error) {
                logger_1.logger.warn({ error, userId: user.id, operation: 'login' }, 'Failed to create Firebase custom token');
            }
            const response = {
                ...tokens,
                user: {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    avatar: user.avatar,
                },
                deviceId,
                firebaseCustomToken,
            };
            logger_1.logger.debug({ userId: user.id, response }, 'Login response payload');
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
            logger_1.logger.info({ sessionId, deviceId, ipAddress }, 'Token refresh request payload');
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
                logger_1.logger.debug({ sessionId, tokens: result.tokens }, 'Token refresh response payload');
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
    // POST /auth/firebase-token
    r.post('/firebase-token', rateLimitMiddleware_1.authRateLimits.general, authMiddleware_1.authenticateToken, async (req, res) => {
        const authReq = req;
        const user = authReq.user;
        if (!user?.id) {
            return res.status(401).json(response_1.ResponseBuilder.error('unauthorized', 'Authentication required to request Firebase token'));
        }
        try {
            const firebaseCustomToken = await firebase_1.admin.auth().createCustomToken(user.id, {
                email: user.email,
            });
            return res.json(response_1.ResponseBuilder.success({ firebaseCustomToken }, 'Firebase custom token generated successfully'));
        }
        catch (error) {
            logger_1.logger.error({ err: error, userId: user.id, operation: 'firebaseCustomToken' }, 'Failed to create Firebase custom token');
            return res.status(500).json(response_1.ResponseBuilder.error('firebase_token_creation_failed', 'Failed to generate Firebase custom token'));
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
            const responsePayload = { success };
            logger_1.logger.debug({ sessionId, response: responsePayload }, 'Logout response payload');
            res.json(responsePayload);
        }
        catch (error) {
            logger_1.logger.error('Logout error:', error);
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
            logger_1.logger.info({ userId: authReq.user?.id, ipAddress, userAgent }, 'Logout all request payload');
            await sessionService_1.SessionService.revokeAllUserSessions(authReq.user.id);
            await auditService_1.auditService.logAuthEvent('logout_all', {
                userId: authReq.user.id,
                ipAddress,
                userAgent,
                success: true,
            });
            const responsePayload = { success: true };
            logger_1.logger.debug({ userId: authReq.user.id, response: responsePayload }, 'Logout all response payload');
            res.json(responsePayload);
        }
        catch (error) {
            logger_1.logger.error('Logout all error:', error);
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
            logger_1.logger.info({ userId: authReq.user?.id }, 'Get current user payload');
            const user = await userService_1.UserService.findById(authReq.user.id);
            if (!user) {
                return res.status(404).json({
                    error: 'user_not_found',
                    message: 'User not found'
                });
            }
            const response = {
                id: user.id,
                email: user.email,
                name: user.name,
                avatar: user.avatar,
                isEmailVerified: user.isEmailVerified,
                createdAt: user.createdAt,
                lastLoginAt: user.lastLoginAt,
            };
            logger_1.logger.debug({ userId: user.id, response }, 'Get current user response payload');
            res.json(response);
        }
        catch (error) {
            logger_1.logger.error('Get user error:', error);
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
            const existingUserAfterOtp = await userService_1.UserService.findByEmail(email);
            if (existingUserAfterOtp) {
                const isGoogleAccount = existingUserAfterOtp.provider === 'google' || (!existingUserAfterOtp.provider && !existingUserAfterOtp.passwordHash);
                const errorCode = isGoogleAccount ? 'google_account_exists' : 'email_already_registered';
                const errorMessage = isGoogleAccount
                    ? "Bu e-posta Google hesabı ile kayıtlı, lütfen 'Google ile giriş yap' seçeneğini kullanın."
                    : 'An account with this email already exists';
                return res.status(409).json({
                    error: errorCode,
                    message: errorMessage
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
                logger_1.logger.error('Failed to send verification email:', emailError);
                // Don't fail the request if email sending fails
            }
            res.json({
                success: true,
                message: 'Verification code sent to your email'
            });
        }
        catch (error) {
            logger_1.logger.error('Send registration OTP error:', error);
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
                const aTime = a.data().createdAt?.toDate ? a.data().createdAt.toDate() : (a.data().createdAt || new Date(0));
                const bTime = b.data().createdAt?.toDate ? b.data().createdAt.toDate() : (b.data().createdAt || new Date(0));
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
            const existingUser = await userService_1.UserService.findByEmail(email);
            if (existingUser) {
                const isGoogleAccount = existingUser.provider === 'google' || (!existingUser.provider && !existingUser.passwordHash);
                const errorCode = isGoogleAccount ? 'google_account_exists' : 'email_already_registered';
                const errorMessage = isGoogleAccount
                    ? "Bu e-posta Google hesabı ile kayıtlı, lütfen 'Google ile giriş yap' seçeneğini kullanın."
                    : 'An account with this email already exists';
                return res.status(409).json({
                    error: errorCode,
                    message: errorMessage
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
            let firebaseCustomToken;
            try {
                firebaseCustomToken = await firebase_1.admin.auth().createCustomToken(user.id, {
                    email: user.email,
                    provider: user.provider ?? 'password',
                });
            }
            catch (error) {
                logger_1.logger.warn({ error, userId: user.id, operation: 'register_verify' }, 'Failed to create Firebase custom token');
            }
            const response = {
                ...tokens,
                user: {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    avatar: user.avatar,
                },
                deviceId,
                firebaseCustomToken,
            };
            res.status(201).json(response);
        }
        catch (error) {
            logger_1.logger.error('Verify registration OTP error:', error);
            res.status(500).json({
                error: 'internal_error',
                message: 'Registration verification failed'
            });
        }
    });
    // Google OAuth endpoint
    r.post('/google', rateLimitMiddleware_1.authRateLimits.general, async (req, res) => {
        try {
            const { idToken, email, name, photo } = req.body;
            if (!idToken || !email) {
                return res.status(400).json({
                    error: 'invalid_request',
                    message: 'Missing required fields: idToken and email'
                });
            }
            // Verify Google ID token
            const { OAuth2Client } = require('google-auth-library');
            const client = new OAuth2Client(config_1.config.google.clientId);
            let ticket;
            try {
                ticket = await client.verifyIdToken({
                    idToken,
                    audience: config_1.config.google.clientId,
                });
            }
            catch (error) {
                logger_1.logger.error('Google ID token verification failed:', error);
                return res.status(401).json({
                    error: 'invalid_token',
                    message: 'Invalid Google ID token'
                });
            }
            const payload = ticket.getPayload();
            if (!payload || payload.email !== email) {
                return res.status(401).json({
                    error: 'invalid_token',
                    message: 'Token email does not match provided email'
                });
            }
            const ipAddress = req.ip || req.connection?.remoteAddress;
            const userAgent = req.get('User-Agent');
            // Check if user exists
            let user = await userService_1.UserService.findByEmail(email);
            let wasSoftDeleted = false;
            if (!user) {
                user = await userService_1.UserService.createGoogleUser(email, name || payload.name || payload.given_name || '');
                logger_1.logger.info('Google user created successfully', {
                    userId: user.id,
                    email: user.email,
                    operation: 'google_oauth'
                });
            }
            else {
                const existingUser = user;
                if (existingUser.isDeleted || existingUser.is_deleted) {
                    wasSoftDeleted = true;
                    await restoreSoftDeletedUser(existingUser.id);
                    user = {
                        ...existingUser,
                        isDeleted: false,
                        is_deleted: false,
                        deletedAt: null,
                        premiumCancelledAt: null,
                    };
                }
                // Update last login for existing user
                await userService_1.UserService.updateUser(existingUser.id, {
                    lastLoginAt: new Date(),
                });
                // Also update Firebase Auth user if needed
                try {
                    await firebase_1.admin.auth().updateUser(existingUser.id, {
                        displayName: name || payload.name || payload.given_name || existingUser.name,
                        emailVerified: true,
                    });
                }
                catch (error) {
                    logger_1.logger.warn('Failed to update Firebase Auth user', { error, userId: existingUser.id });
                }
            }
            const ensuredUser = user;
            // Create session
            const deviceInfo = {
                os: 'mobile',
                model: 'unknown',
                appVersion: '1.0.0',
                platform: 'mobile',
            };
            const { session, tokens } = await sessionService_1.SessionService.createSession(ensuredUser.id, deviceInfo, 'google-auth-device', // Device ID for Google auth
            ipAddress, userAgent);
            // Log successful Google auth
            await auditService_1.auditService.logAuthEvent('login', {
                userId: ensuredUser.id,
                sessionId: session.id,
                ipAddress,
                userAgent,
                deviceInfo,
                success: true,
            });
            if (wasSoftDeleted) {
                logger_1.logger.info({ userId: ensuredUser.id }, 'Soft-deleted Google user reactivated, cleaning artifacts');
                await cleanupDeletedAccountArtifacts(ensuredUser.id);
            }
            let firebaseCustomToken;
            try {
                firebaseCustomToken = await firebase_1.admin.auth().createCustomToken(ensuredUser.id, {
                    email: ensuredUser.email,
                    provider: 'google',
                });
            }
            catch (error) {
                logger_1.logger.warn({ error, userId: ensuredUser.id, operation: 'google_direct' }, 'Failed to create Firebase custom token');
            }
            const response = {
                ...tokens,
                user: {
                    id: ensuredUser.id,
                    email: ensuredUser.email,
                    name: ensuredUser.name,
                    avatar: ensuredUser.avatar,
                },
                deviceId: 'google-auth-device',
                firebaseCustomToken,
            };
            res.json(response);
        }
        catch (error) {
            logger_1.logger.error('Google auth error:', error);
            res.status(500).json({
                error: 'internal_error',
                message: 'Google authentication failed'
            });
        }
    });
    // Test Firebase connection endpoint
    r.get('/test-firebase', async (req, res) => {
        try {
            // Test Firestore connection
            const testDoc = await firebase_1.db.collection('test').doc('connection').set({
                timestamp: new Date(),
                message: 'Firebase connection test'
            });
            // Test Firebase Auth
            const testUser = await firebase_1.admin.auth().createUser({
                uid: 'test-user-' + Date.now(),
                email: 'test@example.com',
                displayName: 'Test User',
                emailVerified: false
            });
            // Clean up test user
            await firebase_1.admin.auth().deleteUser(testUser.uid);
            res.json({
                success: true,
                message: 'Firebase connection successful',
                firestore: 'Connected',
                auth: 'Connected',
                timestamp: new Date().toISOString()
            });
        }
        catch (error) {
            console.error('Firebase test error:', error);
            res.status(500).json({
                success: false,
                message: 'Firebase connection failed',
                error: error.message || 'Unknown error',
                timestamp: new Date().toISOString()
            });
        }
    });
    return r;
}
// Helper functions
async function restoreSoftDeletedUser(userId) {
    try {
        await firebase_1.db
            .collection('subsc')
            .doc(userId)
            .set({
            isDeleted: false,
            is_deleted: false,
            deletedAt: null,
            premiumCancelledAt: null,
            restoredAt: new Date().toISOString(),
        }, { merge: true });
        logger_1.logger.info({ userId }, 'Soft-deleted user reactivated');
    }
    catch (error) {
        logger_1.logger.warn({ error, userId }, 'Failed to clear soft delete flags during reactivation');
        return;
    }
}
async function cleanupDeletedAccountArtifacts(userId) {
    logger_1.logger.info({ userId }, 'Cleaning up deleted account artifacts');
    const cleanupJobs = [
        deleteDocumentIfExists('deleted_users_subsc', userId, 'deleted_users_subsc record'),
        deleteDocumentIfExists('notification_blacklist', userId, 'notification blacklist record'),
        deleteDeletionJobsForUser(userId),
        deleteTelemetryEventsForUser(userId),
    ];
    await Promise.all(cleanupJobs);
    logger_1.logger.info({ userId }, 'Deleted account artifacts cleanup finished');
}
async function deleteDocumentIfExists(collection, docId, logLabel) {
    try {
        const ref = firebase_1.db.collection(collection).doc(docId);
        const doc = await ref.get();
        if (!doc.exists) {
            logger_1.logger.debug({ docId, collection }, `No ${logLabel} found during restore`);
            return;
        }
        await ref.delete();
        logger_1.logger.info({ docId, collection }, `${logLabel} deleted during restore`);
    }
    catch (error) {
        logger_1.logger.warn({ error, docId, collection }, `Failed to delete ${logLabel} during restore`);
    }
}
async function deleteDeletionJobsForUser(userId) {
    try {
        const snapshot = await firebase_1.db
            .collection('deletion_jobs')
            .where('userId', '==', userId)
            .limit(100)
            .get();
        if (snapshot.empty) {
            logger_1.logger.debug({ userId }, 'No deletion jobs found for cleanup');
            return;
        }
        const batch = firebase_1.db.batch();
        snapshot.docs.forEach((doc) => batch.delete(doc.ref));
        await batch.commit();
        logger_1.logger.info({ userId, deletedJobs: snapshot.size }, 'Deletion job records cleaned up for user restore');
        if (snapshot.size === 100) {
            await deleteDeletionJobsForUser(userId);
        }
    }
    catch (error) {
        logger_1.logger.warn({ error, userId }, 'Failed to cleanup deletion job records during user restore');
    }
}
async function deleteTelemetryEventsForUser(userId) {
    try {
        const snapshot = await firebase_1.db
            .collection('telemetry_events')
            .where('userId', '==', userId)
            .where('event', '==', 'DELETE_ACCOUNT')
            .limit(100)
            .get();
        if (snapshot.empty) {
            logger_1.logger.debug({ userId }, 'No telemetry events found for cleanup');
            return;
        }
        const batch = firebase_1.db.batch();
        snapshot.docs.forEach((doc) => batch.delete(doc.ref));
        await batch.commit();
        logger_1.logger.info({ userId, deletedEvents: snapshot.size }, 'Telemetry events cleaned up for user restore');
        if (snapshot.size === 100) {
            await deleteTelemetryEventsForUser(userId);
        }
    }
    catch (error) {
        logger_1.logger.warn({ error, userId }, 'Failed to cleanup telemetry events during user restore');
    }
}
function sha256(input) {
    return (0, crypto_1.createHash)('sha256').update(input).digest('hex');
}
