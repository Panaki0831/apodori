import type { TaskResult, CorporateSiteResult } from "@sales-ai/core";
import { findCompanyPages, fetchPageSimple } from "@sales-ai/scraper";
import { extractCompanyInfo } from "@sales-ai/ai-engine";
import type { CollectionTask, TaskContext } from "./base-task.js";

// ── Regex helpers for fallback extraction ──

/** Match Japanese phone numbers (03-xxxx-xxxx, 0120-xxx-xxx, etc.) */
const PHONE_RE = /(?:0\d{1,4}[-\s]?\d{1,4}[-\s]?\d{2,4})/g;

/** Match email addresses */
const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

/** Match Japanese postal code + address */
const ADDRESS_RE = /〒?\s*\d{3}[-ー]\d{4}\s*[^\n]{5,80}/g;

/** Match common address patterns (都道府県 + 市区町村) */
const ADDRESS_JP_RE =
  /(?:東京都|北海道|(?:京都|大阪)府|.{2,3}県)[^\n,、。]{5,60}/g;

/**
 * Extract basic information from HTML text using regex patterns.
 * Used as a fallback when the LLM returns minimal data.
 */
function extractFromHtmlFallback(text: string): {
  phone?: string;
  address?: string;
  emails: string[];
} {
  const phones = text.match(PHONE_RE) ?? [];
  const emails = [...new Set(text.match(EMAIL_RE) ?? [])];
  const addresses = [
    ...(text.match(ADDRESS_RE) ?? []),
    ...(text.match(ADDRESS_JP_RE) ?? []),
  ];

  // Pick the first plausible phone (skip very short matches)
  let phone: string | undefined;
  for (const p of phones) {
    const cleaned = p.replace(/[\s-]/g, "");
    if (cleaned.length >= 10 && cleaned.length <= 13) {
      phone = p.trim();
      break;
    }
  }

  // Pick the longest address candidate (usually the most complete)
  let address: string | undefined;
  if (addresses.length > 0) {
    address = addresses.sort((a, b) => b.length - a.length)[0].trim();
  }

  return { phone, address, emails };
}

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

      let companyInfo: CorporateSiteResult;
      try {
        companyInfo = await extractCompanyInfo(ctx.llm, combinedHtml);
      } catch {
        // LLM extraction failed — use empty base (regex fallback below)
        companyInfo = { executives: [] };
      }

      // ── Regex fallback: fill in missing fields from raw HTML ──
      const fallback = extractFromHtmlFallback(combinedHtml);

      if (!companyInfo.phone && fallback.phone) {
        companyInfo.phone = fallback.phone;
      }
      if (!companyInfo.address && fallback.address) {
        companyInfo.address = fallback.address;
      }
      if (!companyInfo.email && fallback.emails.length > 0) {
        companyInfo.email = fallback.emails[0];
      }

      // Store all discovered emails for the contact search task
      (companyInfo as unknown as Record<string, unknown>)._discoveredEmails =
        fallback.emails;

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
