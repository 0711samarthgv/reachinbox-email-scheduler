import IORedis from 'ioredis';
import { env } from '../config/env';

export const redis = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null, enableReadyCheck: true });
redis.on('error', (err) => console.error('Redis error', err));

export async function connectRedis() {
  if (redis.status === 'wait' || redis.status === 'end') await redis.connect();
}
