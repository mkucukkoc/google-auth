"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dataRetentionService = void 0;
// import { getFirestore } from 'firebase-admin/firestore';
const logger_1 = require("../utils/logger");
const cacheService_1 = require("./cacheService");
class DataRetentionService {
    constructor() {
        // Mock Firestore for testing
        this.firestore = null;
        this.config = {
            policies: this.getDefaultPolicies(),
            dryRun: process.env.DATA_RETENTION_DRY_RUN === 'true',
            batchSize: parseInt(process.env.DATA_RETENTION_BATCH_SIZE || '100'),
            maxExecutionTime: parseInt(process.env.DATA_RETENTION_MAX_TIME || '300000'), // 5 minutes
        };
    }
    static getInstance() {
        if (!DataRetentionService.instance) {
            DataRetentionService.instance = new DataRetentionService();
        }
        return DataRetentionService.instance;
    }
    getDefaultPolicies() {
        return [
            // Audit logs - keep for 90 days
            {
                collection: 'audit_logs',
                field: 'created_at',
                retentionDays: 90,
                batchSize: 100,
                enabled: true,
            },
            // Session logs - keep for 30 days
            {
                collection: 'session_logs',
                field: 'created_at',
                retentionDays: 30,
                batchSize: 100,
                enabled: true,
            },
            // Password reset tokens - keep for 1 day
            {
                collection: 'password_resets',
                field: 'created_at',
                retentionDays: 1,
                batchSize: 50,
                enabled: true,
            },
            // Rate limit logs - keep for 7 days
            {
                collection: 'rate_limits',
                field: 'created_at',
                retentionDays: 7,
                batchSize: 100,
                enabled: true,
            },
            // Temporary files - keep for 3 days
            {
                collection: 'temp_files',
                field: 'created_at',
                retentionDays: 3,
                batchSize: 50,
                enabled: true,
            },
            // Error logs - keep for 30 days
            {
                collection: 'error_logs',
                field: 'created_at',
                retentionDays: 30,
                batchSize: 100,
                enabled: true,
            },
            // Chat messages - keep for 1 year (configurable per user)
            {
                collection: 'messages',
                field: 'created_at',
                retentionDays: 365,
                batchSize: 50,
                enabled: true,
                conditions: [
                    { field: 'is_archived', operator: '==', value: true }
                ],
            },
            // User activity logs - keep for 6 months
            {
                collection: 'user_activities',
                field: 'created_at',
                retentionDays: 180,
                batchSize: 100,
                enabled: true,
            },
            // API logs - keep for 14 days
            {
                collection: 'api_logs',
                field: 'created_at',
                retentionDays: 14,
                batchSize: 100,
                enabled: true,
            },
            // Cache entries - keep for 1 day
            {
                collection: 'cache_entries',
                field: 'expires_at',
                retentionDays: 1,
                batchSize: 200,
                enabled: true,
            },
        ];
    }
    // Run all retention policies
    async runRetentionPolicies() {
        const results = [];
        const startTime = Date.now();
        logger_1.logger.info('Starting data retention cleanup', {
            dryRun: this.config.dryRun,
            policies: this.config.policies.length,
        });
        for (const policy of this.config.policies) {
            if (!policy.enabled) {
                logger_1.logger.debug(`Skipping disabled policy: ${policy.collection}`);
                continue;
            }
            // Check if we're running out of time
            if (Date.now() - startTime > this.config.maxExecutionTime) {
                logger_1.logger.warn('Data retention cleanup timeout reached');
                break;
            }
            try {
                const result = await this.cleanupCollection(policy);
                results.push(result);
                if (result.success) {
                    logger_1.logger.info(`Cleanup completed for ${policy.collection}`, {
                        deletedCount: result.deletedCount,
                        duration: result.duration,
                    });
                }
                else {
                    logger_1.logger.error(`Cleanup failed for ${policy.collection}`, {
                        error: result.error,
                    });
                }
            }
            catch (error) {
                logger_1.logger.error(`Error cleaning up ${policy.collection}:`, error);
                results.push({
                    collection: policy.collection,
                    deletedCount: 0,
                    duration: 0,
                    success: false,
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        }
        const totalDeleted = results.reduce((sum, result) => sum + result.deletedCount, 0);
        const totalDuration = Date.now() - startTime;
        logger_1.logger.info('Data retention cleanup completed', {
            totalDeleted,
            totalDuration,
            results: results.length,
        });
        // Store cleanup statistics
        await this.storeCleanupStats(results, totalDuration);
        return results;
    }
    // Cleanup specific collection
    async cleanupCollection(policy) {
        const startTime = Date.now();
        let deletedCount = 0;
        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - policy.retentionDays);
            // Build query
            let query = this.firestore
                .collection(policy.collection)
                .where(policy.field, '<', cutoffDate)
                .limit(policy.batchSize);
            // Add additional conditions
            if (policy.conditions) {
                for (const condition of policy.conditions) {
                    query = query.where(condition.field, condition.operator, condition.value);
                }
            }
            const snapshot = await query.get();
            if (snapshot.empty) {
                return {
                    collection: policy.collection,
                    deletedCount: 0,
                    duration: Date.now() - startTime,
                    success: true,
                };
            }
            if (this.config.dryRun) {
                logger_1.logger.info(`DRY RUN: Would delete ${snapshot.size} documents from ${policy.collection}`);
                return {
                    collection: policy.collection,
                    deletedCount: snapshot.size,
                    duration: Date.now() - startTime,
                    success: true,
                };
            }
            // Delete documents in batches (mocked)
            console.log(`Mock DataRetentionService: Would delete ${Math.min(snapshot.docs.length, policy.batchSize)} documents from ${policy.collection}`);
            const docsToDelete = snapshot.docs.slice(0, policy.batchSize);
            for (const doc of docsToDelete) {
                // Mock batch delete
                deletedCount++;
            }
            // Mock batch commit
            console.log(`Mock DataRetentionService: Committed batch delete for ${policy.collection}`);
            // If we deleted a full batch, there might be more documents
            if (snapshot.size === policy.batchSize) {
                // Recursively clean up remaining documents
                const remainingResult = await this.cleanupCollection(policy);
                deletedCount += remainingResult.deletedCount;
            }
            return {
                collection: policy.collection,
                deletedCount,
                duration: Date.now() - startTime,
                success: true,
            };
        }
        catch (error) {
            return {
                collection: policy.collection,
                deletedCount,
                duration: Date.now() - startTime,
                success: false,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }
    // Cleanup specific user data (GDPR compliance)
    async cleanupUserData(userId) {
        const results = [];
        const userCollections = [
            'chats',
            'messages',
            'user_activities',
            'user_preferences',
            'user_sessions',
        ];
        logger_1.logger.info(`Starting user data cleanup for user: ${userId}`);
        for (const collection of userCollections) {
            try {
                const result = await this.cleanupUserCollection(userId, collection);
                results.push(result);
            }
            catch (error) {
                logger_1.logger.error(`Error cleaning up user data in ${collection}:`, error);
                results.push({
                    collection,
                    deletedCount: 0,
                    duration: 0,
                    success: false,
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        }
        return results;
    }
    async cleanupUserCollection(userId, collection) {
        const startTime = Date.now();
        let deletedCount = 0;
        try {
            const query = this.firestore
                .collection(collection)
                .where('user_id', '==', userId)
                .limit(100);
            const snapshot = await query.get();
            if (snapshot.empty) {
                return {
                    collection,
                    deletedCount: 0,
                    duration: Date.now() - startTime,
                    success: true,
                };
            }
            if (this.config.dryRun) {
                logger_1.logger.info(`DRY RUN: Would delete ${snapshot.size} documents from ${collection} for user ${userId}`);
                return {
                    collection,
                    deletedCount: snapshot.size,
                    duration: Date.now() - startTime,
                    success: true,
                };
            }
            // Mock batch delete
            console.log(`Mock DataRetentionService: Would delete ${snapshot.docs.length} documents from ${collection}`);
            for (const doc of snapshot.docs) {
                // Mock batch delete
                deletedCount++;
            }
            // Mock batch commit
            console.log(`Mock DataRetentionService: Committed batch delete for ${collection}`);
            return {
                collection,
                deletedCount,
                duration: Date.now() - startTime,
                success: true,
            };
        }
        catch (error) {
            return {
                collection,
                deletedCount,
                duration: Date.now() - startTime,
                success: false,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }
    // Archive old data instead of deleting
    async archiveOldData(policy) {
        const startTime = Date.now();
        let archivedCount = 0;
        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - policy.retentionDays);
            const query = this.firestore
                .collection(policy.collection)
                .where(policy.field, '<', cutoffDate)
                .where('is_archived', '==', false)
                .limit(policy.batchSize);
            const snapshot = await query.get();
            if (snapshot.empty) {
                return {
                    collection: policy.collection,
                    deletedCount: 0,
                    duration: Date.now() - startTime,
                    success: true,
                };
            }
            if (this.config.dryRun) {
                logger_1.logger.info(`DRY RUN: Would archive ${snapshot.size} documents from ${policy.collection}`);
                return {
                    collection: policy.collection,
                    deletedCount: snapshot.size,
                    duration: Date.now() - startTime,
                    success: true,
                };
            }
            // Mock batch update
            console.log(`Mock DataRetentionService: Would archive ${snapshot.docs.length} documents from ${policy.collection}`);
            for (const doc of snapshot.docs) {
                // Mock batch update
                archivedCount++;
            }
            // Mock batch commit
            console.log(`Mock DataRetentionService: Committed batch archive for ${policy.collection}`);
            return {
                collection: policy.collection,
                deletedCount: archivedCount,
                duration: Date.now() - startTime,
                success: true,
            };
        }
        catch (error) {
            return {
                collection: policy.collection,
                deletedCount: archivedCount,
                duration: Date.now() - startTime,
                success: false,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }
    // Store cleanup statistics
    async storeCleanupStats(results, totalDuration) {
        try {
            const stats = {
                timestamp: new Date(),
                totalDeleted: results.reduce((sum, result) => sum + result.deletedCount, 0),
                totalDuration,
                results,
                dryRun: this.config.dryRun,
            };
            // Mock Firestore stats save
            console.log('Mock DataRetentionService: Would save cleanup stats to Firestore');
            // Store in cache for quick access
            await cacheService_1.cacheService.set('cleanup:last_run', stats, 86400); // 24 hours
        }
        catch (error) {
            logger_1.logger.error('Failed to store cleanup stats:', error);
        }
    }
    // Get cleanup statistics
    async getCleanupStats() {
        try {
            const stats = await cacheService_1.cacheService.get('cleanup:last_run');
            return stats;
        }
        catch (error) {
            logger_1.logger.error('Failed to get cleanup stats:', error);
            return null;
        }
    }
    // Update retention policy
    updatePolicy(collection, policy) {
        const existingPolicy = this.config.policies.find(p => p.collection === collection);
        if (existingPolicy) {
            Object.assign(existingPolicy, policy);
            logger_1.logger.info(`Updated retention policy for ${collection}`, policy);
        }
        else {
            this.config.policies.push({
                collection,
                field: 'created_at',
                retentionDays: 30,
                batchSize: 100,
                enabled: true,
                ...policy,
            });
            logger_1.logger.info(`Added new retention policy for ${collection}`, policy);
        }
    }
    // Schedule retention cleanup
    scheduleCleanup() {
        // This would integrate with a cron job scheduler
        logger_1.logger.info('Data retention cleanup scheduled');
    }
}
// Export singleton instance
exports.dataRetentionService = DataRetentionService.getInstance();
