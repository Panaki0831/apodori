import type { TaskResult, ExecutiveInfo } from "@sales-ai/core";
import { searchGoogle, fetchPageSimple } from "@sales-ai/scraper";
import { extractContacts } from "@sales-ai/ai-engine";
import type { CollectionTask, TaskContext } from "./base-task.js";

/**
 * Task: Search Google for executive / key-person pages.
 *
 * When the corporate site crawl fails to find executives, this task
 * uses targeted Google searches to discover leadership information
 * from external sources (news, press releases, corporate governance
 * reports, etc.).
 */
export class ExecutiveSearchTask implements CollectionTask {
  readonly type = "executive_search" as const;

  async execute(ctx: TaskContext): Promise<TaskResult> {
    try {
      // Run targeted Google searches for executives
      const queries = [
        `"${ctx.companyName}" 代表取締役 OR 取締役 OR 役員`,
        `"${ctx.companyName}" CTO OR CEO OR CFO OR 社長`,
      ];

      const allTexts: string[] = [];

      for (const query of queries) {
        try {
          const results = await searchGoogle(query, 5);
          // Fetch the top 2 results from each query
          const toFetch = results.slice(0, 2);
          const fetched = await Promise.allSettled(
            toFetch.map((r) => fetchPageSimple(r.url)),
          );
          for (const result of fetched) {
            if (result.status === "fulfilled") {
              // Limit text per page to avoid overwhelming the LLM
              allTexts.push(result.value.text.slice(0, 3000));
            }
          }
        } catch {
          // Google search or fetch failed — continue to next query
        }
      }

      if (allTexts.length === 0) {
        return {
          taskType: this.type,
          success: true,
          data: { executives: [] },
        };
      }

      // Use Claude to extract key persons from the combined text
      const combinedText = allTexts.join("\n\n---\n\n");
      const contacts = await extractContacts(
        ctx.llm,
        combinedText,
        ctx.companyName,
      );

      // Convert ContactInfo to ExecutiveInfo
      const executives: ExecutiveInfo[] = contacts.map((c) => ({
        name: c.personName,
        title: c.jobTitle ?? "",
        department: c.department,
      }));

      return {
        taskType: this.type,
        success: true,
        data: { executives },
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
