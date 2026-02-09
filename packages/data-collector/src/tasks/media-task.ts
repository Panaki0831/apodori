import type { TaskResult, NewsItem } from "@sales-ai/core";
import { truncateText } from "@sales-ai/core";
import { searchGoogle, fetchPageSimple } from "@sales-ai/scraper";
import { extractNews } from "@sales-ai/ai-engine";
import type { CollectionTask, TaskContext } from "./base-task.js";

/**
 * Media outlets to search for company coverage.
 */
const TECH_MEDIA_SITES = [
  "techcrunch.com",
  "jp.techcrunch.com",
  "thebridge.jp",
  "japan.cnet.com",
  "itmedia.co.jp",
  "ascii.jp",
] as const;

/**
 * Task #8-9: Company blog and external media coverage.
 *
 * Searches for the company's own blog content and coverage in external
 * tech media outlets. Extracts key insights using the AI engine.
 */
export class MediaTask implements CollectionTask {
  readonly type = "company_blog" as const;

  async execute(ctx: TaskContext): Promise<TaskResult> {
    try {
      const blogInsights = await this.searchCompanyBlog(ctx);
      const mediaInsights = await this.searchExternalMedia(ctx);

      return {
        taskType: this.type,
        success: true,
        data: {
          blogArticles: blogInsights,
          mediaCoverage: mediaInsights,
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

  /**
   * Search for the company's own blog and extract articles.
   */
  private async searchCompanyBlog(ctx: TaskContext): Promise<NewsItem[]> {
    try {
      const query = ctx.companyUrl
        ? `"${ctx.companyName}" ブログ OR blog OR コラム site:${ctx.companyUrl}`
        : `"${ctx.companyName}" 公式ブログ OR "tech blog"`;

      const searchResults = await searchGoogle(query, 5);

      if (searchResults.length === 0) {
        return [];
      }

      // Fetch and extract from the top results
      const pagesToFetch = searchResults.slice(0, 2);
      const fetchResults = await Promise.allSettled(
        pagesToFetch.map((r) => fetchPageSimple(r.url)),
      );

      const articles: NewsItem[] = [];

      for (let i = 0; i < fetchResults.length; i++) {
        const result = fetchResults[i];
        if (result.status === "fulfilled") {
          const truncatedText = truncateText(result.value.text, 5000);
          const extracted = await extractNews(ctx.llm, truncatedText);

          for (const item of extracted) {
            if (!item.url) {
              item.url = pagesToFetch[i].url;
            }
            articles.push(item);
          }
        }
      }

      return articles;
    } catch {
      return [];
    }
  }

  /**
   * Search external tech media for coverage of the company.
   */
  private async searchExternalMedia(ctx: TaskContext): Promise<NewsItem[]> {
    try {
      // Build a site-restricted query across multiple media outlets
      const siteFilter = TECH_MEDIA_SITES.map((s) => `site:${s}`).join(" OR ");
      const query = `"${ctx.companyName}" (${siteFilter})`;

      const searchResults = await searchGoogle(query, 5);

      if (searchResults.length === 0) {
        return [];
      }

      // Fetch and extract from the top results
      const pagesToFetch = searchResults.slice(0, 3);
      const fetchResults = await Promise.allSettled(
        pagesToFetch.map((r) => fetchPageSimple(r.url)),
      );

      const articles: NewsItem[] = [];

      for (let i = 0; i < fetchResults.length; i++) {
        const result = fetchResults[i];
        if (result.status === "fulfilled") {
          const truncatedText = truncateText(result.value.text, 5000);
          const extracted = await extractNews(ctx.llm, truncatedText);

          for (const item of extracted) {
            if (!item.url) {
              item.url = pagesToFetch[i].url;
            }
            articles.push(item);
          }
        }
      }

      return articles;
    } catch {
      return [];
    }
  }
}
