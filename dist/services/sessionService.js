"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionService = void 0;
const firebase_1 = require("../firebase");
const hashService_1 = require("./hashService");
const tokenService_1 = require("./tokenService");
const uuid_1 = require("uuid");
const config_1 = require("../config");
const logger_1 = require("../utils/logger");
class SessionService {
    /**
     * Create a new session
     */
    static async createSession(userId, deviceInfo, deviceId, ipAddress, userAgent) {
        const requestId = Math.random().toString(36).substring(7);
        const startTime = Date.now();
        logger_1.logger.info({
            requestId,
            operation: 'createSession',
            userId,
            deviceId,
            ipAddress,
            userAgent: userAgent ? userAgent.substring(0, 100) + '...' : undefined,
            deviceInfo
        }, 'Creating new session');
        const sessionId = (0, uuid_1.v4)();
        const refreshToken = tokenService_1.TokenService.generateRefreshToken();
        const refreshTokenHash = await hashService_1.HashService.hashRefreshToken(refreshToken);
        const now = new Date();
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + config_1.config.refreshTtlDays);
        logger_1.logger.debug({
            requestId,
            operation: 'createSession',
            sessionId,
            userId,
            refreshTokenLength: refreshToken.length,
            refreshTokenPreview: refreshToken.substring(0, 10) + '...',
            createdAt: now.toISOString(),
            expiresAt: expiresAt.toISOString(),
            ttlDays: config_1.config.refreshTtlDays
        }, 'Session data prepared');
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
        logger_1.logger.info({
            requestId,
            operation: 'createSession',
            sessionId,
            userId,
            success: true
        }, 'Session saved to database');
        const accessToken = await tokenService_1.TokenService.createAccessToken(userId, sessionId);
        const accessExp = tokenService_1.TokenService.getTokenExpiration(accessToken);
        const refreshExp = expiresAt.getTime();
        const processingTime = Date.now() - startTime;
        logger_1.logger.info({
            requestId,
            operation: 'createSession',
            sessionId,
            userId,
            accessTokenLength: accessToken.length,
            accessTokenPreview: accessToken.substring(0, 20) + '...',
            accessExp,
            refreshExp,
            processingTimeMs: processingTime,
            success: true
        }, 'Session creation completed successfully');
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
        const requestId = Math.random().toString(36).substring(7);
        logger_1.logger.debug({
            requestId,
            operation: 'findById',
            sessionId
        }, 'Looking up session by ID');
        const doc = await firebase_1.db.collection('sessions').doc(sessionId).get();
        if (!doc.exists) {
            logger_1.logger.warn({
                requestId,
                operation: 'findById',
                sessionId
            }, 'Session not found in database');
            return null;
        }
        const sessionData = doc.data();
        logger_1.logger.info({
            requestId,
            operation: 'findById',
            sessionId,
            hasSession: true,
            sessionData: sessionData ? {
                userId: sessionData.userId,
                deviceId: sessionData.deviceId,
                createdAt: sessionData.createdAt,
                lastUsedAt: sessionData.lastUsedAt,
                expiresAt: sessionData.expiresAt,
                revokedAt: sessionData.revokedAt,
                ipAddress: sessionData.ipAddress
            } : null
        }, 'Session found successfully');
        return {
            id: doc.id,
            ...sessionData,
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
        return snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
        }));
    }
    /**
     * Verify refresh token and rotate if valid
     */
    static async verifyAndRotateRefreshToken(sessionId, refreshToken, deviceId) {
        const requestId = Math.random().toString(36).substring(7);
        const startTime = Date.now();
        logger_1.logger.info({
            requestId,
            operation: 'verifyAndRotateRefreshToken',
            sessionId,
            refreshTokenLength: refreshToken.length,
            refreshTokenPreview: refreshToken.substring(0, 10) + '...',
            deviceId
        }, 'Starting refresh token verification and rotation');
        const session = await this.findById(sessionId);
        if (!session) {
            logger_1.logger.warn({
                requestId,
                operation: 'verifyAndRotateRefreshToken',
                sessionId
            }, 'Session not found, cannot verify refresh token');
            return null;
        }
        logger_1.logger.info({
            requestId,
            operation: 'verifyAndRotateRefreshToken',
            sessionId,
            userId: session.userId,
            deviceId: session.deviceId,
            hasRevokedAt: !!session.revokedAt,
            revokedAt: session.revokedAt,
            expiresAt: session.expiresAt
        }, 'Session found, checking revocation status');
        // Check if session is revoked
        if (session.revokedAt) {
            logger_1.logger.warn({
                requestId,
                operation: 'verifyAndRotateRefreshToken',
                sessionId,
                revokedAt: session.revokedAt
            }, 'Session is revoked, cannot refresh');
            return null;
        }
        // Check if session is expired (but allow refresh if it's only slightly expired)
        const now = new Date();
        // Handle Firestore Timestamp objects
        let sessionExpiresAt;
        if (session.expiresAt && typeof session.expiresAt === 'object' && 'toDate' in session.expiresAt) {
            // Firestore Timestamp
            sessionExpiresAt = session.expiresAt.toDate();
            logger_1.logger.debug({
                requestId,
                operation: 'verifyAndRotateRefreshToken',
                sessionId,
                timestampType: 'Firestore Timestamp',
                originalExpiresAt: session.expiresAt,
                convertedExpiresAt: sessionExpiresAt.toISOString()
            }, 'Converted Firestore Timestamp to Date');
        }
        else if (session.expiresAt instanceof Date) {
            // Regular Date
            sessionExpiresAt = session.expiresAt;
            logger_1.logger.debug({
                requestId,
                operation: 'verifyAndRotateRefreshToken',
                sessionId,
                timestampType: 'Regular Date',
                expiresAt: sessionExpiresAt.toISOString()
            }, 'Using regular Date object');
        }
        else {
            // Fallback
            sessionExpiresAt = new Date(session.expiresAt);
            logger_1.logger.debug({
                requestId,
                operation: 'verifyAndRotateRefreshToken',
                sessionId,
                timestampType: 'Fallback conversion',
                originalExpiresAt: session.expiresAt,
                convertedExpiresAt: sessionExpiresAt.toISOString()
            }, 'Fallback conversion to Date');
        }
        const sessionExpired = sessionExpiresAt < now;
        const timeSinceExpiry = now.getTime() - sessionExpiresAt.getTime();
        const maxRefreshWindow = 5 * 60 * 1000; // 5 minutes
        logger_1.logger.info({
            requestId,
            operation: 'verifyAndRotateRefreshToken',
            sessionId,
            sessionExpiresAt: sessionExpiresAt.toISOString(),
            now: now.toISOString(),
            sessionExpired,
            timeSinceExpiry,
            timeSinceExpiryMinutes: timeSinceExpiry / (1000 * 60),
            maxRefreshWindow,
            maxRefreshWindowMinutes: maxRefreshWindow / (1000 * 60)
        }, 'Session expiration check completed');
        if (sessionExpired && timeSinceExpiry > maxRefreshWindow) {
            logger_1.logger.warn({
                requestId,
                operation: 'verifyAndRotateRefreshToken',
                sessionId,
                expiredAt: sessionExpiresAt.toISOString(),
                now: now.toISOString(),
                timeSinceExpiry,
                timeSinceExpiryMinutes: timeSinceExpiry / (1000 * 60),
                maxRefreshWindow,
                maxRefreshWindowMinutes: maxRefreshWindow / (1000 * 60)
            }, 'Session expired too long ago, cannot refresh');
            return null;
        }
        if (sessionExpired) {
            logger_1.logger.info({
                requestId,
                operation: 'verifyAndRotateRefreshToken',
                sessionId,
                expiredAt: sessionExpiresAt.toISOString(),
                now: now.toISOString(),
                timeSinceExpiry,
                timeSinceExpiryMinutes: timeSinceExpiry / (1000 * 60)
            }, 'Session expired but within refresh window, allowing refresh');
        }
        logger_1.logger.info({
            requestId,
            operation: 'verifyAndRotateRefreshToken',
            sessionId,
            expiresAt: sessionExpiresAt.toISOString(),
            now: now.toISOString(),
            isExpired: sessionExpired,
            timeUntilExpiry: sessionExpiresAt.getTime() - now.getTime(),
            timeUntilExpiryMinutes: (sessionExpiresAt.getTime() - now.getTime()) / (1000 * 60)
        }, 'Session validation successful');
        // Check device ID if provided
        if (deviceId && session.deviceId !== deviceId) {
            logger_1.logger.warn({
                requestId,
                operation: 'verifyAndRotateRefreshToken',
                sessionId,
                providedDeviceId: deviceId,
                sessionDeviceId: session.deviceId
            }, 'Device ID mismatch, cannot refresh');
            return null;
        }
        logger_1.logger.debug({
            requestId,
            operation: 'verifyAndRotateRefreshToken',
            sessionId,
            refreshTokenLength: refreshToken.length,
            refreshTokenPreview: refreshToken.substring(0, 10) + '...'
        }, 'Verifying refresh token hash');
        // Verify refresh token
        const isValid = await hashService_1.HashService.verifyRefreshToken(refreshToken, session.refreshTokenHash);
        if (!isValid) {
            logger_1.logger.error({
                requestId,
                operation: 'verifyAndRotateRefreshToken',
                sessionId,
                userId: session.userId
            }, 'Refresh token verification failed, possible reuse attempt - revoking all user sessions');
            // This might be a reuse attempt - revoke all sessions for this user
            await this.revokeAllUserSessions(session.userId);
            throw new Error('REUSE_DETECTED');
        }
        logger_1.logger.info({
            requestId,
            operation: 'verifyAndRotateRefreshToken',
            sessionId,
            userId: session.userId
        }, 'Refresh token verified successfully, rotating tokens');
        // Rotate refresh token
        const newRefreshToken = tokenService_1.TokenService.generateRefreshToken();
        const newRefreshTokenHash = await hashService_1.HashService.hashRefreshToken(newRefreshToken);
        const newExpiresAt = new Date();
        newExpiresAt.setDate(newExpiresAt.getDate() + config_1.config.refreshTtlDays);
        logger_1.logger.debug({
            requestId,
            operation: 'verifyAndRotateRefreshToken',
            sessionId,
            newRefreshTokenLength: newRefreshToken.length,
            newRefreshTokenPreview: newRefreshToken.substring(0, 10) + '...',
            newExpiresAt: newExpiresAt.toISOString(),
            ttlDays: config_1.config.refreshTtlDays
        }, 'New refresh token generated, updating session');
        // Update session with new refresh token
        await firebase_1.db.collection('sessions').doc(sessionId).update({
            refreshTokenHash: newRefreshTokenHash,
            expiresAt: newExpiresAt,
            lastUsedAt: new Date(),
        });
        logger_1.logger.info({
            requestId,
            operation: 'verifyAndRotateRefreshToken',
            sessionId,
            userId: session.userId
        }, 'Session updated with new refresh token, creating access token');
        // Create new access token
        const accessToken = await tokenService_1.TokenService.createAccessToken(session.userId, sessionId);
        const accessExp = tokenService_1.TokenService.getTokenExpiration(accessToken);
        const refreshExp = newExpiresAt.getTime();
        const processingTime = Date.now() - startTime;
        logger_1.logger.info({
            requestId,
            operation: 'verifyAndRotateRefreshToken',
            sessionId,
            userId: session.userId,
            accessTokenLength: accessToken.length,
            accessTokenPreview: accessToken.substring(0, 20) + '...',
            accessExp,
            refreshExp,
            processingTimeMs: processingTime,
            success: true
        }, 'Refresh token rotation completed successfully');
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
        snapshot.docs.forEach((doc) => {
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
        snapshot.docs.forEach((doc) => {
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
