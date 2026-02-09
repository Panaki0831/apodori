import "dotenv/config";

import { loadConfig } from "@sales-ai/core";

import { createCollectionWorker } from "./collection-worker.js";

// ---------------------------------------------------------------------------
// Re-exports (consumed by other packages, e.g. the API server)
// ---------------------------------------------------------------------------

export {
  COLLECTION_QUEUE,
  EMAIL_QUEUE,
  createQueue,
  createWorkerConnection,
} from "./queues.js";

export { createCollectionWorker } from "./collection-worker.js";
export type { CollectionJobData } from "./collection-worker.js";

export { JobManager } from "./job-manager.js";
export type { CompanyInput, JobProgress } from "./job-manager.js";

export { ResultStore } from "./result-store.js";

// ---------------------------------------------------------------------------
// Main entry point -- only runs when this file is executed directly
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const config = loadConfig();
  const redisUrl = config.redis.url;

  console.log("[worker] Starting collection worker...");
  console.log(`[worker] Redis URL: ${redisUrl}`);

  const worker = createCollectionWorker(redisUrl);

  // -----------------------------------------------------------------------
  // Graceful shutdown
  // -----------------------------------------------------------------------

  const shutdown = async (signal: string) => {
    console.log(`[worker] Received ${signal}. Shutting down gracefully...`);
    try {
      await worker.close();
      console.log("[worker] Worker closed. Exiting.");
    } catch (err) {
      console.error("[worker] Error during shutdown:", err);
    }
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  // Start processing
  worker.run();

  console.log("[worker] Collection worker is running. Waiting for jobs...");
}

// Run main when executed as a script (not when imported as a module).
const isDirectRun =
  require.main === module ||
  process.argv[1]?.endsWith("/worker/dist/index.js") ||
  process.argv[1]?.endsWith("/worker/src/index.ts");

if (isDirectRun) {
  main().catch((err) => {
    console.error("[worker] Fatal error:", err);
    process.exit(1);
  });
}
