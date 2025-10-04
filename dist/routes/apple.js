"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAppleAuthRouter = createAppleAuthRouter;
const express_1 = require("express");
const axios_1 = __importDefault(require("axios"));
const uuid_1 = require("uuid");
const config_1 = require("../config");
const redis_1 = require("../redis");
const userService_1 = require("../services/userService");
const sessionService_1 = require("../services/sessionService");
const auditService_1 = require("../services/auditService");
const rateLimitMiddleware_1 = require("../middleware/rateLimitMiddleware");
const firebase_admin_1 = __importDefault(require("firebase-admin"));
const logger_1 = require("../utils/logger");
const jwt = __importStar(require("jsonwebtoken"));
function createAppleAuthRouter() {
    const r = (0, express_1.Router)();
    r.post('/start', rateLimitMiddleware_1.authRateLimits.general, async (req, res) => {
        const { device_id } = req.body || {};
        if (!device_id)
            return res.status(400).json({ error: 'invalid_request' });
        const id = (0, uuid_1.v4)();
        await (0, redis_1.setJson)(`als:${id}`, { device_id }, 600);
        // Generate Apple client secret (JWT)
        const clientSecret = generateAppleClientSecret();
        const params = new URLSearchParams({
            client_id: config_1.config.apple.clientId,
            redirect_uri: config_1.config.apple.redirectUri,
            response_type: 'code',
            scope: 'name email',
            state: id,
            response_mode: 'form_post',
        });
        return res.json({
            url: `https://appleid.apple.com/auth/authorize?${params}`,
            clientSecret
        });
    });
    r.get('/status/:id', async (req, res) => {
        const session = await (0, redis_1.getJson)(`als:${req.params.id}`);
        if (!session)
            return res.json({ ready: false });
        return res.json(session);
    });
    r.post('/callback', rateLimitMiddleware_1.authRateLimits.general, async (req, res) => {
        const { code, state, user } = req.body;
        if (!code || !state) {
            return res.status(400).send('Invalid request');
        }
        const session = await (0, redis_1.getJson)(`als:${state}`);
        if (!session || !session.device_id) {
            return res.status(400).send('Invalid state');
        }
        try {
            // Exchange code for access token
            const tokenResp = await axios_1.default.post('https://appleid.apple.com/auth/token', new URLSearchParams({
                client_id: config_1.config.apple.clientId,
                client_secret: generateAppleClientSecret(),
                code,
                grant_type: 'authorization_code',
                redirect_uri: config_1.config.apple.redirectUri,
            }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
            const { access_token, id_token } = tokenResp.data;
            // Decode ID token to get user info
            const decodedToken = jwt.decode(id_token);
            const email = decodedToken?.email;
            const name = user?.name ? `${user.name.firstName} ${user.name.lastName}` : '';
            if (!email)
                return res.status(400).send('No email');
            const ipAddress = req.ip || req.connection?.remoteAddress;
            const userAgent = req.get('User-Agent');
            // Check if user exists in our new auth system
            let userRecord = await userService_1.UserService.findByEmail(email);
            if (!userRecord) {
                // Create new Apple user in our auth system
                userRecord = await userService_1.UserService.createAppleUser(email, name);
            }
            else {
                // Update last login for existing user
                await userService_1.UserService.updateUser(userRecord.id, {
                    lastLoginAt: new Date(),
                });
            }
            // Create session using new session system
            const deviceInfo = {
                os: 'ios',
                model: 'unknown',
                appVersion: '1.0.0',
                platform: 'mobile',
            };
            const { session: newSession, tokens } = await sessionService_1.SessionService.createSession(userRecord.id, deviceInfo, session.device_id, ipAddress, userAgent);
            // Log successful Apple auth
            await auditService_1.auditService.logAuthEvent('login', {
                userId: userRecord.id,
                sessionId: newSession.id,
                ipAddress,
                userAgent,
                deviceInfo,
                success: true,
            });
            // Firebase custom token for client-side auth (keep for compatibility)
            const firebaseToken = await firebase_admin_1.default.auth().createCustomToken(userRecord.id);
            await (0, redis_1.setJson)(`als:${state}`, {
                ready: true,
                accessToken: tokens.accessToken,
                refreshToken: tokens.refreshToken,
                sessionId: tokens.sessionId,
                user: {
                    id: userRecord.id,
                    email: userRecord.email,
                    name: userRecord.name,
                    avatar: userRecord.avatar,
                },
                deviceId: session.device_id,
                firebase_token: firebaseToken, // Keep for backward compatibility
            }, 600);
            return res.send('<html><body>Login successful. You may close this window.</body></html>');
        }
        catch (error) {
            logger_1.logger.error({ err: error, operation: 'appleAuth' }, 'Apple auth error');
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
function generateAppleClientSecret() {
    const now = Math.floor(Date.now() / 1000);
    const payload = {
        iss: config_1.config.apple.teamId,
        iat: now,
        exp: now + 3600, // 1 hour
        aud: 'https://appleid.apple.com',
        sub: config_1.config.apple.clientId,
    };
    const header = {
        alg: 'ES256',
        kid: config_1.config.apple.keyId,
    };
    return jwt.sign(payload, config_1.config.apple.privateKey, {
        algorithm: 'ES256',
        header,
    });
}
function base64url(b) {
    const raw = Buffer.isBuffer(b) ? b : Buffer.from(b);
    return raw.toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
}
