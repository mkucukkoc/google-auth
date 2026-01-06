"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createGoogleAuthRouter = createGoogleAuthRouter;
const express_1 = require("express");
const axios_1 = __importDefault(require("axios"));
const uuid_1 = require("uuid");
const crypto_1 = require("crypto");
const config_1 = require("../config");
const redis_1 = require("../redis");
const userService_1 = require("../services/userService");
const sessionService_1 = require("../services/sessionService");
const auditService_1 = require("../services/auditService");
const rateLimitMiddleware_1 = require("../middleware/rateLimitMiddleware");
const firebase_1 = require("../firebase");
const logger_1 = require("../utils/logger");
const reactivationService_1 = require("../services/reactivationService");
const routeLogger_1 = require("../utils/routeLogger");
function createGoogleAuthRouter() {
    const r = (0, express_1.Router)();
    (0, routeLogger_1.attachRouteLogger)(r, 'googleAuth');
    r.post('/start', rateLimitMiddleware_1.authRateLimits.general, async (req, res) => {
        try {
            const ipAddress = req.ip || req.connection?.remoteAddress;
            const userAgent = req.get('User-Agent');
            logger_1.logger.info({ body: req.body, headers: req.headers, ipAddress, userAgent }, '[GoogleAuth] /start request payload');
            const { device_id } = req.body || {};
            if (!device_id) {
                logger_1.logger.warn({ ipAddress, userAgent }, '[GoogleAuth] Missing device_id');
                return res.status(400).json({ error: 'invalid_request' });
            }
            const id = (0, uuid_1.v4)();
            logger_1.logger.debug('[GoogleAuth] Generated state ID:', id);
            await (0, redis_1.setJson)(`gls:${id}`, { device_id, ipAddress, userAgent }, 600);
            logger_1.logger.debug('[GoogleAuth] Stored session in Redis');
            const params = new URLSearchParams({
                client_id: config_1.config.google.clientId,
                redirect_uri: config_1.config.google.redirectUri,
                response_type: 'code',
                scope: 'openid email profile',
                state: id,
            });
            const authUrl = `https://accounts.google.com/o/oauth2/auth?${params}`;
            logger_1.logger.info({ id, deviceId: device_id }, '[GoogleAuth] Generated auth URL');
            const responsePayload = { url: authUrl, id };
            logger_1.logger.debug({ response: responsePayload }, '[GoogleAuth] /start response payload');
            return res.json(responsePayload);
        }
        catch (error) {
            logger_1.logger.debug('[GoogleAuth] /start error:', error);
            logger_1.logger.error({ error }, 'Google auth start error');
            return res.status(500).json({ error: 'internal_error' });
        }
    });
    r.get('/status/:id', async (req, res) => {
        try {
            const requestPayload = { id: req.params.id };
            logger_1.logger.info(requestPayload, '[GoogleAuth] /status request payload');
            const session = await (0, redis_1.getJson)(`gls:${req.params.id}`);
            logger_1.logger.debug('[GoogleAuth] Retrieved session:', session);
            if (!session || !session.ready) {
                logger_1.logger.warn({ ...requestPayload, session }, '[GoogleAuth] Session not ready');
                const responsePayload = { ready: false };
                logger_1.logger.debug({ response: responsePayload }, '[GoogleAuth] /status response payload');
                return res.json(responsePayload);
            }
            logger_1.logger.info({ ...requestPayload, ready: true }, '[GoogleAuth] Session ready');
            logger_1.logger.debug({ response: session }, '[GoogleAuth] /status response payload');
            return res.json(session);
        }
        catch (error) {
            logger_1.logger.debug('[GoogleAuth] /status error:', error);
            logger_1.logger.error({ error }, 'Google auth status check error');
            return res.status(500).json({ error: 'internal_error' });
        }
    });
    r.get('/callback', rateLimitMiddleware_1.authRateLimits.general, async (req, res) => {
        const { code, state } = req.query;
        const ipAddress = req.ip || req.connection?.remoteAddress;
        const userAgent = req.get('User-Agent');
        logger_1.logger.info({ code, state, ipAddress, userAgent }, '[GoogleAuth] /callback request payload');
        if (typeof code !== 'string' || typeof state !== 'string') {
            logger_1.logger.warn('[GoogleAuth] /callback received invalid query parameters');
            return res.status(400).send('Invalid request');
        }
        const session = await (0, redis_1.getJson)(`gls:${state}`);
        if (!session || !session.device_id) {
            logger_1.logger.warn({ state }, '[GoogleAuth] Invalid or missing state session');
            return res.status(400).send('Invalid state');
        }
        try {
            const tokenResp = await axios_1.default.post('https://oauth2.googleapis.com/token', new URLSearchParams({
                code,
                client_id: config_1.config.google.clientId,
                client_secret: config_1.config.google.clientSecret,
                redirect_uri: config_1.config.google.redirectUri,
                grant_type: 'authorization_code',
            }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
            const { access_token } = tokenResp.data;
            const userResp = await axios_1.default.get(`https://www.googleapis.com/oauth2/v2/userinfo?access_token=${access_token}`);
            const payload = userResp.data;
            const email = payload?.email;
            const emailVerified = payload?.email_verified;
            if (!email)
                return res.status(400).send('No email');
            const ipAddress = req.ip || req.connection?.remoteAddress;
            const userAgent = req.get('User-Agent');
            // Check if user exists in our new auth system
            let user = await userService_1.UserService.findByEmail(email);
            let wasSoftDeleted = false;
            if (user && (user.provider === 'password' || (user.passwordHash && user.passwordHash.length > 0))) {
                const errorMessage = 'Bu e-posta şifreyle kayıtlı. Lütfen e-posta ve şifrenizle giriş yapın.';
                await auditService_1.auditService.logAuthEvent('login', {
                    userId: user.id,
                    ipAddress,
                    userAgent,
                    success: false,
                    errorMessage,
                });
                await (0, redis_1.setJson)(`gls:${state}`, {
                    ready: true,
                    error: 'password_account_exists',
                    message: errorMessage,
                    deviceId: session.device_id,
                }, 600);
                logger_1.logger.info({ email, state }, '[GoogleAuth] Password account exists - redirecting to app');
                const appRedirect = config_1.config.app?.redirectUri || 'avenia://auth';
                const redirectUrl = `${appRedirect}?state=${encodeURIComponent(state)}&error=password_account_exists`;
                return res.redirect(redirectUrl);
            }
            if (!user) {
                // Create new Google user in our auth system (this already handles Firebase Auth + subsc)
                user = await userService_1.UserService.createGoogleUser(email, payload?.name || payload?.given_name || '');
                logger_1.logger.info('Google user created successfully via callback', {
                    userId: user.id,
                    email: user.email,
                    operation: 'google_oauth_callback'
                });
            }
            else {
                const existingUser = user;
                if (!existingUser) {
                    throw new Error('Invariant: existing user expected');
                }
                if (existingUser.isDeleted || existingUser.is_deleted) {
                    wasSoftDeleted = true;
                    await (0, reactivationService_1.restoreSoftDeletedUser)(existingUser.id);
                    user = {
                        ...existingUser,
                        isDeleted: false,
                        is_deleted: false,
                        deletedAt: null,
                        premiumCancelledAt: null,
                    };
                }
                else {
                    user = existingUser;
                }
                // Update last login for existing user
                await userService_1.UserService.updateUser(existingUser.id, {
                    lastLoginAt: new Date(),
                    ...(existingUser.provider !== 'google' ? { provider: 'google' } : {}),
                });
                // Also update Firebase Auth user if needed
                try {
                    await firebase_1.admin.auth().updateUser(existingUser.id, {
                        displayName: payload?.name || payload?.given_name || existingUser.name,
                        emailVerified: true,
                    });
                }
                catch (error) {
                    logger_1.logger.warn('Failed to update Firebase Auth user via callback', { error, userId: existingUser.id });
                }
            }
            if (!user) {
                throw new Error('Google auth failed: user record missing after creation');
            }
            const ensuredUser = user;
            // Create session using new session system
            const deviceInfo = {
                os: 'unknown',
                model: 'unknown',
                appVersion: '1.0.0',
                platform: 'web',
            };
            const { session: newSession, tokens } = await sessionService_1.SessionService.createSession(ensuredUser.id, deviceInfo, session.device_id, ipAddress, userAgent);
            // Log successful Google auth
            await auditService_1.auditService.logAuthEvent('login', {
                userId: ensuredUser.id,
                sessionId: newSession.id,
                ipAddress,
                userAgent,
                deviceInfo,
                success: true,
            });
            if (wasSoftDeleted) {
                logger_1.logger.info({ userId: ensuredUser.id }, 'Soft-deleted Google user reactivated via callback, cleaning artifacts');
                await (0, reactivationService_1.cleanupDeletedAccountArtifacts)(ensuredUser.id);
                await (0, reactivationService_1.ensureFirebaseAuthUserProfile)(ensuredUser.id, {
                    email: ensuredUser.email,
                    name: ensuredUser.name,
                });
            }
            let firebaseCustomToken;
            try {
                firebaseCustomToken = await firebase_1.admin.auth().createCustomToken(ensuredUser.id, {
                    email: ensuredUser.email,
                    provider: 'google',
                });
            }
            catch (error) {
                logger_1.logger.warn('Failed to create Firebase custom token for Google user', {
                    error,
                    userId: ensuredUser.id,
                    operation: 'google_custom_token',
                });
            }
            const readyPayload = {
                ready: true,
                accessToken: tokens.accessToken,
                refreshToken: tokens.refreshToken,
                sessionId: tokens.sessionId,
                user: {
                    id: ensuredUser.id,
                    email: ensuredUser.email,
                    name: ensuredUser.name,
                    avatar: ensuredUser.avatar,
                },
                deviceId: session.device_id,
                firebaseCustomToken,
                firebase_token: firebaseCustomToken ?? null,
            };
            await (0, redis_1.setJson)(`gls:${state}`, readyPayload, 600);
            logger_1.logger.debug({ state, readyPayload }, '[GoogleAuth] /callback response payload');
            logger_1.logger.info({
                userId: user.id,
                state,
                redirectUriConfigured: config_1.config.google.redirectUri,
                appRedirectUri: config_1.config.app?.redirectUri,
                deviceId: session.device_id,
            }, '[GoogleAuth] /callback processed successfully');
            const appRedirect = config_1.config.app?.redirectUri || 'avenia://auth';
            const redirectUrl = `${appRedirect}?state=${encodeURIComponent(state)}&success=1`;
            return res.redirect(redirectUrl);
        }
        catch (error) {
            logger_1.logger.error({ err: error, operation: 'googleAuth' }, 'Google auth error');
            // Log the error for debugging
            await auditService_1.auditService.logAuthEvent('login', {
                ipAddress: req.ip || req.connection?.remoteAddress,
                userAgent: req.get('User-Agent'),
                success: false,
                errorMessage: error instanceof Error ? error.message : 'Unknown error',
            });
            return res.status(500).send('Authentication failed');
        }
    });
    return r;
}
function base64url(b) {
    const raw = Buffer.isBuffer(b) ? b : Buffer.from(b);
    return raw.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function sha256(input) {
    return (0, crypto_1.createHash)('sha256').update(input).digest('hex');
}
function addDays(d, days) {
    const x = new Date(d);
    x.setDate(d.getDate() + days);
    return x;
}
