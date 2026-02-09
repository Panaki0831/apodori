import type { TaskResult, SearchResult } from "@sales-ai/core";
import { searchGoogle } from "@sales-ai/scraper";
import type { CollectionTask, TaskContext } from "./base-task.js";

/**
 * Task #1: Search Google for the company URL and basic information.
 *
 * Searches for the company name, extracts the official URL from results,
 * and returns the full set of search results for downstream tasks to use.
 */
export class GoogleSearchTask implements CollectionTask {
  readonly type = "google_search" as const;

  async execute(ctx: TaskContext): Promise<TaskResult> {
    try {
      // Primary search: company name to find official site
      const query = ctx.companyUrl
        ? `${ctx.companyName} ${ctx.companyUrl}`
        : ctx.companyName;

      const results: SearchResult[] = await searchGoogle(query, 10);

      // Try to identify the official company URL from search results
      let officialUrl: string | undefined = ctx.companyUrl;

      if (!officialUrl && results.length > 0) {
        // The first result is often the official site
        officialUrl = results[0].url;
      }

      return {
        taskType: this.type,
        success: true,
        data: {
          officialUrl,
          searchResults: results,
        },
      };
    } catch (error) {
      return {
        taskType: this.type,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
