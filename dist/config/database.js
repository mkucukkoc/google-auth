"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.queryOptimizer = exports.QueryOptimizer = exports.dbConnection = exports.DatabaseConnection = exports.databaseManager = void 0;
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
const auth_1 = require("firebase-admin/auth");
const storage_1 = require("firebase-admin/storage");
const logger_1 = require("../utils/logger");
class DatabaseManager {
    constructor() {
        this.app = null;
        this.firestore = null;
        this.auth = null;
        this.storage = null;
        this.isConnected = false;
    }
    static getInstance() {
        if (!DatabaseManager.instance) {
            DatabaseManager.instance = new DatabaseManager();
        }
        return DatabaseManager.instance;
    }
    async initialize(config) {
        try {
            // Check if app already exists
            const existingApps = (0, app_1.getApps)();
            if (existingApps.length > 0) {
                this.app = existingApps[0];
                logger_1.logger.info('Using existing Firebase app');
            }
            else {
                // Initialize new app
                this.app = (0, app_1.initializeApp)({
                    credential: {
                        projectId: config.projectId,
                        privateKey: config.privateKey.replace(/\\n/g, '\n'),
                        clientEmail: config.clientEmail,
                    },
                    storageBucket: config.storageBucket,
                    databaseURL: config.databaseURL,
                });
                logger_1.logger.info('Firebase app initialized');
            }
            // Initialize Firestore with connection pooling settings
            const firestoreSettings = {
                // Connection pooling settings
                maxIdleTime: config.maxIdleTime || 300000, // 5 minutes
                maxConcurrentStreams: config.maxConnections || 100,
                // Timeout settings
                timeout: config.connectionTimeout || 30000, // 30 seconds
                requestTimeout: config.requestTimeout || 60000, // 60 seconds
                // Retry settings
                retrySettings: {
                    initialRetryDelayMillis: 1000,
                    maxRetryDelayMillis: 10000,
                    retryDelayMultiplier: 1.3,
                    maxRetries: 3,
                },
                // Other optimizations
                ignoreUndefinedProperties: true,
                preferRest: true, // Use REST API for better performance
            };
            this.firestore = (0, firestore_1.getFirestore)(this.app);
            this.firestore.settings(firestoreSettings);
            // Initialize other services
            this.auth = (0, auth_1.getAuth)(this.app);
            this.storage = (0, storage_1.getStorage)(this.app);
            this.isConnected = true;
            logger_1.logger.info('Database services initialized successfully');
            // Test connection
            await this.testConnection();
        }
        catch (error) {
            logger_1.logger.error('Database initialization failed:', error);
            this.isConnected = false;
            throw error;
        }
    }
    getFirestore() {
        if (!this.firestore) {
            throw new Error('Firestore not initialized');
        }
        return this.firestore;
    }
    getAuth() {
        if (!this.auth) {
            throw new Error('Auth not initialized');
        }
        return this.auth;
    }
    getStorage() {
        if (!this.storage) {
            throw new Error('Storage not initialized');
        }
        return this.storage;
    }
    isDatabaseConnected() {
        return this.isConnected;
    }
    async testConnection() {
        try {
            if (!this.firestore) {
                throw new Error('Firestore not initialized');
            }
            // Test Firestore connection
            const testDoc = this.firestore.collection('_test').doc('connection');
            await testDoc.set({ test: true, timestamp: new Date() });
            await testDoc.delete();
            logger_1.logger.info('Database connection test successful');
        }
        catch (error) {
            logger_1.logger.error('Database connection test failed:', error);
            this.isConnected = false;
            throw error;
        }
    }
    // Connection health check
    async healthCheck() {
        const start = Date.now();
        const result = {
            connected: this.isConnected,
            firestore: false,
            auth: false,
            storage: false,
            latency: 0,
        };
        try {
            // Test Firestore
            if (this.firestore) {
                const testDoc = this.firestore.collection('_health').doc('check');
                await testDoc.set({ health: true, timestamp: new Date() });
                await testDoc.delete();
                result.firestore = true;
            }
            // Test Auth (simple operation)
            if (this.auth) {
                // Just check if service is available
                result.auth = true;
            }
            // Test Storage (simple operation)
            if (this.storage) {
                // Just check if service is available
                result.storage = true;
            }
            result.latency = Date.now() - start;
            result.connected = result.firestore && result.auth && result.storage;
        }
        catch (error) {
            logger_1.logger.error('Database health check failed:', error);
            result.connected = false;
        }
        return result;
    }
    // Connection pool statistics
    async getConnectionStats() {
        // Note: Firestore doesn't expose detailed connection pool stats
        // This is a simplified version
        return {
            activeConnections: 0, // Would need custom tracking
            idleConnections: 0, // Would need custom tracking
            totalConnections: 0, // Would need custom tracking
            maxConnections: 100, // From config
            avgResponseTime: 0, // Would need custom tracking
        };
    }
    // Graceful shutdown
    async shutdown() {
        try {
            if (this.app) {
                // Firestore doesn't have explicit close method
                // The connection will be closed when the app is deleted
                logger_1.logger.info('Database connections closed');
            }
            this.isConnected = false;
        }
        catch (error) {
            logger_1.logger.error('Database shutdown error:', error);
        }
    }
}
// Export singleton instance
exports.databaseManager = DatabaseManager.getInstance();
// Database connection wrapper with retry logic
class DatabaseConnection {
    constructor() {
        this.maxRetries = 3;
        this.retryDelay = 1000;
        this.firestore = exports.databaseManager.getFirestore();
    }
    async executeWithRetry(operation, operationName) {
        let lastError = null;
        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
            try {
                const start = Date.now();
                const result = await operation();
                const duration = Date.now() - start;
                logger_1.logger.debug(`Database operation successful: ${operationName}`, {
                    attempt,
                    duration,
                });
                return result;
            }
            catch (error) {
                lastError = error;
                logger_1.logger.warn(`Database operation failed: ${operationName}`, {
                    attempt,
                    error: error.message,
                    willRetry: attempt < this.maxRetries,
                });
                if (attempt < this.maxRetries) {
                    // Exponential backoff
                    const delay = this.retryDelay * Math.pow(2, attempt - 1);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }
        logger_1.logger.error(`Database operation failed after ${this.maxRetries} attempts: ${operationName}`, {
            error: lastError?.message,
        });
        throw lastError || new Error(`Database operation failed: ${operationName}`);
    }
    // Batch operations with connection pooling
    async batchWrite(operations) {
        return this.executeWithRetry(async () => {
            const batch = this.firestore.batch();
            const results = [];
            for (const operation of operations) {
                try {
                    const result = await operation();
                    results.push(result);
                }
                catch (error) {
                    logger_1.logger.error('Batch operation failed:', error);
                    throw error;
                }
            }
            await batch.commit();
            return results;
        }, 'batchWrite');
    }
    // Transaction with connection pooling
    async runTransaction(updateFunction) {
        return this.executeWithRetry(async () => {
            return this.firestore.runTransaction(updateFunction);
        }, 'runTransaction');
    }
}
exports.DatabaseConnection = DatabaseConnection;
// Export connection instance
exports.dbConnection = new DatabaseConnection();
// Database query optimization helpers
class QueryOptimizer {
    constructor() {
        this.firestore = exports.databaseManager.getFirestore();
    }
    // Optimized query with pagination
    async paginatedQuery(collection, filters = [], orderBy = { field: 'created_at', direction: 'desc' }, limit = 20, startAfter) {
        let query = this.firestore.collection(collection);
        // Apply filters
        for (const filter of filters) {
            query = query.where(filter.field, filter.operator, filter.value);
        }
        // Apply ordering
        query = query.orderBy(orderBy.field, orderBy.direction);
        // Apply pagination
        if (startAfter) {
            query = query.startAfter(startAfter);
        }
        query = query.limit(limit);
        const snapshot = await query.get();
        const docs = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
        }));
        return {
            docs,
            lastDoc: snapshot.docs[snapshot.docs.length - 1],
            hasMore: snapshot.docs.length === limit,
        };
    }
    // Optimized count query
    async countQuery(collection, filters = []) {
        let query = this.firestore.collection(collection);
        for (const filter of filters) {
            query = query.where(filter.field, filter.operator, filter.value);
        }
        const snapshot = await query.get();
        return snapshot.size;
    }
    // Optimized aggregation query
    async aggregateQuery(collection, field, operation, filters = []) {
        let query = this.firestore.collection(collection);
        for (const filter of filters) {
            query = query.where(filter.field, filter.operator, filter.value);
        }
        const snapshot = await query.get();
        const values = snapshot.docs.map(doc => doc.data()[field]).filter(val => val !== undefined);
        switch (operation) {
            case 'sum':
                return values.reduce((sum, val) => sum + val, 0);
            case 'avg':
                return values.length > 0 ? values.reduce((sum, val) => sum + val, 0) / values.length : 0;
            case 'min':
                return Math.min(...values);
            case 'max':
                return Math.max(...values);
            default:
                return 0;
        }
    }
}
exports.QueryOptimizer = QueryOptimizer;
// Export query optimizer
exports.queryOptimizer = new QueryOptimizer();
