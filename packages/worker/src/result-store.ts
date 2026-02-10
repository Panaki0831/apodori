import IORedis from "ioredis";

const RESULT_PREFIX = "company-result:";
const COMPANY_INDEX_KEY = "company-ids";

/**
 * Simple Redis-backed store for collection pipeline results.
 * The worker writes results here; the API server reads them.
 */
export class ResultStore {
  private readonly redis: IORedis;

  constructor(redisUrl: string) {
    this.redis = new IORedis(redisUrl, {
      maxRetriesPerRequest: null,
      connectTimeout: 5000,
      retryStrategy(times) {
        if (times > 3) return null; // stop retrying
        return Math.min(times * 500, 2000);
      },
    });
    this.redis.on("error", (err) => {
      console.error("[result-store] Redis error:", err.message);
    });
  }

  /** Store a company result (called by the worker after processing) */
  async saveCompanyResult(
    companyId: string,
    jobId: string,
    result: Record<string, unknown>,
  ): Promise<void> {
    const data = JSON.stringify({
      ...result,
      _companyId: companyId,
      _jobId: jobId,
      _savedAt: new Date().toISOString(),
    });
    await this.redis.set(`${RESULT_PREFIX}${companyId}`, data);
    await this.redis.sadd(COMPANY_INDEX_KEY, companyId);
  }

  /** Get a single company result */
  async getCompanyResult(
    companyId: string,
  ): Promise<Record<string, unknown> | null> {
    const data = await this.redis.get(`${RESULT_PREFIX}${companyId}`);
    if (!data) return null;
    return JSON.parse(data);
  }

  /** Get all company results */
  async getAllCompanyResults(): Promise<Record<string, unknown>[]> {
    const ids = await this.redis.smembers(COMPANY_INDEX_KEY);
    if (ids.length === 0) return [];
    const pipeline = this.redis.pipeline();
    for (const id of ids) {
      pipeline.get(`${RESULT_PREFIX}${id}`);
    }
    const results = await pipeline.exec();
    if (!results) return [];
    return results
      .map(([err, data]) =>
        err || !data ? null : JSON.parse(data as string),
      )
      .filter(Boolean) as Record<string, unknown>[];
  }

  async close(): Promise<void> {
    await this.redis.quit();
  }
}
