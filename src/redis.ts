import Redis from 'ioredis';
import { config } from './config';

export const redis = new Redis(config.redisUrl);

export async function setJson(key: string, value: unknown, ttlSec?: number): Promise<void> {
  const payload = JSON.stringify(value);
  if (ttlSec) {
    await redis.set(key, payload, 'EX', ttlSec);
  } else {
    await redis.set(key, payload);
  }
}

export async function getJson<T = unknown>(key: string): Promise<T | null> {
  const raw = await redis.get(key);
  if (!raw) return null;
  return JSON.parse(raw) as T;
}



