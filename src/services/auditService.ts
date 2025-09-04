import { db } from '../firebase';
import { AuditLog, DeviceInfo } from '../types/auth';
import { v4 as uuidv4 } from 'uuid';

export class AuditService {
  /**
   * Log an authentication event
   */
  static async logAuthEvent(
    event: AuditLog['event'],
    options: {
      userId?: string;
      sessionId?: string;
      ipAddress?: string;
      userAgent?: string;
      deviceInfo?: DeviceInfo;
      success: boolean;
      errorMessage?: string;
    }
  ): Promise<void> {
    // Filter out undefined values to avoid Firestore errors
    const auditLog: any = {
      event,
      success: options.success,
      createdAt: new Date(),
    };

    // Only add fields that are not undefined
    if (options.userId !== undefined) auditLog.userId = options.userId;
    if (options.sessionId !== undefined) auditLog.sessionId = options.sessionId;
    if (options.ipAddress !== undefined) auditLog.ipAddress = options.ipAddress;
    if (options.userAgent !== undefined) auditLog.userAgent = options.userAgent;
    if (options.deviceInfo !== undefined) auditLog.deviceInfo = options.deviceInfo;
    if (options.errorMessage !== undefined) auditLog.errorMessage = options.errorMessage;

    await db.collection('auditLogs').doc(uuidv4()).set(auditLog);
  }

  /**
   * Get audit logs for a user
   */
  static async getUserAuditLogs(
    userId: string,
    limit: number = 50
  ): Promise<AuditLog[]> {
    const snapshot = await db
      .collection('auditLogs')
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();

    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })) as AuditLog[];
  }

  /**
   * Get audit logs for a session
   */
  static async getSessionAuditLogs(
    sessionId: string,
    limit: number = 20
  ): Promise<AuditLog[]> {
    const snapshot = await db
      .collection('auditLogs')
      .where('sessionId', '==', sessionId)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();

    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })) as AuditLog[];
  }

  /**
   * Get failed login attempts for an IP address
   */
  static async getFailedLoginAttempts(
    ipAddress: string,
    since: Date
  ): Promise<AuditLog[]> {
    const snapshot = await db
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
    })) as AuditLog[];
  }

  /**
   * Clean up old audit logs (older than specified days)
   */
  static async cleanupOldAuditLogs(daysToKeep: number = 90): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const snapshot = await db
      .collection('auditLogs')
      .where('createdAt', '<', cutoffDate)
      .get();

    const batch = db.batch();
    snapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });

    if (!snapshot.empty) {
      await batch.commit();
    }

    return snapshot.size;
  }
}


