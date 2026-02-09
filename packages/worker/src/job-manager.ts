import { Queue } from "bullmq";

import {
  COLLECTION_QUEUE,
  createQueue,
} from "./queues.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CompanyInput {
  id: string;
  name: string;
  url?: string;
  industry?: string;
}

export interface JobProgress {
  total: number;
  completed: number;
  failed: number;
}

// ---------------------------------------------------------------------------
// JobManager
// ---------------------------------------------------------------------------

/**
 * High-level helper for enqueuing collection jobs and querying their progress.
 *
 * This is typically used by the API server -- it does NOT process jobs itself;
 * it only places them on the queue and reads status information.
 */
export class JobManager {
  private readonly collectionQueue: Queue;

  constructor(redisUrl: string) {
    this.collectionQueue = createQueue(COLLECTION_QUEUE, redisUrl);
  }

  /**
   * Enqueue one BullMQ job per company onto the collection queue.
   *
   * Every individual BullMQ job carries a reference to the logical `jobId` so
   * that progress can be aggregated later via {@link getJobProgress}.
   */
  async addCollectionJob(
    companies: CompanyInput[],
    jobId: string,
  ): Promise<void> {
    const jobs = companies.map((company) => ({
      name: `collect-${company.id}`,
      data: {
        companyId: company.id,
        companyName: company.name,
        companyUrl: company.url,
        industry: company.industry,
        jobId,
      },
      opts: {
        attempts: 3,
        backoff: {
          type: "exponential" as const,
          delay: 5000,
        },
        removeOnComplete: 1000,
        removeOnFail: 5000,
      },
    }));

    await this.collectionQueue.addBulk(jobs);

    console.log(
      `[job-manager] Enqueued ${companies.length} collection jobs for jobId=${jobId}`,
    );
  }

  /**
   * Retrieve the progress of a logical job (identified by `jobId`).
   *
   * This scans the queue's completed and failed sets and counts entries whose
   * data payload contains the matching `jobId`.
   */
  async getJobProgress(jobId: string): Promise<JobProgress> {
    const [completed, failed, waiting, active, delayed] = await Promise.all([
      this.collectionQueue.getCompleted(),
      this.collectionQueue.getFailed(),
      this.collectionQueue.getWaiting(),
      this.collectionQueue.getActive(),
      this.collectionQueue.getDelayed(),
    ]);

    const matchesJob = (job: { data?: { jobId?: string } }) =>
      job.data?.jobId === jobId;

    const completedCount = completed.filter(matchesJob).length;
    const failedCount = failed.filter(matchesJob).length;

    const waitingCount = waiting.filter(matchesJob).length;
    const activeCount = active.filter(matchesJob).length;
    const delayedCount = delayed.filter(matchesJob).length;

    const total =
      completedCount + failedCount + waitingCount + activeCount + delayedCount;

    return {
      total,
      completed: completedCount,
      failed: failedCount,
    };
  }

  /**
   * Gracefully close the underlying Redis connection.
   */
  async close(): Promise<void> {
    await this.collectionQueue.close();
  }
}
