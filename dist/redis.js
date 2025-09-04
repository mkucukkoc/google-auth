"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.redis = void 0;
exports.setJson = setJson;
exports.getJson = getJson;
const ioredis_1 = __importDefault(require("ioredis"));
const config_1 = require("./config");
exports.redis = new ioredis_1.default(config_1.config.redisUrl);
async function setJson(key, value, ttlSec) {
    const payload = JSON.stringify(value);
    if (ttlSec) {
        await exports.redis.set(key, payload, 'EX', ttlSec);
    }
    else {
        await exports.redis.set(key, payload);
    }
}
async function getJson(key) {
    const raw = await exports.redis.get(key);
    if (!raw)
        return null;
    return JSON.parse(raw);
}
