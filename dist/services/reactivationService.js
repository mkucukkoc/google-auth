"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.restoreSoftDeletedUser = restoreSoftDeletedUser;
exports.cleanupDeletedAccountArtifacts = cleanupDeletedAccountArtifacts;
exports.ensureFirebaseAuthUserProfile = ensureFirebaseAuthUserProfile;
const firebase_1 = require("../firebase");
const logger_1 = require("../utils/logger");
async function restoreSoftDeletedUser(userId) {
    try {
        await firebase_1.db
            .collection('subsc')
            .doc(userId)
            .set({
            isDeleted: false,
            is_deleted: false,
            deletedAt: null,
            premiumCancelledAt: null,
            restoredAt: new Date().toISOString(),
        }, { merge: true });
        logger_1.logger.info({ userId }, 'Soft-deleted user reactivated');
    }
    catch (error) {
        logger_1.logger.warn({ error, userId }, 'Failed to clear soft delete flags during reactivation');
    }
}
async function cleanupDeletedAccountArtifacts(userId) {
    logger_1.logger.info({ userId }, 'Cleaning up deleted account artifacts');
    const cleanupJobs = [
        deleteDocumentIfExists('deleted_users_subsc', userId, 'deleted_users_subsc record'),
        deleteDocumentIfExists('notification_blacklist', userId, 'notification blacklist record'),
        deleteDeletionJobsForUser(userId),
        deleteTelemetryEventsForUser(userId),
    ];
    await Promise.all(cleanupJobs);
    logger_1.logger.info({ userId }, 'Deleted account artifacts cleanup finished');
}
async function ensureFirebaseAuthUserProfile(userId, profile) {
    try {
        const existing = await firebase_1.admin.auth().getUser(userId);
        const updates = {};
        if (profile.email && existing.email !== profile.email) {
            updates.email = profile.email;
            updates.emailVerified = true;
        }
        if (profile.name && existing.displayName !== profile.name) {
            updates.displayName = profile.name;
        }
        if (Object.keys(updates).length > 0) {
            await firebase_1.admin.auth().updateUser(userId, updates);
            logger_1.logger.info({ userId }, 'Firebase Auth user profile updated during reactivation');
        }
    }
    catch (error) {
        if (error?.code === 'auth/user-not-found') {
            if (!profile.email) {
                logger_1.logger.warn({ userId }, 'Cannot recreate Firebase Auth user without email');
                return;
            }
            await firebase_1.admin.auth().createUser({
                uid: userId,
                email: profile.email,
                displayName: profile.name,
                emailVerified: true,
            });
            logger_1.logger.info({ userId }, 'Firebase Auth user recreated during reactivation');
            return;
        }
        logger_1.logger.warn({ error, userId }, 'Failed to ensure Firebase Auth user profile');
    }
}
async function deleteDocumentIfExists(collection, docId, logLabel) {
    try {
        const ref = firebase_1.db.collection(collection).doc(docId);
        const doc = await ref.get();
        if (!doc.exists) {
            logger_1.logger.debug({ docId, collection }, `No ${logLabel} found during restore`);
            return;
        }
        await ref.delete();
        logger_1.logger.info({ docId, collection }, `${logLabel} deleted during restore`);
    }
    catch (error) {
        logger_1.logger.warn({ error, docId, collection }, `Failed to delete ${logLabel} during restore`);
    }
}
async function deleteDeletionJobsForUser(userId) {
    try {
        const snapshot = await firebase_1.db
            .collection('deletion_jobs')
            .where('userId', '==', userId)
            .limit(100)
            .get();
        if (snapshot.empty) {
            logger_1.logger.debug({ userId }, 'No deletion jobs found for cleanup');
            return;
        }
        const batch = firebase_1.db.batch();
        snapshot.docs.forEach((doc) => batch.delete(doc.ref));
        await batch.commit();
        logger_1.logger.info({ userId, deletedJobs: snapshot.size }, 'Deletion job records cleaned up for user restore');
        if (snapshot.size === 100) {
            await deleteDeletionJobsForUser(userId);
        }
    }
    catch (error) {
        logger_1.logger.warn({ error, userId }, 'Failed to cleanup deletion job records during user restore');
    }
}
async function deleteTelemetryEventsForUser(userId) {
    try {
        const snapshot = await firebase_1.db
            .collection('telemetry_events')
            .where('userId', '==', userId)
            .where('event', '==', 'DELETE_ACCOUNT')
            .limit(100)
            .get();
        if (snapshot.empty) {
            logger_1.logger.debug({ userId }, 'No telemetry events found for cleanup');
            return;
        }
        const batch = firebase_1.db.batch();
        snapshot.docs.forEach((doc) => batch.delete(doc.ref));
        await batch.commit();
        logger_1.logger.info({ userId, deletedEvents: snapshot.size }, 'Telemetry events cleaned up for user restore');
        if (snapshot.size === 100) {
            await deleteTelemetryEventsForUser(userId);
        }
    }
    catch (error) {
        logger_1.logger.warn({ error, userId }, 'Failed to cleanup telemetry events during user restore');
    }
}
