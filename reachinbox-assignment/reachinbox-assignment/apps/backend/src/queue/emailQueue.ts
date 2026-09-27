import { Queue } from 'bullmq';
import { redis } from '../lib/redis';

export const EMAIL_QUEUE = 'email-send-queue';
export const emailQueue = new Queue(EMAIL_QUEUE, { connection: redis, defaultJobOptions: {
  attempts: 5,
  backoff: { type: 'exponential', delay: 2000 },
  removeOnComplete: { age: 86400, count: 5000 },
  removeOnFail: { age: 7 * 86400 }
} });
