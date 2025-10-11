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
const logger_1 = require("../utils/logger");
function createGoogleAuthRouter() {
    const r = (0, express_1.Router)();
    r.post('/start', rateLimitMiddleware_1.authRateLimits.general, async (req, res) => {
        try {
            console.log('[GoogleAuth] /start endpoint called:', {
                body: req.body,
                headers: req.headers
            });
            const { device_id } = req.body || {};
            if (!device_id) {
                console.log('[GoogleAuth] Missing device_id');
                return res.status(400).json({ error: 'invalid_request' });
            }
            const id = (0, uuid_1.v4)();
            console.log('[GoogleAuth] Generated state ID:', id);
            await (0, redis_1.setJson)(`gls:${id}`, { device_id }, 600);
            console.log('[GoogleAuth] Stored session in Redis');
            const params = new URLSearchParams({
                client_id: config_1.config.google.clientId,
                redirect_uri: config_1.config.google.redirectUri,
                response_type: 'code',
                scope: 'openid email profile',
                state: id,
            });
            const authUrl = `https://accounts.google.com/o/oauth2/auth?${params}`;
            console.log('[GoogleAuth] Generated auth URL:', authUrl);
            return res.json({ url: authUrl });
        }
        catch (error) {
            console.log('[GoogleAuth] /start error:', error);
            logger_1.logger.error({ error }, 'Google auth start error');
            return res.status(500).json({ error: 'internal_error' });
        }
    });
    r.get('/status/:id', async (req, res) => {
        try {
            console.log('[GoogleAuth] /status endpoint called for ID:', req.params.id);
            const session = await (0, redis_1.getJson)(`gls:${req.params.id}`);
            console.log('[GoogleAuth] Retrieved session:', session);
            if (!session || !session.ready) {
                console.log('[GoogleAuth] Session not ready');
                return res.json({ ready: false });
            }
            console.log('[GoogleAuth] Session ready, returning data');
            return res.json(session);
        }
        catch (error) {
            console.log('[GoogleAuth] /status error:', error);
            logger_1.logger.error({ error }, 'Google auth status check error');
            return res.status(500).json({ error: 'internal_error' });
        }
    });
    r.get('/callback', rateLimitMiddleware_1.authRateLimits.general, async (req, res) => {
        const { code, state } = req.query;
        if (typeof code !== 'string' || typeof state !== 'string') {
            return res.status(400).send('Invalid request');
        }
        const session = await (0, redis_1.getJson)(`gls:${state}`);
        if (!session || !session.device_id) {
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
            if (!user) {
                // Create new Google user in our auth system
                user = await userService_1.UserService.createGoogleUser(email, payload?.name || payload?.given_name || '');
            }
            else {
                // Update last login for existing user
                await userService_1.UserService.updateUser(user.id, {
                    lastLoginAt: new Date(),
                });
            }
            // Create session using new session system
            const deviceInfo = {
                os: 'unknown',
                model: 'unknown',
                appVersion: '1.0.0',
                platform: 'web',
            };
            const { session: newSession, tokens } = await sessionService_1.SessionService.createSession(user.id, deviceInfo, session.device_id, ipAddress, userAgent);
            // Log successful Google auth
            await auditService_1.auditService.logAuthEvent('login', {
                userId: user.id,
                sessionId: newSession.id,
                ipAddress,
                userAgent,
                deviceInfo,
                success: true,
            });
            // Firebase custom token no longer needed with new auth system
            console.log(`Mock Google Auth: Skipping Firebase custom token for user ${user.id}`);
            const firebaseToken = null;
            await (0, redis_1.setJson)(`gls:${state}`, {
                ready: true,
                accessToken: tokens.accessToken,
                refreshToken: tokens.refreshToken,
                sessionId: tokens.sessionId,
                user: {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    avatar: user.avatar,
                },
                deviceId: session.device_id,
                firebase_token: firebaseToken, // Keep for backward compatibility
            }, 600);
            return res.send('<html><body>Login successful. You may close this window.</body></html>');
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
