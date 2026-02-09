import * as cheerio from "cheerio";
import {
  type ScrapedPageData,
  createRateLimiter,
  extractDomain,
  retryWithBackoff,
  loadConfig,
} from "@sales-ai/core";
import { BrowserManager } from "./browser.js";

/**
 * Per-domain rate limiters to avoid hammering any single host.
 */
const domainRateLimiters = new Map<string, () => Promise<void>>();

/**
 * Get or create a rate limiter for a specific domain.
 */
function getDomainRateLimiter(domain: string, intervalMs: number): () => Promise<void> {
  let limiter = domainRateLimiters.get(domain);
  if (!limiter) {
    limiter = createRateLimiter(intervalMs);
    domainRateLimiters.set(domain, limiter);
  }
  return limiter;
}

/**
 * Shared BrowserManager instance (lazily created).
 */
let sharedBrowserManager: BrowserManager | null = null;

function getSharedBrowserManager(): BrowserManager {
  if (!sharedBrowserManager) {
    sharedBrowserManager = new BrowserManager();
  }
  return sharedBrowserManager;
}

/**
 * Shut down the shared browser manager.
 * Call this when the application is shutting down.
 */
export async function closeBrowser(): Promise<void> {
  if (sharedBrowserManager) {
    await sharedBrowserManager.close();
    sharedBrowserManager = null;
  }
}

/**
 * Extract readable text content from an HTML string.
 * Strips scripts, styles, and collapses whitespace.
 */
function extractTextFromHtml(html: string): { text: string; title: string } {
  const $ = cheerio.load(html);

  // Remove non-content elements
  $("script, style, noscript, iframe, svg, nav, footer, header").remove();

  const title = $("title").text().trim();
  const text = $("body")
    .text()
    .replace(/\s+/g, " ")
    .trim();

  return { text, title };
}

/**
 * Fetch a web page using Playwright (full JavaScript rendering).
 *
 * - Applies per-domain rate limiting (default: 2000ms between requests)
 * - Waits for the page to reach networkidle state
 * - Extracts rendered HTML, text content, and page title
 * - Retries with exponential backoff on failure
 */
export async function fetchPage(url: string): Promise<ScrapedPageData> {
  const config = loadConfig();
  const domain = extractDomain(url);
  if (domain) {
    const limiter = getDomainRateLimiter(domain, config.scraping.minRequestInterval);
    await limiter();
  }

  return retryWithBackoff(
    async () => {
      const browserManager = getSharedBrowserManager();
      const page = await browserManager.getPage();

      try {
        await page.goto(url, { waitUntil: "networkidle" });

        const html = await page.content();
        const title = await page.title();

        // Extract text using cheerio from the rendered HTML
        // (avoids DOM type references that conflict with Node-only lib settings)
        const { text } = extractTextFromHtml(html);

        return {
          url,
          html,
          text,
          title: title || undefined,
        };
      } finally {
        await page.context().close();
      }
    },
    config.scraping.maxRetries,
    1000,
  );
}

/**
 * Fetch a web page using a simple HTTP request (no JavaScript rendering).
 *
 * Uses the native fetch API and parses HTML with cheerio.
 * Faster and lighter weight than `fetchPage` but will not work for
 * JavaScript-rendered pages.
 *
 * - Applies per-domain rate limiting (default: 2000ms between requests)
 * - Retries with exponential backoff on failure
 */
export async function fetchPageSimple(url: string): Promise<ScrapedPageData> {
  const config = loadConfig();
  const domain = extractDomain(url);
  if (domain) {
    const limiter = getDomainRateLimiter(domain, config.scraping.minRequestInterval);
    await limiter();
  }

  return retryWithBackoff(
    async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        config.scraping.pageTimeout,
      );

      try {
        const response = await fetch(url, {
          signal: controller.signal,
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            Accept:
              "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "ja,en;q=0.9",
          },
        });

        if (!response.ok) {
          throw new Error(
            `HTTP ${response.status}: ${response.statusText} for ${url}`,
          );
        }

        const html = await response.text();
        const { text, title } = extractTextFromHtml(html);

        return {
          url,
          html,
          text,
          title: title || undefined,
        };
      } finally {
        clearTimeout(timeoutId);
      }
    },
    config.scraping.maxRetries,
    1000,
  );
}
