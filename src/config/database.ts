import { initializeApp, getApps, App, cert } from 'firebase-admin/app';
import { getFirestore, Firestore, Settings } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';
import { logger } from '../utils/logger';

export interface DatabaseConfig {
  projectId: string;
  privateKey: string;
  clientEmail: string;
  storageBucket: string;
  databaseURL?: string;
  maxConnections?: number;
  maxIdleTime?: number;
  connectionTimeout?: number;
  requestTimeout?: number;
}

class DatabaseManager {
  private static instance: DatabaseManager;
  private app: App | null = null;
  private firestore: Firestore | null = null;
  private auth: any = null;
  private storage: any = null;
  private isConnected: boolean = false;

  private constructor() {}

  public static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager();
    }
    return DatabaseManager.instance;
  }

  public async initialize(config: DatabaseConfig): Promise<void> {
    try {
      // Check if app already exists
      const existingApps = getApps();
      if (existingApps.length > 0) {
        this.app = existingApps[0];
        logger.info('Using existing Firebase app');
      } else {
        // Initialize new app
        this.app = initializeApp({
          credential: cert({
            projectId: config.projectId,
            privateKey: config.privateKey.replace(/\\n/g, '\n'),
            clientEmail: config.clientEmail,
          }),
          storageBucket: config.storageBucket,
          databaseURL: config.databaseURL,
        });
        logger.info('Firebase app initialized');
      }

      // Initialize Firestore with connection pooling settings
      const firestoreSettings: Settings = {
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

      this.firestore = getFirestore(this.app);
      this.firestore.settings(firestoreSettings);

      // Initialize other services
      this.auth = getAuth(this.app);
      this.storage = getStorage(this.app);

      this.isConnected = true;
      logger.info('Database services initialized successfully');

      // Test connection
      await this.testConnection();

    } catch (error) {
      logger.error('Database initialization failed:', error);
      this.isConnected = false;
      throw error;
    }
  }

  public getFirestore(): Firestore {
    if (!this.firestore) {
      throw new Error('Firestore not initialized');
    }
    return this.firestore;
  }

  public getAuth(): any {
    if (!this.auth) {
      throw new Error('Auth not initialized');
    }
    return this.auth;
  }

  public getStorage(): any {
    if (!this.storage) {
      throw new Error('Storage not initialized');
    }
    return this.storage;
  }

  public isDatabaseConnected(): boolean {
    return this.isConnected;
  }

  private async testConnection(): Promise<void> {
    try {
      if (!this.firestore) {
        throw new Error('Firestore not initialized');
      }

      // Test Firestore connection
      const testDoc = this.firestore.collection('_test').doc('connection');
      await testDoc.set({ test: true, timestamp: new Date() });
      await testDoc.delete();

      logger.info('Database connection test successful');
    } catch (error) {
      logger.error('Database connection test failed:', error);
      this.isConnected = false;
      throw error;
    }
  }

  // Connection health check
  public async healthCheck(): Promise<{
    connected: boolean;
    firestore: boolean;
    auth: boolean;
    storage: boolean;
    latency?: number;
  }> {
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

    } catch (error) {
      logger.error('Database health check failed:', error);
      result.connected = false;
    }

    return result;
  }

  // Connection pool statistics
  public async getConnectionStats(): Promise<{
    activeConnections: number;
    idleConnections: number;
    totalConnections: number;
    maxConnections: number;
    avgResponseTime: number;
  }> {
    // Note: Firestore doesn't expose detailed connection pool stats
    // This is a simplified version
    return {
      activeConnections: 0, // Would need custom tracking
      idleConnections: 0,   // Would need custom tracking
      totalConnections: 0,  // Would need custom tracking
      maxConnections: 100,  // From config
      avgResponseTime: 0,   // Would need custom tracking
    };
  }

  // Graceful shutdown
  public async shutdown(): Promise<void> {
    try {
      if (this.app) {
        // Firestore doesn't have explicit close method
        // The connection will be closed when the app is deleted
        logger.info('Database connections closed');
      }
      this.isConnected = false;
    } catch (error) {
      logger.error('Database shutdown error:', error);
    }
  }
}

// Export singleton instance
export const databaseManager = DatabaseManager.getInstance();

// Database connection wrapper with retry logic
export class DatabaseConnection {
  private firestore: Firestore | null = null;
  private maxRetries: number = 3;
  private retryDelay: number = 1000;

  constructor() {
    // Firestore will be initialized when needed
  }

  private getFirestore(): Firestore {
    if (!this.firestore) {
      this.firestore = databaseManager.getFirestore();
    }
    return this.firestore!;
  }

  async executeWithRetry<T>(
    operation: () => Promise<T>,
    operationName: string
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const start = Date.now();
        const result = await operation();
        const duration = Date.now() - start;

        logger.debug(`Database operation successful: ${operationName}`, {
          attempt,
          duration,
        });

        return result;
      } catch (error) {
        lastError = error as Error;
        
        logger.warn(`Database operation failed: ${operationName}`, {
          attempt,
          error: error instanceof Error ? error.message : String(error),
          willRetry: attempt < this.maxRetries,
        });

        if (attempt < this.maxRetries) {
          // Exponential backoff
          const delay = this.retryDelay * Math.pow(2, attempt - 1);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    logger.error(`Database operation failed after ${this.maxRetries} attempts: ${operationName}`, {
      error: lastError?.message,
    });

    throw lastError || new Error(`Database operation failed: ${operationName}`);
  }

  // Batch operations with connection pooling
  async batchWrite(operations: Array<() => Promise<any>>): Promise<any[]> {
    return this.executeWithRetry(async () => {
      const batch = this.getFirestore().batch();
      const results: any[] = [];

      for (const operation of operations) {
        try {
          const result = await operation();
          results.push(result);
        } catch (error) {
          logger.error('Batch operation failed:', error);
          throw error;
        }
      }

      await batch.commit();
      return results;
    }, 'batchWrite');
  }

  // Transaction with connection pooling
  async runTransaction<T>(
    updateFunction: (transaction: any) => Promise<T>
  ): Promise<T> {
    return this.executeWithRetry(async () => {
      return this.getFirestore().runTransaction(updateFunction);
    }, 'runTransaction');
  }
}

// Export connection instance
export const dbConnection = new DatabaseConnection();

// Database query optimization helpers
export class QueryOptimizer {
  private firestore: Firestore | null = null;

  constructor() {
    // Firestore will be initialized when needed
  }

  private getFirestore(): Firestore {
    if (!this.firestore) {
      this.firestore = databaseManager.getFirestore();
    }
    return this.firestore;
  }

  // Optimized query with pagination
  async paginatedQuery(
    collection: string,
    filters: any[] = [],
    orderBy: { field: string; direction: 'asc' | 'desc' } = { field: 'created_at', direction: 'desc' },
    limit: number = 20,
    startAfter?: any
  ) {
    let query: any = this.getFirestore().collection(collection);

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
    const docs = snapshot.docs.map((doc: any) => ({
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
  async countQuery(collection: string, filters: any[] = []): Promise<number> {
    let query: any = this.getFirestore().collection(collection);

    for (const filter of filters) {
      query = query.where(filter.field, filter.operator, filter.value);
    }

    const snapshot = await query.get();
    return snapshot.size;
  }

  // Optimized aggregation query
  async aggregateQuery(
    collection: string,
    field: string,
    operation: 'sum' | 'avg' | 'min' | 'max',
    filters: any[] = []
  ): Promise<number> {
    let query: any = this.getFirestore().collection(collection);

    for (const filter of filters) {
      query = query.where(filter.field, filter.operator, filter.value);
    }

    const snapshot = await query.get();
    const values = snapshot.docs.map((doc: any) => doc.data()[field]).filter((val: any) => val !== undefined);

    switch (operation) {
      case 'sum':
        return values.reduce((sum: any, val: any) => sum + val, 0);
      case 'avg':
        return values.length > 0 ? values.reduce((sum: any, val: any) => sum + val, 0) / values.length : 0;
      case 'min':
        return Math.min(...values);
      case 'max':
        return Math.max(...values);
      default:
        return 0;
    }
  }
}

// Export query optimizer
export const queryOptimizer = new QueryOptimizer();

