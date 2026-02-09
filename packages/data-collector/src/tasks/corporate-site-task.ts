import type { TaskResult, CorporateSiteResult } from "@sales-ai/core";
import { findCompanyPages, fetchPageSimple } from "@sales-ai/scraper";
import { extractCompanyInfo } from "@sales-ai/ai-engine";
import type { CollectionTask, TaskContext } from "./base-task.js";

/**
 * Task #2: Crawl the corporate website.
 *
 * Discovers relevant pages (about, contact, executives) using the link
 * explorer, fetches each discovered page, then uses the AI engine to
 * extract structured company information from the HTML.
 */
export class CorporateSiteTask implements CollectionTask {
  readonly type = "corporate_site" as const;

  async execute(ctx: TaskContext): Promise<TaskResult> {
    try {
      if (!ctx.companyUrl) {
        return {
          taskType: this.type,
          success: false,
          error: "No company URL available. Run GoogleSearchTask first.",
        };
      }

      // Discover relevant pages on the corporate site
      const pages = await findCompanyPages(ctx.companyUrl);

      // Collect HTML from all discovered pages
      const htmlParts: string[] = [];

      // Always fetch the main page
      const mainPage = await fetchPageSimple(ctx.companyUrl);
      htmlParts.push(mainPage.text);

      // Fetch discovered sub-pages in parallel
      const pageUrls = [
        pages.aboutUrl,
        pages.executivesUrl,
        pages.contactUrl,
      ].filter((url): url is string => !!url);

      const pageResults = await Promise.allSettled(
        pageUrls.map((url) => fetchPageSimple(url)),
      );

      for (const result of pageResults) {
        if (result.status === "fulfilled") {
          htmlParts.push(result.value.text);
        }
      }

      // Use the AI engine to extract structured company info from combined text
      const combinedHtml = htmlParts.join("\n\n---\n\n");
      const companyInfo: CorporateSiteResult = await extractCompanyInfo(
        ctx.llm,
        combinedHtml,
      );

      // Attach contact form URL if found by link explorer
      if (pages.contactUrl && !companyInfo.contactFormUrl) {
        companyInfo.contactFormUrl = pages.contactUrl;
      }

      return {
        taskType: this.type,
        success: true,
        data: {
          companyInfo,
          discoveredPages: pages,
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
