import { db } from '../firebase';
import { HashService } from './hashService';
import { TokenService } from './tokenService';
import { Session, DeviceInfo, AuthTokens } from '../types/auth';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config';

export class SessionService {
  /**
   * Create a new session
   */
  static async createSession(
    userId: string,
    deviceInfo: DeviceInfo,
    deviceId?: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<{ session: Session; tokens: AuthTokens }> {
    const sessionId = uuidv4();
    const refreshToken = TokenService.generateRefreshToken();
    const refreshTokenHash = await HashService.hashRefreshToken(refreshToken);
    const now = new Date();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + config.refreshTtlDays);

    const session: Omit<Session, 'id'> = {
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

    await db.collection('sessions').doc(sessionId).set(session);

    const accessToken = await TokenService.createAccessToken(userId, sessionId);
    const accessExp = TokenService.getTokenExpiration(accessToken);
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
  static async findById(sessionId: string): Promise<Session | null> {
    const doc = await db.collection('sessions').doc(sessionId).get();
    
    if (!doc.exists) {
      return null;
    }

    return {
      id: doc.id,
      ...doc.data(),
    } as Session;
  }

  /**
   * Find active sessions for user
   */
  static async findActiveSessionsByUserId(userId: string): Promise<Session[]> {
    const now = new Date();
    const snapshot = await db
      .collection('sessions')
      .where('userId', '==', userId)
      .where('revokedAt', '==', null)
      .where('expiresAt', '>', now)
      .get();

    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })) as Session[];
  }

  /**
   * Verify refresh token and rotate if valid
   */
  static async verifyAndRotateRefreshToken(
    sessionId: string,
    refreshToken: string,
    deviceId?: string
  ): Promise<{ session: Session; tokens: AuthTokens } | null> {
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
    const isValid = await HashService.verifyRefreshToken(refreshToken, session.refreshTokenHash);
    if (!isValid) {
      // This might be a reuse attempt - revoke all sessions for this user
      await this.revokeAllUserSessions(session.userId);
      throw new Error('REUSE_DETECTED');
    }

    // Rotate refresh token
    const newRefreshToken = TokenService.generateRefreshToken();
    const newRefreshTokenHash = await HashService.hashRefreshToken(newRefreshToken);
    const newExpiresAt = new Date();
    newExpiresAt.setDate(newExpiresAt.getDate() + config.refreshTtlDays);

    // Update session with new refresh token
    await db.collection('sessions').doc(sessionId).update({
      refreshTokenHash: newRefreshTokenHash,
      expiresAt: newExpiresAt,
      lastUsedAt: new Date(),
    });

    // Create new access token
    const accessToken = await TokenService.createAccessToken(session.userId, sessionId);
    const accessExp = TokenService.getTokenExpiration(accessToken);
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
  static async revokeSession(sessionId: string): Promise<boolean> {
    const session = await this.findById(sessionId);
    if (!session || session.revokedAt) {
      return false;
    }

    await db.collection('sessions').doc(sessionId).update({
      revokedAt: new Date(),
    });

    return true;
  }

  /**
   * Revoke all sessions for a user
   */
  static async revokeAllUserSessions(userId: string): Promise<void> {
    const now = new Date();
    const snapshot = await db
      .collection('sessions')
      .where('userId', '==', userId)
      .where('revokedAt', '==', null)
      .get();

    const batch = db.batch();
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
  static async cleanupExpiredSessions(): Promise<number> {
    const now = new Date();
    const snapshot = await db
      .collection('sessions')
      .where('expiresAt', '<', now)
      .where('revokedAt', '==', null)
      .get();

    const batch = db.batch();
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
  static async getSessionStats(userId: string): Promise<{
    activeSessions: number;
    totalSessions: number;
  }> {
    const now = new Date();
    
    const [activeSnapshot, totalSnapshot] = await Promise.all([
      db
        .collection('sessions')
        .where('userId', '==', userId)
        .where('revokedAt', '==', null)
        .where('expiresAt', '>', now)
        .get(),
      db
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
