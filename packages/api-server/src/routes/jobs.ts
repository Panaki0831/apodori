import { Hono } from "hono";
import { randomUUID } from "node:crypto";
import { loadConfig } from "@sales-ai/core";
import type { ApiResponse, CsvRow, JobStatus } from "@sales-ai/core";
import { JobManager } from "@sales-ai/worker";
import { parseCSV } from "../csv-parser.js";

// ============================================================
// Initialize JobManager (connects to Redis / BullMQ)
// ============================================================

const config = loadConfig();
const jobManager = new JobManager(config.redis.url);

// ============================================================
// In-memory job metadata store (MVP)
// ============================================================

interface StoredJob {
  id: string;
  status: JobStatus;
  totalCount: number;
  doneCount: number;
  failedCount: number;
  companies: Array<{
    id: string;
    company_name: string;
    company_url?: string;
    industry?: string;
  }>;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}

/** In-memory job store keyed by job ID */
const jobStore = new Map<string, StoredJob>();

// ============================================================
// Helper: create a job and enqueue to BullMQ
// ============================================================

interface CompanyInput {
  company_name: string;
  company_url?: string;
  industry?: string;
}

async function createJobFromCompanies(
  companies: CompanyInput[],
): Promise<StoredJob> {
  const jobId = randomUUID();
  const companyRecords = companies.map((c) => ({
    id: randomUUID(),
    company_name: c.company_name,
    company_url: c.company_url,
    industry: c.industry,
  }));

  const job: StoredJob = {
    id: jobId,
    status: "running",
    totalCount: companyRecords.length,
    doneCount: 0,
    failedCount: 0,
    companies: companyRecords,
    createdAt: new Date(),
    startedAt: new Date(),
  };

  jobStore.set(jobId, job);

  // Enqueue collection tasks to BullMQ
  await jobManager.addCollectionJob(
    companyRecords.map((c) => ({
      id: c.id,
      name: c.company_name,
      url: c.company_url,
      industry: c.industry,
    })),
    jobId,
  );

  return job;
}

/**
 * Convert a StoredJob to the flat shape expected by the frontend Job type.
 * Fetches real-time progress from BullMQ.
 */
async function toFrontendJob(job: StoredJob) {
  // Get real-time progress from BullMQ
  let doneCount = job.doneCount;
  let failedCount = job.failedCount;
  let status = job.status;

  try {
    const progress = await jobManager.getJobProgress(job.id);
    doneCount = progress.completed;
    failedCount = progress.failed;

    // Update status based on progress
    if (doneCount + failedCount >= job.totalCount && job.totalCount > 0) {
      status = failedCount === job.totalCount ? "failed" : "completed";
      job.completedAt = job.completedAt ?? new Date();
    } else if (doneCount + failedCount > 0) {
      status = "running";
    }

    // Persist progress back to in-memory store
    job.doneCount = doneCount;
    job.failedCount = failedCount;
    job.status = status;
  } catch {
    // If BullMQ query fails, use stored values
  }

  return {
    id: job.id,
    status,
    totalCompanies: job.totalCount,
    completedCompanies: doneCount,
    failedCompanies: failedCount,
    createdAt: job.createdAt.toISOString(),
    updatedAt: (
      job.completedAt ??
      job.startedAt ??
      job.createdAt
    ).toISOString(),
    companies: job.companies.map((c) => ({
      id: c.id,
      name: c.company_name,
      url: c.company_url,
      tasksCompleted: 0,
      tasksFailed: 0,
      tasksTotal: 11,
    })),
  };
}

// ============================================================
// Routes
// ============================================================

const jobs = new Hono();

/**
 * POST /api/jobs - Create a new collection job from a JSON body
 */
jobs.post("/api/jobs", async (c) => {
  try {
    const body = await c.req.json<{ companies?: CompanyInput[] }>();

    if (
      !body.companies ||
      !Array.isArray(body.companies) ||
      body.companies.length === 0
    ) {
      const errorResp: ApiResponse<never> = {
        success: false,
        error: "Request body must include a non-empty 'companies' array.",
      };
      return c.json(errorResp, 400);
    }

    for (const company of body.companies) {
      if (!company.company_name || typeof company.company_name !== "string") {
        const errorResp: ApiResponse<never> = {
          success: false,
          error:
            "Each company must have a non-empty 'company_name' string.",
        };
        return c.json(errorResp, 400);
      }
    }

    const job = await createJobFromCompanies(body.companies);

    const resp: ApiResponse<{
      jobId: string;
      totalCount: number;
      status: JobStatus;
    }> = {
      success: true,
      data: {
        jobId: job.id,
        totalCount: job.totalCount,
        status: job.status,
      },
    };

    return c.json(resp, 201);
  } catch (err) {
    const errorResp: ApiResponse<never> = {
      success: false,
      error:
        err instanceof Error ? err.message : "Unknown error creating job",
    };
    return c.json(errorResp, 500);
  }
});

/**
 * POST /api/jobs/csv - Create a job from a CSV file upload
 */
jobs.post("/api/jobs/csv", async (c) => {
  try {
    const formData = await c.req.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      const errorResp: ApiResponse<never> = {
        success: false,
        error: "A 'file' field with a CSV file is required.",
      };
      return c.json(errorResp, 400);
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const parsedRows: CsvRow[] = await parseCSV(buffer);

    if (parsedRows.length === 0) {
      const errorResp: ApiResponse<never> = {
        success: false,
        error: "No valid company rows found in the uploaded CSV.",
      };
      return c.json(errorResp, 400);
    }

    const companies: CompanyInput[] = parsedRows.map((row) => ({
      company_name: row.company_name,
      company_url: row.company_url || undefined,
      industry: row.industry || undefined,
    }));

    const job = await createJobFromCompanies(companies);

    const resp: ApiResponse<{
      jobId: string;
      totalCount: number;
      parsedCompanies: number;
      status: JobStatus;
    }> = {
      success: true,
      data: {
        jobId: job.id,
        totalCount: job.totalCount,
        parsedCompanies: parsedRows.length,
        status: job.status,
      },
    };

    return c.json(resp, 201);
  } catch (err) {
    const errorResp: ApiResponse<never> = {
      success: false,
      error:
        err instanceof Error
          ? err.message
          : "Unknown error processing CSV",
    };
    return c.json(errorResp, 500);
  }
});

/**
 * GET /api/jobs/:jobId - Get job status and progress
 */
jobs.get("/api/jobs/:jobId", async (c) => {
  const jobId = c.req.param("jobId");
  const job = jobStore.get(jobId);

  if (!job) {
    const errorResp: ApiResponse<never> = {
      success: false,
      error: `Job not found: ${jobId}`,
    };
    return c.json(errorResp, 404);
  }

  const resp: ApiResponse<Awaited<ReturnType<typeof toFrontendJob>>> = {
    success: true,
    data: await toFrontendJob(job),
  };

  return c.json(resp);
});

/**
 * GET /api/jobs - List all jobs
 */
jobs.get("/api/jobs", async (c) => {
  const allJobs = Array.from(jobStore.values()).sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  );

  const frontendJobs = await Promise.all(allJobs.map(toFrontendJob));

  const resp: ApiResponse<Awaited<ReturnType<typeof toFrontendJob>>[]> = {
    success: true,
    data: frontendJobs,
  };

  return c.json(resp);
});

export default jobs;
