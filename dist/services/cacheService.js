"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CacheKeys = exports.cacheService = void 0;
exports.Cache = Cache;
const ioredis_1 = __importDefault(require("ioredis"));
const logger_1 = require("../utils/logger");
class CacheService {
    constructor() {
        this.isConnected = false;
        const config = {
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT || '6379'),
            password: process.env.REDIS_PASSWORD,
            db: parseInt(process.env.REDIS_DB || '0'),
            retryDelayOnFailover: 100,
            maxRetriesPerRequest: 3,
            lazyConnect: true,
        };
        this.redis = new ioredis_1.default(config);
        this.redis.on('connect', () => {
            this.isConnected = true;
            logger_1.logger.info('Redis connected successfully');
        });
        this.redis.on('error', (error) => {
            this.isConnected = false;
            logger_1.logger.error('Redis connection error:', error);
        });
        this.redis.on('close', () => {
            this.isConnected = false;
            logger_1.logger.warn('Redis connection closed');
        });
    }
    // Basic cache operations
    async set(key, value, ttlSeconds) {
        try {
            if (!this.isConnected) {
                logger_1.logger.warn('Redis not connected, skipping cache set');
                return false;
            }
            const serializedValue = JSON.stringify(value);
            if (ttlSeconds) {
                await this.redis.setex(key, ttlSeconds, serializedValue);
            }
            else {
                await this.redis.set(key, serializedValue);
            }
            logger_1.logger.debug(`Cache set: ${key}`, { ttl: ttlSeconds });
            return true;
        }
        catch (error) {
            logger_1.logger.error('Cache set error:', { key, error });
            return false;
        }
    }
    async get(key) {
        try {
            if (!this.isConnected) {
                logger_1.logger.warn('Redis not connected, skipping cache get');
                return null;
            }
            const value = await this.redis.get(key);
            if (!value) {
                return null;
            }
            const parsedValue = JSON.parse(value);
            logger_1.logger.debug(`Cache hit: ${key}`);
            return parsedValue;
        }
        catch (error) {
            logger_1.logger.error('Cache get error:', { key, error });
            return null;
        }
    }
    async del(key) {
        try {
            if (!this.isConnected) {
                logger_1.logger.warn('Redis not connected, skipping cache delete');
                return false;
            }
            const result = await this.redis.del(key);
            logger_1.logger.debug(`Cache delete: ${key}`, { deleted: result > 0 });
            return result > 0;
        }
        catch (error) {
            logger_1.logger.error('Cache delete error:', { key, error });
            return false;
        }
    }
    async exists(key) {
        try {
            if (!this.isConnected) {
                return false;
            }
            const result = await this.redis.exists(key);
            return result === 1;
        }
        catch (error) {
            logger_1.logger.error('Cache exists error:', { key, error });
            return false;
        }
    }
    // Advanced cache operations
    async mget(keys) {
        try {
            if (!this.isConnected) {
                return keys.map(() => null);
            }
            const values = await this.redis.mget(...keys);
            return values.map(value => value ? JSON.parse(value) : null);
        }
        catch (error) {
            logger_1.logger.error('Cache mget error:', { keys, error });
            return keys.map(() => null);
        }
    }
    async mset(keyValuePairs, ttlSeconds) {
        try {
            if (!this.isConnected) {
                return false;
            }
            const pipeline = this.redis.pipeline();
            for (const [key, value] of Object.entries(keyValuePairs)) {
                const serializedValue = JSON.stringify(value);
                if (ttlSeconds) {
                    pipeline.setex(key, ttlSeconds, serializedValue);
                }
                else {
                    pipeline.set(key, serializedValue);
                }
            }
            await pipeline.exec();
            logger_1.logger.debug(`Cache mset: ${Object.keys(keyValuePairs).length} keys`);
            return true;
        }
        catch (error) {
            logger_1.logger.error('Cache mset error:', { error });
            return false;
        }
    }
    // Pattern-based operations
    async keys(pattern) {
        try {
            if (!this.isConnected) {
                return [];
            }
            const keys = await this.redis.keys(pattern);
            return keys;
        }
        catch (error) {
            logger_1.logger.error('Cache keys error:', { pattern, error });
            return [];
        }
    }
    async delPattern(pattern) {
        try {
            if (!this.isConnected) {
                return 0;
            }
            const keys = await this.redis.keys(pattern);
            if (keys.length === 0) {
                return 0;
            }
            const result = await this.redis.del(...keys);
            logger_1.logger.debug(`Cache delPattern: ${pattern}`, { deleted: result });
            return result;
        }
        catch (error) {
            logger_1.logger.error('Cache delPattern error:', { pattern, error });
            return 0;
        }
    }
    // Cache with fallback function
    async getOrSet(key, fallbackFn, ttlSeconds = 300) {
        try {
            // Try to get from cache first
            const cached = await this.get(key);
            if (cached !== null) {
                return cached;
            }
            // Cache miss, execute fallback function
            logger_1.logger.debug(`Cache miss, executing fallback: ${key}`);
            const result = await fallbackFn();
            // Store in cache
            await this.set(key, result, ttlSeconds);
            return result;
        }
        catch (error) {
            logger_1.logger.error('Cache getOrSet error:', { key, error });
            // If cache fails, still try to execute fallback
            return await fallbackFn();
        }
    }
    // Cache invalidation helpers
    async invalidateUserCache(userId) {
        const patterns = [
            `user:${userId}:*`,
            `auth:${userId}:*`,
            `session:${userId}:*`,
        ];
        for (const pattern of patterns) {
            await this.delPattern(pattern);
        }
        logger_1.logger.info(`User cache invalidated: ${userId}`);
    }
    async invalidateAuthCache(userId) {
        const patterns = [
            `auth:${userId}:*`,
            `session:${userId}:*`,
            `token:${userId}:*`,
        ];
        for (const pattern of patterns) {
            await this.delPattern(pattern);
        }
        logger_1.logger.info(`Auth cache invalidated: ${userId}`);
    }
    // Health check
    async ping() {
        try {
            const result = await this.redis.ping();
            return result === 'PONG';
        }
        catch (error) {
            logger_1.logger.error('Redis ping failed:', error);
            return false;
        }
    }
    // Get cache statistics
    async getStats() {
        try {
            if (!this.isConnected) {
                return { connected: false, memory: null, info: null };
            }
            const memory = await this.redis.memory('STATS');
            const info = await this.redis.info();
            return {
                connected: this.isConnected,
                memory,
                info: this.parseRedisInfo(info),
            };
        }
        catch (error) {
            logger_1.logger.error('Redis stats error:', error);
            return { connected: false, memory: null, info: null };
        }
    }
    parseRedisInfo(info) {
        const lines = info.split('\r\n');
        const result = {};
        for (const line of lines) {
            if (line.includes(':')) {
                const [key, value] = line.split(':');
                result[key] = value;
            }
        }
        return result;
    }
    // Close connection
    async close() {
        try {
            await this.redis.quit();
            logger_1.logger.info('Redis connection closed');
        }
        catch (error) {
            logger_1.logger.error('Redis close error:', error);
        }
    }
}
// Export singleton instance
exports.cacheService = new CacheService();
// Cache decorator for methods
function Cache(ttlSeconds = 300, keyGenerator) {
    return function (target, propertyName, descriptor) {
        const method = descriptor.value;
        descriptor.value = async function (...args) {
            const cacheKey = keyGenerator ? keyGenerator(...args) : `${target.constructor.name}:${propertyName}:${JSON.stringify(args)}`;
            try {
                // Try to get from cache
                const cached = await exports.cacheService.get(cacheKey);
                if (cached !== null) {
                    logger_1.logger.debug(`Cache hit for method: ${propertyName}`);
                    return cached;
                }
                // Execute method and cache result
                const result = await method.apply(this, args);
                await exports.cacheService.set(cacheKey, result, ttlSeconds);
                logger_1.logger.debug(`Cache set for method: ${propertyName}`);
                return result;
            }
            catch (error) {
                logger_1.logger.error(`Cache decorator error for ${propertyName}:`, error);
                // If cache fails, still execute method
                return await method.apply(this, args);
            }
        };
    };
}
// Cache key generators
exports.CacheKeys = {
    user: (userId) => `user:${userId}`,
    userProfile: (userId) => `user:${userId}:profile`,
    userSessions: (userId) => `user:${userId}:sessions`,
    authToken: (token) => `auth:token:${token}`,
    session: (sessionId) => `session:${sessionId}`,
    rateLimit: (ip, endpoint) => `rate:${ip}:${endpoint}`,
    apiResponse: (endpoint, params) => `api:${endpoint}:${params}`,
};
