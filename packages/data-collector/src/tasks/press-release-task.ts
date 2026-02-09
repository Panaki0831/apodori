import type { TaskResult, NewsItem } from "@sales-ai/core";
import { searchGoogle, fetchPageSimple } from "@sales-ai/scraper";
import { extractNews } from "@sales-ai/ai-engine";
import { truncateText } from "@sales-ai/core";
import type { CollectionTask, TaskContext } from "./base-task.js";

/**
 * Task #7: Press releases.
 *
 * Searches PR TIMES and the company's own news page for recent press
 * releases. Uses the AI engine to extract structured news items.
 */
export class PressReleaseTask implements CollectionTask {
  readonly type = "press_release" as const;

  async execute(ctx: TaskContext): Promise<TaskResult> {
    try {
      const allNews: NewsItem[] = [];

      // Search PR TIMES for the company
      const prTimesNews = await this.searchPrTimes(ctx);
      allNews.push(...prTimesNews);

      // Search for company news page
      const companyNews = await this.searchCompanyNews(ctx);
      allNews.push(...companyNews);

      // Deduplicate by title
      const seen = new Set<string>();
      const deduplicated = allNews.filter((item) => {
        const key = item.title.toLowerCase().trim();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      return {
        taskType: this.type,
        success: true,
        data: deduplicated,
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
   * Search PR TIMES for press releases about the company.
   */
  private async searchPrTimes(ctx: TaskContext): Promise<NewsItem[]> {
    try {
      const query = `"${ctx.companyName}" site:prtimes.jp`;
      const searchResults = await searchGoogle(query, 5);

      if (searchResults.length === 0) {
        return [];
      }

      // Fetch the top PR TIMES pages
      const pagesToFetch = searchResults.slice(0, 3);
      const fetchResults = await Promise.allSettled(
        pagesToFetch.map((r) => fetchPageSimple(r.url)),
      );

      const newsItems: NewsItem[] = [];

      for (let i = 0; i < fetchResults.length; i++) {
        const result = fetchResults[i];
        if (result.status === "fulfilled") {
          const truncatedText = truncateText(result.value.text, 5000);
          const extracted = await extractNews(ctx.llm, truncatedText);

          // Set the URL from the search result for each news item
          for (const item of extracted) {
            if (!item.url) {
              item.url = pagesToFetch[i].url;
            }
            newsItems.push(item);
          }
        }
      }

      return newsItems;
    } catch {
      return [];
    }
  }

  /**
   * Search for the company's own news/press page and extract news items.
   */
  private async searchCompanyNews(ctx: TaskContext): Promise<NewsItem[]> {
    try {
      if (!ctx.companyUrl) {
        return [];
      }

      const query = `"${ctx.companyName}" ニュース OR プレスリリース OR "お知らせ" site:${ctx.companyUrl}`;
      const searchResults = await searchGoogle(query, 3);

      if (searchResults.length === 0) {
        return [];
      }

      const page = await fetchPageSimple(searchResults[0].url);
      const truncatedText = truncateText(page.text, 5000);
      const extracted = await extractNews(ctx.llm, truncatedText);

      // Set source URL for extracted items
      for (const item of extracted) {
        if (!item.url) {
          item.url = searchResults[0].url;
        }
      }

      return extracted;
    } catch {
      return [];
    }
  }
}
