"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TokenService = void 0;
const jose_1 = require("jose");
const crypto_1 = require("crypto");
const uuid_1 = require("uuid");
const config_1 = require("../config");
const logger_1 = require("../utils/logger");
class TokenService {
    /**
     * Generate a secure random refresh token
     */
    static generateRefreshToken() {
        logger_1.logger.debug({
            operation: 'generateRefreshToken',
            tokenLength: 32
        }, 'Generating new refresh token');
        const token = (0, crypto_1.randomBytes)(32).toString('base64url');
        logger_1.logger.debug({
            operation: 'generateRefreshToken',
            tokenLength: token.length,
            tokenPreview: token.substring(0, 10) + '...'
        }, 'Refresh token generated successfully');
        return token;
    }
    /**
     * Create access token with required claims
     */
    static async createAccessToken(userId, sessionId, jti) {
        const requestId = Math.random().toString(36).substring(7);
        const now = Math.floor(Date.now() / 1000);
        const exp = now + (config_1.config.jwt.accessTtlMin * 60);
        const jtiValue = jti || (0, uuid_1.v4)();
        logger_1.logger.info({
            requestId,
            operation: 'createAccessToken',
            userId,
            sessionId,
            jti: jtiValue,
            iat: now,
            exp,
            iatDate: new Date(now * 1000).toISOString(),
            expDate: new Date(exp * 1000).toISOString(),
            ttlMinutes: config_1.config.jwt.accessTtlMin
        }, 'Creating new access token');
        const token = await new jose_1.SignJWT({
            sub: userId,
            sid: sessionId,
            jti: jtiValue,
            iat: now,
            exp,
        })
            .setProtectedHeader({ alg: 'HS256' })
            .setIssuedAt(now)
            .setExpirationTime(exp)
            .setIssuer(config_1.config.jwt.iss)
            .setAudience(config_1.config.jwt.aud)
            .sign(this.secret);
        logger_1.logger.info({
            requestId,
            operation: 'createAccessToken',
            userId,
            sessionId,
            jti: jtiValue,
            tokenLength: token.length,
            tokenPreview: token.substring(0, 20) + '...',
            success: true
        }, 'Access token created successfully');
        return token;
    }
    /**
     * Verify and decode access token
     */
    static async verifyAccessToken(token) {
        const requestId = Math.random().toString(36).substring(7);
        const startTime = Date.now();
        try {
            logger_1.logger.info({
                requestId,
                operation: 'verifyAccessToken',
                tokenLength: token.length,
                tokenPreview: token.substring(0, 20) + '...',
                issuer: config_1.config.jwt.iss,
                audience: config_1.config.jwt.aud,
                secretLength: this.secret.length,
                secretPreview: Array.from(this.secret).slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('')
            }, 'Starting token verification');
            // First, try to decode without verification to see what's in the token
            let decodedPayload = null;
            try {
                const parts = token.split('.');
                if (parts.length === 3) {
                    const header = JSON.parse(Buffer.from(parts[0], 'base64').toString());
                    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
                    decodedPayload = payload;
                    logger_1.logger.debug({
                        requestId,
                        operation: 'verifyAccessToken',
                        header,
                        payload: {
                            sub: payload.sub,
                            sid: payload.sid,
                            jti: payload.jti,
                            iat: payload.iat,
                            exp: payload.exp,
                            iss: payload.iss,
                            aud: payload.aud,
                            iatDate: new Date(payload.iat * 1000).toISOString(),
                            expDate: new Date(payload.exp * 1000).toISOString(),
                            isExpired: payload.exp * 1000 < Date.now()
                        }
                    }, 'Token decoded without verification');
                }
            }
            catch (decodeError) {
                logger_1.logger.warn({
                    requestId,
                    operation: 'verifyAccessToken',
                    error: decodeError instanceof Error ? decodeError.message : String(decodeError),
                    tokenLength: token.length,
                    tokenPreview: token.substring(0, 20) + '...'
                }, 'Token decode without verification failed');
            }
            logger_1.logger.info({
                requestId,
                operation: 'verifyAccessToken',
                issuer: config_1.config.jwt.iss,
                audience: config_1.config.jwt.aud,
                algorithms: ['HS256'],
                secretLength: this.secret.length,
                decodedPayload: decodedPayload ? {
                    sub: decodedPayload.sub,
                    sid: decodedPayload.sid,
                    jti: decodedPayload.jti,
                    iat: decodedPayload.iat,
                    exp: decodedPayload.exp,
                    iss: decodedPayload.iss,
                    aud: decodedPayload.aud
                } : null
            }, 'Attempting JWT verification');
            const { payload } = await (0, jose_1.jwtVerify)(token, this.secret, {
                issuer: config_1.config.jwt.iss,
                audience: config_1.config.jwt.aud,
                algorithms: ['HS256'],
            });
            const processingTime = Date.now() - startTime;
            logger_1.logger.info({
                requestId,
                operation: 'verifyAccessToken',
                userId: payload.sub,
                sessionId: payload.sid,
                jti: payload.jti,
                iat: payload.iat,
                exp: payload.exp,
                iatDate: payload.iat ? new Date(payload.iat * 1000).toISOString() : 'unknown',
                expDate: payload.exp ? new Date(payload.exp * 1000).toISOString() : 'unknown',
                processingTimeMs: processingTime,
                success: true
            }, 'Token verification successful');
            return payload;
        }
        catch (error) {
            const processingTime = Date.now() - startTime;
            logger_1.logger.error({
                requestId,
                operation: 'verifyAccessToken',
                error: error instanceof Error ? {
                    name: error.name,
                    message: error.message,
                    stack: error.stack
                } : error,
                tokenLength: token.length,
                tokenPreview: token.substring(0, 20) + '...',
                processingTimeMs: processingTime,
                success: false
            }, 'Token verification failed');
            throw new Error('Invalid or expired token');
        }
    }
    /**
     * Extract token expiration time
     */
    static getTokenExpiration(token) {
        try {
            const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
            return payload.exp * 1000; // Convert to milliseconds
        }
        catch {
            return 0;
        }
    }
    /**
     * Check if token is expired
     */
    static isTokenExpired(token) {
        const exp = this.getTokenExpiration(token);
        return exp < Date.now();
    }
}
exports.TokenService = TokenService;
TokenService.secret = new TextEncoder().encode(config_1.config.jwt.hsSecret);
