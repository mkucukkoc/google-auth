"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TokenService = void 0;
const jose_1 = require("jose");
const crypto_1 = require("crypto");
const uuid_1 = require("uuid");
const config_1 = require("../config");
class TokenService {
    /**
     * Generate a secure random refresh token
     */
    static generateRefreshToken() {
        return (0, crypto_1.randomBytes)(32).toString('base64url');
    }
    /**
     * Create access token with required claims
     */
    static async createAccessToken(userId, sessionId, jti) {
        const now = Math.floor(Date.now() / 1000);
        const exp = now + (config_1.config.jwt.accessTtlMin * 60);
        const token = await new jose_1.SignJWT({
            sub: userId,
            sid: sessionId,
            jti: jti || (0, uuid_1.v4)(),
            iat: now,
            exp,
        })
            .setProtectedHeader({ alg: 'HS256' })
            .setIssuedAt(now)
            .setExpirationTime(exp)
            .setIssuer(config_1.config.jwt.iss)
            .setAudience(config_1.config.jwt.aud)
            .sign(this.secret);
        return token;
    }
    /**
     * Verify and decode access token
     */
    static async verifyAccessToken(token) {
        try {
            console.log('[TokenService] verifyAccessToken START:', {
                tokenLength: token.length,
                tokenPreview: token.substring(0, 20) + '...',
                issuer: config_1.config.jwt.iss,
                audience: config_1.config.jwt.aud
            });
            const { payload } = await (0, jose_1.jwtVerify)(token, this.secret, {
                issuer: config_1.config.jwt.iss,
                audience: config_1.config.jwt.aud,
                algorithms: ['HS256'],
            });
            console.log('[TokenService] verifyAccessToken SUCCESS:', {
                userId: payload.sub,
                sessionId: payload.sid,
                jti: payload.jti,
                iat: payload.iat,
                exp: payload.exp
            });
            return payload;
        }
        catch (error) {
            console.log('[TokenService] verifyAccessToken ERROR:', {
                error: error instanceof Error ? error.message : String(error),
                tokenLength: token.length,
                tokenPreview: token.substring(0, 20) + '...'
            });
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
