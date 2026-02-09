import type { TaskResult, RecruitmentResult } from "@sales-ai/core";
import { searchGoogle, fetchPageSimple } from "@sales-ai/scraper";
import { extractRecruitmentInfo } from "@sales-ai/ai-engine";
import type { CollectionTask, TaskContext } from "./base-task.js";

/**
 * Job board sites to search for recruitment information.
 */
const JOB_BOARD_SITES = [
  "wantedly.com",
  "green-japan.com",
  "jp.indeed.com",
] as const;

/**
 * Task #3-4: Recruitment and job postings.
 *
 * Searches for recruitment pages both on the company's own site and on
 * external job boards (Wantedly, Green, Indeed). Extracts structured
 * recruitment information using the AI engine.
 */
export class RecruitmentTask implements CollectionTask {
  readonly type = "recruitment" as const;

  async execute(ctx: TaskContext): Promise<TaskResult> {
    try {
      const allPositions: RecruitmentResult["positions"] = [];
      let recruiterName: string | undefined;
      let recruiterEmail: string | undefined;
      let organizationGrowth: string | undefined;

      // Search company's own recruitment page
      if (ctx.companyUrl) {
        const ownRecruitResult = await this.searchOwnRecruitment(ctx);
        if (ownRecruitResult) {
          allPositions.push(...ownRecruitResult.positions);
          recruiterName = ownRecruitResult.recruiterName;
          recruiterEmail = ownRecruitResult.recruiterEmail;
          organizationGrowth = ownRecruitResult.organizationGrowth;
        }
      }

      // Search external job boards
      const jobBoardResults = await this.searchJobBoards(ctx);
      for (const result of jobBoardResults) {
        allPositions.push(...result.positions);
        if (!recruiterName && result.recruiterName) {
          recruiterName = result.recruiterName;
        }
        if (!recruiterEmail && result.recruiterEmail) {
          recruiterEmail = result.recruiterEmail;
        }
        if (!organizationGrowth && result.organizationGrowth) {
          organizationGrowth = result.organizationGrowth;
        }
      }

      const recruitmentResult: RecruitmentResult = {
        positions: allPositions,
        recruiterName,
        recruiterEmail,
        organizationGrowth,
      };

      return {
        taskType: this.type,
        success: true,
        data: recruitmentResult,
      };
    } catch (error) {
      return {
        taskType: this.type,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Search for the company's own recruitment page on their corporate site.
   */
  private async searchOwnRecruitment(
    ctx: TaskContext,
  ): Promise<RecruitmentResult | null> {
    try {
      const query = `"${ctx.companyName}" 採用 OR recruit site:${ctx.companyUrl}`;
      const results = await searchGoogle(query, 5);

      if (results.length === 0) {
        return null;
      }

      // Fetch the top recruitment page
      const page = await fetchPageSimple(results[0].url);
      return await extractRecruitmentInfo(ctx.llm, page.text);
    } catch {
      return null;
    }
  }

  /**
   * Search external job boards for the company's job postings.
   */
  private async searchJobBoards(
    ctx: TaskContext,
  ): Promise<RecruitmentResult[]> {
    const results: RecruitmentResult[] = [];

    const searchPromises = JOB_BOARD_SITES.map(async (site) => {
      try {
        const query = `"${ctx.companyName}" site:${site}`;
        const searchResults = await searchGoogle(query, 3);

        if (searchResults.length === 0) {
          return null;
        }

        // Fetch the top result from the job board
        const page = await fetchPageSimple(searchResults[0].url);
        const recruitment = await extractRecruitmentInfo(ctx.llm, page.text);

        // Tag positions with the source site
        for (const position of recruitment.positions) {
          if (!position.source) {
            position.source = site;
          }
        }

        return recruitment;
      } catch {
        return null;
      }
    });

    const settled = await Promise.allSettled(searchPromises);

    for (const result of settled) {
      if (result.status === "fulfilled" && result.value) {
        results.push(result.value);
      }
    }

    return results;
  }
}
