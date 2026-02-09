import { Queue } from "bullmq";
import IORedis from "ioredis";

// ---------------------------------------------------------------------------
// Queue name constants
// ---------------------------------------------------------------------------

export const COLLECTION_QUEUE = "collection";
export const EMAIL_QUEUE = "email-verification";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create a BullMQ queue backed by the given Redis URL.
 */
export function createQueue(name: string, redisUrl: string): Queue {
  const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  return new Queue(name, { connection });
}

/**
 * Create an IORedis connection suitable for BullMQ workers.
 *
 * BullMQ workers require `maxRetriesPerRequest` to be `null` so that blocking
 * commands (BRPOPLPUSH etc.) never time-out on the Redis side.
 */
export function createWorkerConnection(redisUrl: string): IORedis {
  return new IORedis(redisUrl, { maxRetriesPerRequest: null });
}
