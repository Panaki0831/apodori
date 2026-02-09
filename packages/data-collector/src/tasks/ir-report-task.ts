import type { TaskResult } from "@sales-ai/core";
import { searchGoogle, fetchPageSimple } from "@sales-ai/scraper";
import { analyzeCompany } from "@sales-ai/ai-engine";
import type { CollectionTask, TaskContext } from "./base-task.js";
import { truncateText } from "@sales-ai/core";

/**
 * Task #6: IR / Securities report lookup.
 *
 * For listed companies, searches for EDINET filings or the company IR page.
 * Fetches the top result and uses the AI engine to extract key financial
 * data such as revenue, profit, and executive information.
 */
export class IrReportTask implements CollectionTask {
  readonly type = "ir_report" as const;

  async execute(ctx: TaskContext): Promise<TaskResult> {
    try {
      // Search for securities reports and IR pages
      const query = `"${ctx.companyName}" 有価証券報告書 OR IR OR 決算`;
      const searchResults = await searchGoogle(query, 5);

      if (searchResults.length === 0) {
        return {
          taskType: this.type,
          success: true,
          data: null,
        };
      }

      // Fetch the top IR-related pages
      const pagesToFetch = searchResults.slice(0, 3);
      const fetchResults = await Promise.allSettled(
        pagesToFetch.map((r) => fetchPageSimple(r.url)),
      );

      const textParts: string[] = [];

      for (const result of fetchResults) {
        if (result.status === "fulfilled") {
          // Truncate each page to avoid exceeding LLM context limits
          textParts.push(truncateText(result.value.text, 5000));
        }
      }

      if (textParts.length === 0) {
        return {
          taskType: this.type,
          success: true,
          data: {
            searchResults,
          },
        };
      }

      // Use the AI engine to extract financial data from the combined text
      const combinedText = [
        `企業名: ${ctx.companyName}`,
        ctx.industry ? `業種: ${ctx.industry}` : "",
        "",
        "以下はIR・有価証券報告書から取得した情報です:",
        "",
        ...textParts,
      ]
        .filter(Boolean)
        .join("\n");

      const analysis = await analyzeCompany(ctx.llm, combinedText);

      return {
        taskType: this.type,
        success: true,
        data: {
          revenue: analysis.revenue,
          profit: analysis.profit,
          growthRate: analysis.growthRate,
          searchResults,
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
