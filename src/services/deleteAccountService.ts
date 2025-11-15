import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { admin, db, FieldValue, storage } from '../firebase';
import { logger } from '../utils/logger';
import { config } from '../config';
import {
  DeleteAccountRequestBody,
  DeleteAccountResult,
  DeleteAccountContext,
  DeletionJobPhase,
  DeletedUserRegistryRecord,
  RestoreAccountResult,
  DeletionJobStatus,
} from '../types/deleteAccount';
import { revenueCatService } from './revenueCatService';
import { SessionService } from './sessionService';
import { cacheService } from './cacheService';
import { auditService } from './auditService';
import { thirdPartyIntegrationService } from './thirdPartyIntegrationService';

type PhaseName =
  | 'preflight_checks'
  | 'soft_delete'
  | 'sessions_tokens'
  | 'firestore_cleanup'
  | 'storage_cleanup'
  | 'third_party_cleanup'
  | 'telemetry';

const DELETION_PHASES: PhaseName[] = [
  'preflight_checks',
  'soft_delete',
  'sessions_tokens',
  'firestore_cleanup',
  'storage_cleanup',
  'third_party_cleanup',
  'telemetry',
];

export class DeleteAccountError extends Error {
  code: string;
  status: number;
  details?: any;

  constructor(code: string, message: string, status = 400, details?: any) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

interface PreflightResult {
  email?: string;
  provider?: string;
  appUserId: string;
  userProfile?: Record<string, any>;
  isAlreadyDeleted: boolean;
  deletedRegistry?: DeletedUserRegistryRecord;
}

class DeleteAccountService {
  private logDirectory = config.deleteAccount.logDirectory;

  constructor() {
    this.ensureLogDirectory();
  }

  async initiateDeletion(
    userId: string,
    body: DeleteAccountRequestBody,
    context: DeleteAccountContext = {}
  ): Promise<DeleteAccountResult> {
    const now = new Date();
    const jobId = uuidv4();
    const phases = this.createPhaseTracker();
    const jobRef = db.collection('deletion_jobs').doc(jobId);
    const jobRecordBase = {
      id: jobId,
      userId,
      status: 'pending' as DeletionJobStatus,
      reason: body.deleteReason,
      reasonNote: body.deleteReasonNote,
      skipDataExport: body.skipDataExport ?? false,
      anonymous: body.anonymous ?? false,
      initiatedFrom: body.initiatedFrom || 'user',
      restoreUntil: null as string | null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      phases,
      context,
      metrics: {},
    };
    await jobRef.set(jobRecordBase);

    const start = Date.now();
    let providersToUnlink: string[] = [];
    let restoreUntil: string | undefined;

    try {
      const authRecord = await this.safeGetAuthUser(userId);
      providersToUnlink = this.extractProviders(authRecord);

      const preflight = await this.runPreflightChecks(userId, body, context);
      this.updatePhase(phases, 'preflight_checks', 'completed');
      await jobRef.update({ phases });

      if (preflight.isAlreadyDeleted) {
        throw new DeleteAccountError('ACCOUNT_ALREADY_DELETED', 'Account already deleted', 409);
      }

      const appUserId = preflight.appUserId;
      const isAnonymous = body.anonymous === true || providersToUnlink.length === 0;

      if (!isAnonymous) {
        await this.assertNoActiveSubscription(appUserId);
      }

      restoreUntil = this.calculateRestoreUntil(isAnonymous);

      await this.performSoftDelete({
        userId,
        email: preflight.email || authRecord?.email,
        provider: preflight.provider || authRecord?.providerData?.[0]?.providerId,
        body,
        context,
        restoreUntil,
        jobId,
        isAnonymous,
      });
      this.updatePhase(phases, 'soft_delete', 'completed');
      await jobRef.update({ phases });

      await this.revokeSessionsAndTokens(userId);
      this.updatePhase(phases, 'sessions_tokens', 'completed');
      await jobRef.update({ phases });

      const firestoreCount = await this.cleanupFirestoreData(userId);
      this.updatePhase(phases, 'firestore_cleanup', 'completed');
      await jobRef.update({
        phases,
        'metrics.firestoreDocsDeleted': firestoreCount,
      });

      const storageCount = await this.cleanupStorageData(userId);
      this.updatePhase(phases, 'storage_cleanup', 'completed');
      await jobRef.update({
        phases,
        'metrics.storageObjectsDeleted': storageCount,
      });

      await this.cleanupThirdParties({
        userId,
        email: preflight.email || authRecord?.email,
        reason: body.deleteReason,
      });
      this.updatePhase(phases, 'third_party_cleanup', 'completed');
      await jobRef.update({ phases });

      await this.recordTelemetryEvent({
        userId,
        jobId,
        deleteReason: body.deleteReason,
        restoreUntil,
        durationMs: Date.now() - start,
        context,
        anonymous: isAnonymous,
      });
      this.updatePhase(phases, 'telemetry', 'completed');
      await jobRef.update({ phases });

      const metrics = {
        firestoreDocsDeleted: firestoreCount,
        storageObjectsDeleted: storageCount,
        durationMs: Date.now() - start,
      };

      await jobRef.update({
        status: 'completed',
        updatedAt: new Date().toISOString(),
        restoreUntil: restoreUntil || null,
        phases,
        metrics,
      });

      await this.appendDeletionLog(
        `[${new Date().toISOString()}] DELETE_ACCOUNT_COMPLETED uid:${userId} job:${jobId} reason:${body.deleteReason}`
      );

      await auditService.logUserAction(userId, 'delete_account_completed', {
        jobId,
        reason: body.deleteReason,
      });

      return {
        jobId,
        status: 'completed',
        providersToUnlink,
        restoreUntil,
        message:
          'Backend cleanup tamamlandı. Lütfen istemci tarafında Firebase Auth hesabını silmeyi unutmayın.',
      };
    } catch (error) {
      const deleteError = this.normalizeError(error);
      this.updatePhase(phases, 'telemetry', 'failed', deleteError.message);
      await jobRef.update({
        status: 'failed',
        updatedAt: new Date().toISOString(),
        error: {
          code: deleteError.code,
          message: deleteError.message,
          details: deleteError.details,
        },
        phases,
      });
      await this.appendDeletionLog(
        `[${new Date().toISOString()}] DELETE_ACCOUNT_FAILED uid:${userId} job:${jobId} code:${deleteError.code} msg:${deleteError.message}`
      );
      throw deleteError;
    }
  }

  async restoreAccount(
    userId: string,
    context: DeleteAccountContext = {}
  ): Promise<RestoreAccountResult> {
    const registrySnap = await db.collection('deleted_users').doc(userId).get();
    if (!registrySnap.exists) {
      throw new DeleteAccountError('NOT_DELETED', 'Kullanıcı silinmiş değil', 404);
    }

    const registry = registrySnap.data() as DeletedUserRegistryRecord;
    if (registry.legalHold) {
      throw new DeleteAccountError('LEGAL_HOLD', 'Hesap hukuki sebeplerle kilitli', 423);
    }

    if (registry.canRestoreUntil) {
      const deadline = new Date(registry.canRestoreUntil);
      if (deadline.getTime() < Date.now()) {
        throw new DeleteAccountError('RESTORE_WINDOW_PASSED', 'Geri alma süresi dolmuş', 410);
      }
    }

    const batch = db.batch();
    const usersRef = db.collection('users').doc(userId);
    const subscRef = db.collection('subsc').doc(userId);
    const premiumRef = db.collection('premiumusers').doc(userId);
    const blacklistRef = db.collection('notification_blacklist').doc(userId);

    batch.set(
      usersRef,
      {
        isDeleted: false,
        restoredAt: FieldValue.serverTimestamp(),
        deletedAt: null,
      },
      { merge: true }
    );
    batch.set(
      subscRef,
      {
        isDeleted: false,
        premiumCancelledAt: null,
      },
      { merge: true }
    );
    batch.set(
      premiumRef,
      {
        isDeleted: false,
        blockedForWebhook: false,
      },
      { merge: true }
    );
    batch.delete(blacklistRef);

    await batch.commit();
    await db
      .collection('deleted_users')
      .doc(userId)
      .update({
        restoreCompletedAt: FieldValue.serverTimestamp(),
        blockedForWebhook: false,
      });

    await auditService.logUserAction(userId, 'delete_account_restored', {
      ip: context.ipAddress,
      userAgent: context.userAgent,
    });

    return {
      restored: true,
      restoredAt: new Date().toISOString(),
      message: 'Hesap başarıyla yeniden aktifleştirildi. Premium abonelikler otomatik olarak geri açılmaz.',
    };
  }

  async getJob(jobId: string) {
    const doc = await db.collection('deletion_jobs').doc(jobId).get();
    if (!doc.exists) {
      return null;
    }
    return doc.data();
  }

  async getLatestJobForUser(userId: string) {
    const snapshot = await db
      .collection('deletion_jobs')
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get();
    if (snapshot.empty) {
      return null;
    }
    return snapshot.docs[0].data();
  }

  private async runPreflightChecks(
    userId: string,
    body: DeleteAccountRequestBody,
    context: DeleteAccountContext
  ): Promise<PreflightResult> {
    const [userDoc, subscDoc, premiumDoc, registryDoc] = await Promise.all([
      db.collection('users').doc(userId).get(),
      db.collection('subsc').doc(userId).get(),
      db.collection('premiumusers').doc(userId).get(),
      db.collection('deleted_users').doc(userId).get(),
    ]);

    const registry = registryDoc.exists ? (registryDoc.data() as DeletedUserRegistryRecord) : undefined;
    if (registry?.legalHold || userDoc.data()?.legalHold) {
      throw new DeleteAccountError('LEGAL_HOLD_ACTIVE', 'Hesap hukuki sebeplerle silinemez', 423);
    }

    const userData = userDoc.data() || {};
    const subscData = subscDoc.data() || {};

    await auditService.logUserAction(userId, 'delete_account_requested', {
      reason: body.deleteReason,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    return {
      email: subscData.email || userData.email,
      provider: subscData.provider || userData.provider,
      appUserId: subscData.revenueCatUserId || userId,
      userProfile: userData,
      isAlreadyDeleted: Boolean(userData.isDeleted),
      deletedRegistry: registry,
    };
  }

  private async assertNoActiveSubscription(appUserId: string) {
    try {
      const status = await revenueCatService.checkActiveSubscription(appUserId);
      if (status.hasActiveSubscription) {
        throw new DeleteAccountError('ACTIVE_SUBSCRIPTION', 'Aktif abonelik bulundu', 409, {
          entitlements: status.blockingEntitlements,
          expirationDates: status.expirationDates,
          gracePeriodActive: status.gracePeriodActive,
          billingIssuesDetected: status.billingIssuesDetected,
        });
      }
    } catch (error) {
      if (error instanceof DeleteAccountError) {
        throw error;
      }
      throw new DeleteAccountError(
        'REVENUECAT_UNAVAILABLE',
        'Abonelik durumu doğrulanamadı',
        502,
        error
      );
    }
  }

  private async performSoftDelete(params: {
    userId: string;
    email?: string;
    provider?: string;
    body: DeleteAccountRequestBody;
    context: DeleteAccountContext;
    restoreUntil?: string;
    jobId: string;
    isAnonymous: boolean;
  }) {
    const { userId, email, provider, body, context, restoreUntil, jobId, isAnonymous } = params;
    const batch = db.batch();

    const softDeletePayload = {
      isDeleted: true,
      deletedAt: FieldValue.serverTimestamp(),
      deleteReason: body.deleteReason || 'user_request',
      deleteReasonNote: body.deleteReasonNote || null,
      deletedBy: body.initiatedFrom === 'admin' ? 'admin' : 'self',
      canRestoreUntil: restoreUntil ? new Date(restoreUntil) : null,
    };

    batch.set(db.collection('users').doc(userId), softDeletePayload, { merge: true });

    batch.set(
      db.collection('subsc').doc(userId),
      {
        isDeleted: true,
        premiumCancelledAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    batch.set(
      db.collection('premiumusers').doc(userId),
      {
        active: false,
        isDeleted: true,
        blockedForWebhook: true,
        blockedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    await batch.commit();

    const registry: DeletedUserRegistryRecord = {
      uid: userId,
      email,
      provider,
      deletedAt: new Date().toISOString(),
      deleteReason: body.deleteReason || 'user_request',
      canRestoreUntil: restoreUntil,
      ip: context.ipAddress,
      userAgent: context.userAgent,
      blockedForWebhook: true,
      legalHold: false,
      fraudSuspected: false,
    };

    await db
      .collection('deleted_users')
      .doc(userId)
      .set(
        {
          ...registry,
          anonymous: isAnonymous,
          jobId,
        },
        { merge: true }
      );

    await db
      .collection('notification_blacklist')
      .doc(userId)
      .set({
        userId,
        blockedAt: FieldValue.serverTimestamp(),
        reason: 'account_deleted',
      });
  }

  private async revokeSessionsAndTokens(userId: string) {
    await SessionService.revokeAllUserSessions(userId);
    const adminAuth = admin.auth() as any;
    if (adminAuth && typeof adminAuth.revokeRefreshTokens === 'function') {
      await adminAuth.revokeRefreshTokens(userId).catch((error: unknown) => {
        logger.warn({ err: error, userId }, 'Failed to revoke Firebase refresh tokens');
      });
    }
    await cacheService.invalidateAuthCache(userId);
    await cacheService.invalidateUserCache(userId);
  }

  private async cleanupFirestoreData(userId: string): Promise<number> {
    let deleted = 0;
    const tasks = [
      this.deleteByField('chats', 'ownerId', userId),
      this.deleteByField('sessions', 'userId', userId),
      this.deleteByField('recentTasks', 'userId', userId),
      this.deleteByField('deviceTokens', 'userId', userId),
      this.deleteByField('pushTokens', 'userId', userId),
      this.deleteDocumentIfExists('deviceTokens', userId),
      this.deleteDocumentIfExists('pushTokens', userId),
      this.recursiveDeletePath(`messages/${userId}`),
      this.recursiveDeletePath(`uploads/${userId}`),
    ];

    const results = await Promise.all(tasks);
    deleted = results.reduce((sum, count) => sum + count, 0);
    return deleted;
  }

  private async cleanupStorageData(userId: string): Promise<number> {
    const prefixes = [`uploads/${userId}`, `history/${userId}`, `profileImages/${userId}`, `tempFiles/${userId}`];
    const bucket = storage.bucket();
    let deleted = 0;

    for (const prefix of prefixes) {
      try {
        const [files] = await bucket.getFiles({ prefix });
        if (!files || files.length === 0) {
          continue;
        }
        await Promise.all(
          files.map(async file => {
            try {
              await file.delete();
              deleted += 1;
            } catch (error) {
              logger.warn({ err: error, prefix, file: file.name }, 'Failed to delete storage object');
            }
          })
        );
      } catch (error) {
        logger.warn({ err: error, prefix }, 'Failed to enumerate storage prefix');
      }
    }

    return deleted;
  }

  private async cleanupThirdParties(payload: { userId: string; email?: string; reason: string }) {
    await Promise.allSettled([
      thirdPartyIntegrationService.anonymizeInCrm({
        userId: payload.userId,
        email: payload.email,
        reason: payload.reason,
        deletedAt: new Date().toISOString(),
      }),
      thirdPartyIntegrationService.purgeAnalyticsProfile({
        userId: payload.userId,
        email: payload.email,
        reason: payload.reason,
        deletedAt: new Date().toISOString(),
      }),
      thirdPartyIntegrationService.notifySupportDesk({
        userId: payload.userId,
        email: payload.email,
        reason: payload.reason,
        deletedAt: new Date().toISOString(),
      }),
    ]);
  }

  private async recordTelemetryEvent(data: {
    userId: string;
    jobId: string;
    deleteReason: string;
    restoreUntil?: string;
    durationMs: number;
    context: DeleteAccountContext;
    anonymous: boolean;
  }) {
    if (!config.deleteAccount.telemetryEnabled) {
      return;
    }

    await db.collection('telemetry_events').add({
      event: 'DELETE_ACCOUNT',
      userId: data.userId,
      jobId: data.jobId,
      reason: data.deleteReason,
      restoreUntil: data.restoreUntil || null,
      durationMs: data.durationMs,
      context: data.context,
      anonymous: data.anonymous,
      status: 'completed',
      timestamp: FieldValue.serverTimestamp(),
    });
  }

  private async deleteByField(collection: string, field: string, value: string): Promise<number> {
    try {
      const snapshot = await db
        .collection(collection)
        .where(field, '==', value)
        .limit(500)
        .get();
      if (snapshot.empty) {
        return 0;
      }
      const batch = db.batch();
      snapshot.docs.forEach(
        (
          doc: FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>
        ) => batch.delete(doc.ref)
      );
      await batch.commit();
      return snapshot.size;
    } catch (error) {
      logger.warn({ err: error, collection, field }, 'Failed to delete documents by field');
      return 0;
    }
  }

  private async deleteDocumentIfExists(collection: string, docId: string): Promise<number> {
    try {
      const ref = db.collection(collection).doc(docId);
      const doc = await ref.get();
      if (doc.exists) {
        await ref.delete();
        return 1;
      }
      return 0;
    } catch (error) {
      logger.warn({ err: error, collection, docId }, 'Failed to delete document');
      return 0;
    }
  }

  private async recursiveDeletePath(pathLike: string): Promise<number> {
    try {
      const segments = pathLike.split('/').filter(Boolean);
      if (segments.length < 2) {
        return 0;
      }

      const [rootCollection, docId, ...rest] = segments;
      let target: any = db.collection(rootCollection).doc(docId);
      while (rest.length > 0) {
        const segment = rest.shift();
        if (!segment) break;
        target = target.collection(segment);
        const next = rest.shift();
        if (!next) break;
        target = target.doc(next);
      }

      const firestoreAdmin: any = admin.firestore();
      if (typeof firestoreAdmin.recursiveDelete === 'function') {
        await firestoreAdmin.recursiveDelete(target);
      } else {
        await target.delete?.();
      }
      return 1;
    } catch (error) {
      logger.debug({ path: pathLike, err: error }, 'Recursive delete skipped');
      return 0;
    }
  }

  private createPhaseTracker(): DeletionJobPhase[] {
    return DELETION_PHASES.map(name => ({
      name,
      status: 'pending',
    }));
  }

  private updatePhase(
    phases: DeletionJobPhase[],
    name: PhaseName,
    status: DeletionJobPhase['status'],
    error?: string
  ) {
    const phase = phases.find(item => item.name === name);
    if (!phase) {
      return;
    }
    phase.status = status;
    const now = new Date().toISOString();
    if (status === 'running') {
      phase.startedAt = now;
    } else {
      phase.completedAt = now;
    }
    if (error) {
      phase.error = error;
    }
  }

  private calculateRestoreUntil(isAnonymous: boolean): string | undefined {
    if (isAnonymous) {
      return undefined;
    }
    const days = config.deleteAccount.restoreWindowDays;
    if (!days || days <= 0) {
      return undefined;
    }
    const window = new Date();
    window.setDate(window.getDate() + days);
    return window.toISOString();
  }

  private ensureLogDirectory() {
    try {
      if (!fs.existsSync(this.logDirectory)) {
        fs.mkdirSync(this.logDirectory, { recursive: true });
      }
    } catch (error) {
      logger.warn({ err: error }, 'Failed to ensure delete account log directory');
    }
  }

  private async appendDeletionLog(line: string) {
    try {
      const filePath = path.join(
        this.logDirectory,
        `delete-account-${new Date().toISOString().split('T')[0]}.log`
      );
      await fs.promises.appendFile(filePath, `${line}\n`);
    } catch (error) {
      logger.warn({ err: error }, 'Failed to append delete account log');
    }
  }

  private normalizeError(error: unknown): DeleteAccountError {
    if (error instanceof DeleteAccountError) {
      return error;
    }
    const err = error as Error;
    return new DeleteAccountError('DELETE_FAILED', err?.message || 'Delete account failed', 500, error);
  }

  private extractProviders(authRecord: any): string[] {
    if (!authRecord || !authRecord.providerData) {
      return [];
    }
    return authRecord.providerData.map((provider: any) => provider.providerId).filter(Boolean);
  }

  private async safeGetAuthUser(userId: string): Promise<any> {
    try {
      return await admin.auth().getUser(userId);
    } catch (error) {
      logger.warn({ err: error, userId }, 'Failed to fetch Firebase auth user');
      return null;
    }
  }
}

export const deleteAccountService = new DeleteAccountService();


