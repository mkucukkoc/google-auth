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
exports.backupService = void 0;
const firestore_1 = require("firebase-admin/firestore");
const storage_1 = require("firebase-admin/storage");
const logger_1 = require("../utils/logger");
const cacheService_1 = require("./cacheService");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const util_1 = require("util");
const child_process_1 = require("child_process");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
class BackupService {
    constructor() {
        this.config = {
            enabled: process.env.BACKUP_ENABLED === 'true',
            schedule: process.env.BACKUP_SCHEDULE || '0 2 * * *', // Daily at 2 AM
            retentionDays: parseInt(process.env.BACKUP_RETENTION_DAYS || '30'),
            storageType: process.env.BACKUP_STORAGE_TYPE || 'local',
            compression: process.env.BACKUP_COMPRESSION === 'true',
            encryption: process.env.BACKUP_ENCRYPTION === 'true',
            collections: process.env.BACKUP_COLLECTIONS?.split(',') || [],
            excludeCollections: process.env.BACKUP_EXCLUDE_COLLECTIONS?.split(',') || ['_test', '_health'],
        };
        this.firestore = (0, firestore_1.getFirestore)();
        this.storage = (0, storage_1.getStorage)();
        this.backupPath = process.env.BACKUP_PATH || './backups';
    }
    static getInstance() {
        if (!BackupService.instance) {
            BackupService.instance = new BackupService();
        }
        return BackupService.instance;
    }
    // Full database backup
    async createFullBackup() {
        const startTime = Date.now();
        const backupId = `backup_${Date.now()}`;
        const timestamp = new Date();
        try {
            logger_1.logger.info(`Starting full backup: ${backupId}`);
            // Create backup directory
            const backupDir = path.join(this.backupPath, backupId);
            await this.ensureDirectoryExists(backupDir);
            // Get all collections
            const collections = await this.getCollectionsToBackup();
            logger_1.logger.info(`Backing up ${collections.length} collections`);
            // Backup each collection
            const backupResults = await Promise.all(collections.map(collection => this.backupCollection(collection, backupDir)));
            // Create backup manifest
            const manifest = {
                backupId,
                timestamp: timestamp.toISOString(),
                collections: backupResults,
                totalDocuments: backupResults.reduce((sum, result) => sum + result.documentCount, 0),
                config: this.config,
            };
            const manifestPath = path.join(backupDir, 'manifest.json');
            await fs.promises.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
            // Compress backup if enabled
            let finalPath = backupDir;
            if (this.config.compression) {
                finalPath = await this.compressBackup(backupDir);
            }
            // Encrypt backup if enabled
            if (this.config.encryption) {
                finalPath = await this.encryptBackup(finalPath);
            }
            // Upload to cloud storage if configured
            if (this.config.storageType !== 'local') {
                await this.uploadToCloudStorage(finalPath, backupId);
            }
            // Calculate backup size
            const stats = await fs.promises.stat(finalPath);
            const size = stats.isDirectory() ? await this.getDirectorySize(finalPath) : stats.size;
            const duration = Date.now() - startTime;
            const result = {
                success: true,
                backupId,
                timestamp,
                size,
                collections: collections,
                duration,
            };
            logger_1.logger.info(`Backup completed successfully: ${backupId}`, {
                size: this.formatBytes(size),
                duration: `${duration}ms`,
                collections: collections.length,
            });
            // Store backup metadata in cache
            await cacheService_1.cacheService.set(`backup:${backupId}`, result, 86400 * this.config.retentionDays);
            return result;
        }
        catch (error) {
            const duration = Date.now() - startTime;
            logger_1.logger.error(`Backup failed: ${backupId}`, error);
            return {
                success: false,
                backupId,
                timestamp,
                size: 0,
                collections: [],
                duration,
                error: error.message,
            };
        }
    }
    // Incremental backup (only changed documents)
    async createIncrementalBackup(lastBackupTime) {
        const startTime = Date.now();
        const backupId = `incremental_${Date.now()}`;
        const timestamp = new Date();
        try {
            logger_1.logger.info(`Starting incremental backup: ${backupId}`);
            const backupDir = path.join(this.backupPath, backupId);
            await this.ensureDirectoryExists(backupDir);
            const collections = await this.getCollectionsToBackup();
            const backupResults = [];
            for (const collection of collections) {
                // Query documents modified since last backup
                const query = this.firestore
                    .collection(collection)
                    .where('updated_at', '>=', lastBackupTime)
                    .orderBy('updated_at');
                const snapshot = await query.get();
                if (!snapshot.empty) {
                    const result = await this.backupCollection(collection, backupDir, snapshot);
                    backupResults.push(result);
                }
            }
            const manifest = {
                backupId,
                timestamp: timestamp.toISOString(),
                type: 'incremental',
                lastBackupTime: lastBackupTime.toISOString(),
                collections: backupResults,
                totalDocuments: backupResults.reduce((sum, result) => sum + result.documentCount, 0),
            };
            const manifestPath = path.join(backupDir, 'manifest.json');
            await fs.promises.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
            const stats = await fs.promises.stat(backupDir);
            const size = await this.getDirectorySize(backupDir);
            const duration = Date.now() - startTime;
            const result = {
                success: true,
                backupId,
                timestamp,
                size,
                collections: collections,
                duration,
            };
            logger_1.logger.info(`Incremental backup completed: ${backupId}`, {
                size: this.formatBytes(size),
                duration: `${duration}ms`,
                documents: backupResults.reduce((sum, r) => sum + r.documentCount, 0),
            });
            return result;
        }
        catch (error) {
            const duration = Date.now() - startTime;
            logger_1.logger.error(`Incremental backup failed: ${backupId}`, error);
            return {
                success: false,
                backupId,
                timestamp,
                size: 0,
                collections: [],
                duration,
                error: error.message,
            };
        }
    }
    // Restore from backup
    async restoreFromBackup(backupId, collections) {
        try {
            logger_1.logger.info(`Starting restore from backup: ${backupId}`);
            const backupDir = path.join(this.backupPath, backupId);
            // Check if backup exists
            if (!await this.directoryExists(backupDir)) {
                throw new Error(`Backup not found: ${backupId}`);
            }
            // Read manifest
            const manifestPath = path.join(backupDir, 'manifest.json');
            const manifest = JSON.parse(await fs.promises.readFile(manifestPath, 'utf8'));
            const collectionsToRestore = collections || manifest.collections;
            for (const collection of collectionsToRestore) {
                const collectionDir = path.join(backupDir, collection);
                if (await this.directoryExists(collectionDir)) {
                    await this.restoreCollection(collection, collectionDir);
                }
            }
            logger_1.logger.info(`Restore completed successfully: ${backupId}`);
            return true;
        }
        catch (error) {
            logger_1.logger.error(`Restore failed: ${backupId}`, error);
            return false;
        }
    }
    // List available backups
    async listBackups() {
        try {
            const backups = await cacheService_1.cacheService.keys('backup:*');
            const results = [];
            for (const key of backups) {
                const backup = await cacheService_1.cacheService.get(key);
                if (backup) {
                    results.push(backup);
                }
            }
            return results.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
        }
        catch (error) {
            logger_1.logger.error('Failed to list backups:', error);
            return [];
        }
    }
    // Cleanup old backups
    async cleanupOldBackups() {
        try {
            const backups = await this.listBackups();
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - this.config.retentionDays);
            let deletedCount = 0;
            for (const backup of backups) {
                if (backup.timestamp < cutoffDate) {
                    // Delete from cache
                    await cacheService_1.cacheService.del(`backup:${backup.backupId}`);
                    // Delete from filesystem
                    const backupDir = path.join(this.backupPath, backup.backupId);
                    if (await this.directoryExists(backupDir)) {
                        await fs.promises.rm(backupDir, { recursive: true });
                    }
                    deletedCount++;
                }
            }
            logger_1.logger.info(`Cleaned up ${deletedCount} old backups`);
            return deletedCount;
        }
        catch (error) {
            logger_1.logger.error('Backup cleanup failed:', error);
            return 0;
        }
    }
    // Private helper methods
    async getCollectionsToBackup() {
        if (this.config.collections.length > 0) {
            return this.config.collections;
        }
        // Get all collections from Firestore
        const collections = [];
        const snapshot = await this.firestore.listCollections();
        for (const collection of snapshot) {
            if (!this.config.excludeCollections.includes(collection.id)) {
                collections.push(collection.id);
            }
        }
        return collections;
    }
    async backupCollection(collection, backupDir, snapshot) {
        const collectionDir = path.join(backupDir, collection);
        await this.ensureDirectoryExists(collectionDir);
        const docsSnapshot = snapshot || await this.firestore.collection(collection).get();
        const documents = [];
        for (const doc of docsSnapshot.docs) {
            const docData = {
                id: doc.id,
                data: doc.data(),
                createdAt: doc.createTime?.toDate()?.toISOString(),
                updatedAt: doc.updateTime?.toDate()?.toISOString(),
            };
            documents.push(docData);
            // Write individual document file
            const docPath = path.join(collectionDir, `${doc.id}.json`);
            await fs.promises.writeFile(docPath, JSON.stringify(docData, null, 2));
        }
        // Write collection summary
        const summary = {
            collection,
            documentCount: documents.length,
            timestamp: new Date().toISOString(),
        };
        const summaryPath = path.join(collectionDir, '_summary.json');
        await fs.promises.writeFile(summaryPath, JSON.stringify(summary, null, 2));
        return summary;
    }
    async restoreCollection(collection, collectionDir) {
        const files = await fs.promises.readdir(collectionDir);
        const docFiles = files.filter(file => file.endsWith('.json') && file !== '_summary.json');
        for (const file of docFiles) {
            const docPath = path.join(collectionDir, file);
            const docData = JSON.parse(await fs.promises.readFile(docPath, 'utf8'));
            await this.firestore.collection(collection).doc(docData.id).set(docData.data);
        }
    }
    async compressBackup(backupDir) {
        const compressedPath = `${backupDir}.tar.gz`;
        try {
            await execAsync(`tar -czf "${compressedPath}" -C "${path.dirname(backupDir)}" "${path.basename(backupDir)}"`);
            // Remove original directory
            await fs.promises.rm(backupDir, { recursive: true });
            return compressedPath;
        }
        catch (error) {
            logger_1.logger.error('Backup compression failed:', error);
            return backupDir;
        }
    }
    async encryptBackup(backupPath) {
        // Simple encryption using openssl
        const encryptedPath = `${backupPath}.enc`;
        const password = process.env.BACKUP_ENCRYPTION_PASSWORD || 'default_password';
        try {
            await execAsync(`openssl enc -aes-256-cbc -salt -in "${backupPath}" -out "${encryptedPath}" -k "${password}"`);
            // Remove unencrypted file
            await fs.promises.unlink(backupPath);
            return encryptedPath;
        }
        catch (error) {
            logger_1.logger.error('Backup encryption failed:', error);
            return backupPath;
        }
    }
    async uploadToCloudStorage(backupPath, backupId) {
        if (this.config.storageType === 'gcs') {
            const bucket = this.storage.bucket();
            const fileName = `backups/${backupId}/${path.basename(backupPath)}`;
            await bucket.upload(backupPath, {
                destination: fileName,
                metadata: {
                    metadata: {
                        backupId,
                        timestamp: new Date().toISOString(),
                    },
                },
            });
        }
        // Add S3 support if needed
    }
    async ensureDirectoryExists(dirPath) {
        try {
            await fs.promises.mkdir(dirPath, { recursive: true });
        }
        catch (error) {
            if (error.code !== 'EEXIST') {
                throw error;
            }
        }
    }
    async directoryExists(dirPath) {
        try {
            const stats = await fs.promises.stat(dirPath);
            return stats.isDirectory();
        }
        catch {
            return false;
        }
    }
    async getDirectorySize(dirPath) {
        let size = 0;
        const files = await fs.promises.readdir(dirPath);
        for (const file of files) {
            const filePath = path.join(dirPath, file);
            const stats = await fs.promises.stat(filePath);
            if (stats.isDirectory()) {
                size += await this.getDirectorySize(filePath);
            }
            else {
                size += stats.size;
            }
        }
        return size;
    }
    formatBytes(bytes) {
        if (bytes === 0)
            return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
    // Schedule backup
    scheduleBackups() {
        if (!this.config.enabled) {
            logger_1.logger.info('Backup scheduling disabled');
            return;
        }
        // This would integrate with a cron job scheduler
        logger_1.logger.info(`Backups scheduled: ${this.config.schedule}`);
    }
}
// Export singleton instance
exports.backupService = BackupService.getInstance();
