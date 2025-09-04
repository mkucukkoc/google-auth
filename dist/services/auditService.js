"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuditService = void 0;
const firebase_1 = require("../firebase");
const uuid_1 = require("uuid");
class AuditService {
    /**
     * Log an authentication event
     */
    static async logAuthEvent(event, options) {
        const auditLog = {
            event,
            userId: options.userId,
            sessionId: options.sessionId,
            ipAddress: options.ipAddress,
            userAgent: options.userAgent,
            deviceInfo: options.deviceInfo,
            success: options.success,
            errorMessage: options.errorMessage,
            createdAt: new Date(),
        };
        await firebase_1.db.collection('auditLogs').doc((0, uuid_1.v4)()).set(auditLog);
    }
    /**
     * Get audit logs for a user
     */
    static async getUserAuditLogs(userId, limit = 50) {
        const snapshot = await firebase_1.db
            .collection('auditLogs')
            .where('userId', '==', userId)
            .orderBy('createdAt', 'desc')
            .limit(limit)
            .get();
        return snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
        }));
    }
    /**
     * Get audit logs for a session
     */
    static async getSessionAuditLogs(sessionId, limit = 20) {
        const snapshot = await firebase_1.db
            .collection('auditLogs')
            .where('sessionId', '==', sessionId)
            .orderBy('createdAt', 'desc')
            .limit(limit)
            .get();
        return snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
        }));
    }
    /**
     * Get failed login attempts for an IP address
     */
    static async getFailedLoginAttempts(ipAddress, since) {
        const snapshot = await firebase_1.db
            .collection('auditLogs')
            .where('ipAddress', '==', ipAddress)
            .where('event', '==', 'login')
            .where('success', '==', false)
            .where('createdAt', '>', since)
            .orderBy('createdAt', 'desc')
            .get();
        return snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
        }));
    }
    /**
     * Clean up old audit logs (older than specified days)
     */
    static async cleanupOldAuditLogs(daysToKeep = 90) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
        const snapshot = await firebase_1.db
            .collection('auditLogs')
            .where('createdAt', '<', cutoffDate)
            .get();
        const batch = firebase_1.db.batch();
        snapshot.docs.forEach(doc => {
            batch.delete(doc.ref);
        });
        if (!snapshot.empty) {
            await batch.commit();
        }
        return snapshot.size;
    }
}
exports.AuditService = AuditService;
