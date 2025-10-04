"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initializeRedis = initializeRedis;
exports.getRedis = getRedis;
exports.isRedisConnected = isRedisConnected;
exports.setJson = setJson;
exports.getJson = getJson;
const ioredis_1 = __importDefault(require("ioredis"));
const config_1 = require("./config");
const logger_1 = require("./utils/logger");
// Redis bağlantısını optional hale getir
let redis = null;
let redisConnected = false;
// Redis bağlantısını başlat
async function initializeRedis() {
    try {
        // Redis URL kontrolü
        const redisUrl = config_1.config.redis.url;
        const redisPassword = config_1.config.redis.password;
        if (!redisUrl || redisUrl === 'redis://red-d2nf9m7diees73cjdo40:6379') {
            logger_1.logger.warn({
                redisUrl: redisUrl,
                message: 'Redis URL not configured or using default, skipping Redis connection'
            }, 'Redis connection skipped');
            return;
        }
        // Redis connection options
        const redisOptions = {
            maxRetriesPerRequest: 3,
            lazyConnect: true,
            connectTimeout: 10000,
            commandTimeout: 5000,
        };
        // Authentication ekle
        if (redisPassword) {
            redisOptions.password = redisPassword;
            logger_1.logger.info({
                host: config_1.config.redis.host,
                port: config_1.config.redis.port,
                hasPassword: !!redisPassword
            }, 'Redis connection with authentication');
        }
        else {
            logger_1.logger.info({
                host: config_1.config.redis.host,
                port: config_1.config.redis.port,
                hasPassword: false
            }, 'Redis connection without authentication');
        }
        // URL veya host/port ile bağlan
        if (redisUrl.startsWith('redis://')) {
            // Redis URL'sini parse et
            const url = new URL(redisUrl);
            const parsedOptions = {
                host: url.hostname,
                port: parseInt(url.port) || 6379,
                password: url.password || undefined,
                username: url.username || undefined,
                ...redisOptions
            };
            logger_1.logger.info({
                host: parsedOptions.host,
                port: parsedOptions.port,
                hasPassword: !!parsedOptions.password,
                hasUsername: !!parsedOptions.username
            }, 'Parsed Redis URL for connection');
            redis = new ioredis_1.default(parsedOptions);
        }
        else {
            redis = new ioredis_1.default({
                host: config_1.config.redis.host,
                port: config_1.config.redis.port,
                password: redisPassword,
                ...redisOptions
            });
        }
        redis.on('connect', () => {
            logger_1.logger.info({ message: 'Redis connected successfully' }, 'Redis connection established');
            redisConnected = true;
        });
        redis.on('error', (error) => {
            logger_1.logger.error({
                error: error.message,
                redisUrl: redisUrl,
                host: config_1.config.redis.host,
                port: config_1.config.redis.port
            }, 'Redis connection error');
            redisConnected = false;
        });
        redis.on('close', () => {
            logger_1.logger.warn({ message: 'Redis connection closed' }, 'Redis connection closed');
            redisConnected = false;
        });
        // Bağlantıyı test et
        await redis.ping();
        logger_1.logger.info({
            message: 'Redis ping successful',
            host: config_1.config.redis.host,
            port: config_1.config.redis.port
        }, 'Redis connection verified');
    }
    catch (error) {
        logger_1.logger.error({
            error: error.message,
            redisUrl: config_1.config.redis.url,
            host: config_1.config.redis.host,
            port: config_1.config.redis.port,
            hasPassword: !!config_1.config.redis.password
        }, 'Failed to initialize Redis connection');
        redis = null;
        redisConnected = false;
    }
}
// Redis instance'ını döndür
function getRedis() {
    return redis;
}
// Redis bağlantı durumunu kontrol et
function isRedisConnected() {
    return redisConnected && redis !== null;
}
async function setJson(key, value, ttlSec) {
    if (!isRedisConnected() || !redis) {
        logger_1.logger.debug({
            key,
            message: 'Redis not connected, skipping set operation'
        }, 'Redis set operation skipped');
        return;
    }
    try {
        const payload = JSON.stringify(value);
        if (ttlSec) {
            await redis.set(key, payload, 'EX', ttlSec);
        }
        else {
            await redis.set(key, payload);
        }
        logger_1.logger.debug({ key, ttlSec }, 'Redis set operation successful');
    }
    catch (error) {
        logger_1.logger.error({
            error: error.message,
            key
        }, 'Redis set operation failed');
    }
}
async function getJson(key) {
    if (!isRedisConnected() || !redis) {
        logger_1.logger.debug({
            key,
            message: 'Redis not connected, returning null'
        }, 'Redis get operation skipped');
        return null;
    }
    try {
        const raw = await redis.get(key);
        if (!raw)
            return null;
        const result = JSON.parse(raw);
        logger_1.logger.debug({ key }, 'Redis get operation successful');
        return result;
    }
    catch (error) {
        logger_1.logger.error({
            error: error.message,
            key
        }, 'Redis get operation failed');
        return null;
    }
}
