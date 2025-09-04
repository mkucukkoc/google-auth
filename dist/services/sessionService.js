"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionService = void 0;
const firebase_1 = require("../firebase");
const hashService_1 = require("./hashService");
const tokenService_1 = require("./tokenService");
const uuid_1 = require("uuid");
const config_1 = require("../config");
class SessionService {
    /**
     * Create a new session
     */
    static async createSession(userId, deviceInfo, deviceId, ipAddress, userAgent) {
        const sessionId = (0, uuid_1.v4)();
        const refreshToken = tokenService_1.TokenService.generateRefreshToken();
        const refreshTokenHash = await hashService_1.HashService.hashRefreshToken(refreshToken);
        const now = new Date();
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + config_1.config.refreshTtlDays);
        const session = {
            userId,
            refreshTokenHash,
            deviceInfo,
            deviceId,
            createdAt: now,
            lastUsedAt: now,
            expiresAt,
            ipAddress,
            userAgent,
        };
        await firebase_1.db.collection('sessions').doc(sessionId).set(session);
        const accessToken = await tokenService_1.TokenService.createAccessToken(userId, sessionId);
        const accessExp = tokenService_1.TokenService.getTokenExpiration(accessToken);
        const refreshExp = expiresAt.getTime();
        return {
            session: { id: sessionId, ...session },
            tokens: {
                accessToken,
                accessExp,
                refreshToken,
                refreshExp,
                sessionId,
            },
        };
    }
    /**
     * Find session by ID
     */
    static async findById(sessionId) {
        const doc = await firebase_1.db.collection('sessions').doc(sessionId).get();
        if (!doc.exists) {
            return null;
        }
        return {
            id: doc.id,
            ...doc.data(),
        };
    }
    /**
     * Find active sessions for user
     */
    static async findActiveSessionsByUserId(userId) {
        const now = new Date();
        const snapshot = await firebase_1.db
            .collection('sessions')
            .where('userId', '==', userId)
            .where('revokedAt', '==', null)
            .where('expiresAt', '>', now)
            .get();
        return snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
        }));
    }
    /**
     * Verify refresh token and rotate if valid
     */
    static async verifyAndRotateRefreshToken(sessionId, refreshToken, deviceId) {
        const session = await this.findById(sessionId);
        if (!session) {
            return null;
        }
        // Check if session is revoked or expired
        if (session.revokedAt || session.expiresAt < new Date()) {
            return null;
        }
        // Check device ID if provided
        if (deviceId && session.deviceId !== deviceId) {
            return null;
        }
        // Verify refresh token
        const isValid = await hashService_1.HashService.verifyRefreshToken(refreshToken, session.refreshTokenHash);
        if (!isValid) {
            // This might be a reuse attempt - revoke all sessions for this user
            await this.revokeAllUserSessions(session.userId);
            throw new Error('REUSE_DETECTED');
        }
        // Rotate refresh token
        const newRefreshToken = tokenService_1.TokenService.generateRefreshToken();
        const newRefreshTokenHash = await hashService_1.HashService.hashRefreshToken(newRefreshToken);
        const newExpiresAt = new Date();
        newExpiresAt.setDate(newExpiresAt.getDate() + config_1.config.refreshTtlDays);
        // Update session with new refresh token
        await firebase_1.db.collection('sessions').doc(sessionId).update({
            refreshTokenHash: newRefreshTokenHash,
            expiresAt: newExpiresAt,
            lastUsedAt: new Date(),
        });
        // Create new access token
        const accessToken = await tokenService_1.TokenService.createAccessToken(session.userId, sessionId);
        const accessExp = tokenService_1.TokenService.getTokenExpiration(accessToken);
        const refreshExp = newExpiresAt.getTime();
        return {
            session: {
                ...session,
                refreshTokenHash: newRefreshTokenHash,
                expiresAt: newExpiresAt,
                lastUsedAt: new Date(),
            },
            tokens: {
                accessToken,
                accessExp,
                refreshToken: newRefreshToken,
                refreshExp,
                sessionId,
            },
        };
    }
    /**
     * Revoke a specific session
     */
    static async revokeSession(sessionId) {
        const session = await this.findById(sessionId);
        if (!session || session.revokedAt) {
            return false;
        }
        await firebase_1.db.collection('sessions').doc(sessionId).update({
            revokedAt: new Date(),
        });
        return true;
    }
    /**
     * Revoke all sessions for a user
     */
    static async revokeAllUserSessions(userId) {
        const now = new Date();
        const snapshot = await firebase_1.db
            .collection('sessions')
            .where('userId', '==', userId)
            .where('revokedAt', '==', null)
            .get();
        const batch = firebase_1.db.batch();
        snapshot.docs.forEach(doc => {
            batch.update(doc.ref, { revokedAt: now });
        });
        if (!snapshot.empty) {
            await batch.commit();
        }
    }
    /**
     * Clean up expired sessions
     */
    static async cleanupExpiredSessions() {
        const now = new Date();
        const snapshot = await firebase_1.db
            .collection('sessions')
            .where('expiresAt', '<', now)
            .where('revokedAt', '==', null)
            .get();
        const batch = firebase_1.db.batch();
        snapshot.docs.forEach(doc => {
            batch.update(doc.ref, { revokedAt: now });
        });
        if (!snapshot.empty) {
            await batch.commit();
        }
        return snapshot.size;
    }
    /**
     * Get session statistics for a user
     */
    static async getSessionStats(userId) {
        const now = new Date();
        const [activeSnapshot, totalSnapshot] = await Promise.all([
            firebase_1.db
                .collection('sessions')
                .where('userId', '==', userId)
                .where('revokedAt', '==', null)
                .where('expiresAt', '>', now)
                .get(),
            firebase_1.db
                .collection('sessions')
                .where('userId', '==', userId)
                .get(),
        ]);
        return {
            activeSessions: activeSnapshot.size,
            totalSessions: totalSnapshot.size,
        };
    }
}
exports.SessionService = SessionService;
