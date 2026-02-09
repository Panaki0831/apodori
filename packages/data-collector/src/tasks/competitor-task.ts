import type { TaskResult, CompetitorInfo } from "@sales-ai/core";
import { analyzeCompany } from "@sales-ai/ai-engine";
import type { CollectionTask, TaskContext } from "./base-task.js";

/**
 * Task #10: Competitor analysis.
 *
 * Uses the LLM to analyze collected company information and identify
 * competitors, their differentiators, and the company's competitive
 * positioning within its industry.
 */
export class CompetitorTask implements CollectionTask {
  readonly type = "competitor_analysis" as const;

  private collectedInfo: string;

  /**
   * @param collectedInfo - Aggregated company information from earlier tasks,
   *   serialized as a string for the LLM to analyze.
   */
  constructor(collectedInfo: string = "") {
    this.collectedInfo = collectedInfo;
  }

  /**
   * Update the collected information before execution.
   * This allows the pipeline to inject data from earlier tasks.
   */
  setCollectedInfo(info: string): void {
    this.collectedInfo = info;
  }

  async execute(ctx: TaskContext): Promise<TaskResult> {
    try {
      const prompt = [
        `企業名: ${ctx.companyName}`,
        ctx.companyUrl ? `URL: ${ctx.companyUrl}` : "",
        ctx.industry ? `業種: ${ctx.industry}` : "",
        "",
        "以下は収集した企業情報です。この情報を元に競合分析を行ってください。",
        "",
        this.collectedInfo || "（追加の企業情報なし）",
      ]
        .filter((line) => line !== undefined)
        .join("\n");

      const analysis = await analyzeCompany(ctx.llm, prompt);

      const competitors: CompetitorInfo[] = (analysis.competitors ?? []).map(
        (c) => ({
          name: c.name,
          url: c.url,
          differentiator: c.differentiator,
        }),
      );

      return {
        taskType: this.type,
        success: true,
        data: {
          competitors,
          challenges: analysis.challenges,
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
