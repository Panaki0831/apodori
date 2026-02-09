import { Worker, Job } from "bullmq";
import { loadConfig } from "@sales-ai/core";
import { LlmClient } from "@sales-ai/ai-engine";
import { CollectionPipeline } from "@sales-ai/data-collector";

import { COLLECTION_QUEUE, createWorkerConnection } from "./queues.js";
import { ResultStore } from "./result-store.js";

// ---------------------------------------------------------------------------
// Job payload
// ---------------------------------------------------------------------------

export interface CollectionJobData {
  companyId: string;
  companyName: string;
  companyUrl?: string;
  industry?: string;
  jobId: string;
}

// ---------------------------------------------------------------------------
// Worker factory
// ---------------------------------------------------------------------------

/**
 * Create a BullMQ worker that processes collection jobs.
 *
 * The worker is created with `autorun: false` so the caller can decide when to
 * start it (e.g. after all signal handlers are wired up).
 *
 * Concurrency is set to 5 -- up to five jobs will be processed in parallel
 * within a single worker instance.
 */
export function createCollectionWorker(redisUrl: string): Worker {
  const connection = createWorkerConnection(redisUrl);
  const config = loadConfig();
  const resultStore = new ResultStore(redisUrl);

  const worker = new Worker<CollectionJobData>(
    COLLECTION_QUEUE,
    async (job: Job<CollectionJobData>) => {
      const { companyId, companyName, companyUrl, industry, jobId } = job.data;

      console.log(
        `[collection-worker] Starting job ${job.id} | jobId=${jobId} | company="${companyName}" (${companyId})`,
      );

      try {
        // Initialize the LLM client with configured API keys.
        const llmClient = new LlmClient({
          claudeApiKey: config.claude.apiKey,
          openaiApiKey: config.openai.apiKey,
          timeoutMs: config.llm.timeout,
        });

        // Create and execute the data-collection pipeline.
        const pipeline = new CollectionPipeline(llmClient, config);

        const result = await pipeline.executeForCompany(
          companyName,
          companyUrl,
          industry,
        );

        // Store the result in Redis so the API server can read it.
        await resultStore.saveCompanyResult(
          companyId,
          jobId,
          result as unknown as Record<string, unknown>,
        );

        console.log(
          `[collection-worker] Completed job ${job.id} | jobId=${jobId} | company="${companyName}" — result saved to Redis`,
        );

        return result;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        console.error(
          `[collection-worker] Failed job ${job.id} | jobId=${jobId} | company="${companyName}" | error: ${message}`,
        );
        throw error;
      }
    },
    {
      connection,
      concurrency: 5,
      autorun: false,
    },
  );

  // Surface worker-level errors so they don't go unnoticed.
  worker.on("error", (err) => {
    console.error("[collection-worker] Worker error:", err);
  });

  return worker;
}
