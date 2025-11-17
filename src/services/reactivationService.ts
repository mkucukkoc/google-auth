import { db } from '../firebase';
import { logger } from '../utils/logger';

export async function restoreSoftDeletedUser(userId: string) {
  try {
    await db
      .collection('subsc')
      .doc(userId)
      .set(
        {
          isDeleted: false,
          is_deleted: false,
          deletedAt: null,
          premiumCancelledAt: null,
          restoredAt: new Date().toISOString(),
        },
        { merge: true }
      );
    logger.info({ userId }, 'Soft-deleted user reactivated');
  } catch (error: unknown) {
    logger.warn({ error, userId }, 'Failed to clear soft delete flags during reactivation');
  }
}

export async function cleanupDeletedAccountArtifacts(userId: string) {
  logger.info({ userId }, 'Cleaning up deleted account artifacts');
  const cleanupJobs = [
    deleteDocumentIfExists('deleted_users_subsc', userId, 'deleted_users_subsc record'),
    deleteDocumentIfExists('notification_blacklist', userId, 'notification blacklist record'),
    deleteDeletionJobsForUser(userId),
    deleteTelemetryEventsForUser(userId),
  ];

  await Promise.all(cleanupJobs);
  logger.info({ userId }, 'Deleted account artifacts cleanup finished');
}

async function deleteDocumentIfExists(collection: string, docId: string, logLabel: string) {
  try {
    const ref = db.collection(collection).doc(docId);
    const doc = await ref.get();
    if (!doc.exists) {
      logger.debug({ docId, collection }, `No ${logLabel} found during restore`);
      return;
    }
    await ref.delete();
    logger.info({ docId, collection }, `${logLabel} deleted during restore`);
  } catch (error: unknown) {
    logger.warn({ error, docId, collection }, `Failed to delete ${logLabel} during restore`);
  }
}

async function deleteDeletionJobsForUser(userId: string) {
  try {
    const snapshot = await db
      .collection('deletion_jobs')
      .where('userId', '==', userId)
      .limit(100)
      .get();

    if (snapshot.empty) {
      logger.debug({ userId }, 'No deletion jobs found for cleanup');
      return;
    }

    const batch = db.batch();
    snapshot.docs.forEach((doc: any) => batch.delete(doc.ref));
    await batch.commit();
    logger.info({ userId, deletedJobs: snapshot.size }, 'Deletion job records cleaned up for user restore');

    if (snapshot.size === 100) {
      await deleteDeletionJobsForUser(userId);
    }
  } catch (error: unknown) {
    logger.warn({ error, userId }, 'Failed to cleanup deletion job records during user restore');
  }
}

async function deleteTelemetryEventsForUser(userId: string) {
  try {
    const snapshot = await db
      .collection('telemetry_events')
      .where('userId', '==', userId)
      .where('event', '==', 'DELETE_ACCOUNT')
      .limit(100)
      .get();

    if (snapshot.empty) {
      logger.debug({ userId }, 'No telemetry events found for cleanup');
      return;
    }

    const batch = db.batch();
    snapshot.docs.forEach((doc: any) => batch.delete(doc.ref));
    await batch.commit();
    logger.info({ userId, deletedEvents: snapshot.size }, 'Telemetry events cleaned up for user restore');

    if (snapshot.size === 100) {
      await deleteTelemetryEventsForUser(userId);
    }
  } catch (error: unknown) {
    logger.warn({ error, userId }, 'Failed to cleanup telemetry events during user restore');
  }
}

