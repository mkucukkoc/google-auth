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
Object.defineProperty(exports, "__esModule", { value: true });
exports.PasswordResetService = void 0;
const firebase_1 = require("../firebase");
const hashService_1 = require("./hashService");
const userService_1 = require("./userService");
const auditService_1 = require("./auditService");
const crypto_1 = require("crypto");
const config_1 = require("../config");
const uuid_1 = require("uuid");
class PasswordResetService {
    /**
     * Generate a password reset token
     */
    static async generateResetToken(email, ipAddress, userAgent) {
        const user = await userService_1.UserService.findByEmail(email);
        if (!user) {
            // Don't reveal if email exists or not
            return null;
        }
        // Generate secure token
        const token = (0, crypto_1.randomBytes)(32).toString('base64url');
        const tokenHash = await hashService_1.HashService.hashRefreshToken(token);
        const tokenId = (0, uuid_1.v4)();
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + config_1.config.security.passwordResetTokenTtlHours);
        const resetToken = {
            userId: user.id,
            tokenHash,
            expiresAt,
            createdAt: new Date(),
            ipAddress,
            userAgent,
        };
        await firebase_1.db.collection('passwordResetTokens').doc(tokenId).set(resetToken);
        // Log the reset request
        await auditService_1.AuditService.logAuthEvent('password_reset_request', {
            userId: user.id,
            ipAddress,
            userAgent,
            success: true,
        });
        return { token, expiresAt };
    }
    /**
     * Verify and consume a password reset token
     */
    static async verifyAndConsumeToken(token, newPassword, ipAddress, userAgent) {
        const tokenHash = await hashService_1.HashService.hashRefreshToken(token);
        // Find token by hash
        const snapshot = await firebase_1.db
            .collection('passwordResetTokens')
            .where('tokenHash', '==', tokenHash)
            .where('usedAt', '==', null)
            .limit(1)
            .get();
        if (snapshot.empty) {
            return false;
        }
        const doc = snapshot.docs[0];
        const resetToken = { id: doc.id, ...doc.data() };
        // Check if token is expired
        if (resetToken.expiresAt < new Date()) {
            return false;
        }
        // Update user password
        const newPasswordHash = await hashService_1.HashService.hashPassword(newPassword);
        await userService_1.UserService.updateUser(resetToken.userId, {
            passwordHash: newPasswordHash,
        });
        // Mark token as used
        await doc.ref.update({
            usedAt: new Date(),
        });
        // Revoke all user sessions (force re-login)
        const { SessionService } = await Promise.resolve().then(() => __importStar(require('./sessionService')));
        await SessionService.revokeAllUserSessions(resetToken.userId);
        // Log successful password reset
        await auditService_1.AuditService.logAuthEvent('password_reset_success', {
            userId: resetToken.userId,
            ipAddress,
            userAgent,
            success: true,
        });
        return true;
    }
    /**
     * Clean up expired password reset tokens
     */
    static async cleanupExpiredTokens() {
        const now = new Date();
        const snapshot = await firebase_1.db
            .collection('passwordResetTokens')
            .where('expiresAt', '<', now)
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
    /**
     * Get active reset tokens for a user
     */
    static async getActiveTokensForUser(userId) {
        const now = new Date();
        const snapshot = await firebase_1.db
            .collection('passwordResetTokens')
            .where('userId', '==', userId)
            .where('usedAt', '==', null)
            .where('expiresAt', '>', now)
            .get();
        return snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
        }));
    }
}
exports.PasswordResetService = PasswordResetService;
