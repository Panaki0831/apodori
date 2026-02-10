import type { TaskResult, ExecutiveInfo } from "@sales-ai/core";
import { searchGoogle, fetchPageSimple } from "@sales-ai/scraper";
import { extractContacts } from "@sales-ai/ai-engine";
import type { CollectionTask, TaskContext } from "./base-task.js";

/**
 * LinkedIn profile URL pattern.
 * Matches linkedin.com/in/username style URLs.
 */
const LINKEDIN_PROFILE_RE = /linkedin\.com\/in\//i;

/**
 * Task: Search Google for executive / key-person pages.
 *
 * Uses multiple strategies to find decision-makers:
 *  1. Google search for "会社名 代表取締役 OR 取締役 OR 役員"
 *  2. Google search for "会社名 CTO OR CEO OR CFO"
 *  3. LinkedIn profile discovery via Google: "会社名 site:linkedin.com/in"
 *
 * All found text is sent to Claude LLM to extract structured person data.
 */
export class ExecutiveSearchTask implements CollectionTask {
  readonly type = "executive_search" as const;

  async execute(ctx: TaskContext): Promise<TaskResult> {
    try {
      // ── Strategy 1 & 2: General web search for executives ──
      const generalQueries = [
        `"${ctx.companyName}" 代表取締役 OR 取締役 OR 役員`,
        `"${ctx.companyName}" CTO OR CEO OR CFO OR 社長`,
      ];

      // ── Strategy 3: LinkedIn profile discovery ──
      const linkedinQueries = [
        `"${ctx.companyName}" site:linkedin.com/in`,
        `"${ctx.companyName}" site:jp.linkedin.com/in`,
      ];

      const allTexts: string[] = [];

      // Run general searches
      for (const query of generalQueries) {
        await this.searchAndCollect(query, allTexts, 2);
      }

      // Run LinkedIn searches — extract profile info from snippets + pages
      const linkedinProfiles: string[] = [];
      for (const query of linkedinQueries) {
        try {
          const results = await searchGoogle(query, 10);
          for (const result of results) {
            if (LINKEDIN_PROFILE_RE.test(result.url)) {
              // LinkedIn profiles have useful info right in the search snippet:
              // "田中太郎 - 東急不動産 - CTO | LinkedIn"
              linkedinProfiles.push(
                `LinkedIn: ${result.title}\n${result.snippet ?? ""}`,
              );
            }
          }

          // Also fetch top 2 LinkedIn profile pages for more detail
          const linkedinResults = results
            .filter((r) => LINKEDIN_PROFILE_RE.test(r.url))
            .slice(0, 2);

          for (const lr of linkedinResults) {
            try {
              const page = await fetchPageSimple(lr.url);
              allTexts.push(page.text.slice(0, 2000));
            } catch {
              // LinkedIn may block — snippets are still useful
            }
          }
        } catch {
          // LinkedIn search failed — continue
        }
      }

      // Add LinkedIn snippet data to text for LLM extraction
      if (linkedinProfiles.length > 0) {
        allTexts.push(
          "以下はLinkedInプロフィールの検索結果です:\n" +
            linkedinProfiles.join("\n\n"),
        );
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

      // Convert ContactInfo to ExecutiveInfo, preserving romaji and LinkedIn data
      const executives: ExecutiveInfo[] = contacts.map((c) => ({
        name: c.personName,
        nameRomaji: c.personNameReading,
        title: c.jobTitle ?? "",
        department: c.department,
      }));

      return {
        taskType: this.type,
        success: true,
        data: {
          executives,
          linkedinProfileCount: linkedinProfiles.length,
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
   * Search Google and collect page text into the texts array.
   */
  private async searchAndCollect(
    query: string,
    texts: string[],
    maxPages: number,
  ): Promise<void> {
    try {
      const results = await searchGoogle(query, 5);
      const toFetch = results.slice(0, maxPages);
      const fetched = await Promise.allSettled(
        toFetch.map((r) => fetchPageSimple(r.url)),
      );
      for (const result of fetched) {
        if (result.status === "fulfilled") {
          texts.push(result.value.text.slice(0, 3000));
        }
      }
    } catch {
      // Search or fetch failed — skip
    }
  }
}
