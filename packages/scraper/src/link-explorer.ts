import * as cheerio from "cheerio";
import { extractDomain } from "@sales-ai/core";
import { fetchPageSimple } from "./page-fetcher.js";

/**
 * Discovered page URLs from a corporate website.
 * Each field is optional because not every company site has every page type.
 */
export interface DiscoveredPages {
  aboutUrl?: string;
  executivesUrl?: string;
  contactUrl?: string;
  recruitmentUrl?: string;
  newsUrl?: string;
  blogUrl?: string;
}

// ---------------------------------------------------------------------------
// Pattern definitions for each page category
// ---------------------------------------------------------------------------

interface PagePattern {
  /** Patterns to match in anchor text (case-insensitive). */
  textPatterns: RegExp[];
  /** Patterns to match in the URL path (case-insensitive). */
  urlPatterns: RegExp[];
}

const PAGE_PATTERNS: Record<keyof DiscoveredPages, PagePattern> = {
  aboutUrl: {
    textPatterns: [
      /会社概要/,
      /会社情報/,
      /企業情報/,
      /企業概要/,
      /about\s*us/i,
      /about/i,
      /company\s*(info|profile|overview)?/i,
      /corporate\s*(info|profile|overview)?/i,
      /私たちについて/,
    ],
    urlPatterns: [
      /\/about/i,
      /\/company/i,
      /\/corporate/i,
      /\/profile/i,
      /\/gaiyou/i,
      /\/outline/i,
      /\/overview/i,
    ],
  },
  executivesUrl: {
    textPatterns: [
      /役員/,
      /経営陣/,
      /取締役/,
      /代表.*(?:挨拶|メッセージ)/,
      /トップメッセージ/,
      /(?:ceo|代表).*(?:message|メッセージ)/i,
      /execut/i,
      /leadership/i,
      /management\s*team/i,
      /team/i,
      /board\s*of\s*directors/i,
    ],
    urlPatterns: [
      /\/officer/i,
      /\/executive/i,
      /\/leadership/i,
      /\/team/i,
      /\/board/i,
      /\/management/i,
      /\/member/i,
      /\/message/i,
      /\/yakuin/i,
    ],
  },
  contactUrl: {
    textPatterns: [
      /お問い合わせ/,
      /お問合せ/,
      /問い合わせ/,
      /contact\s*us/i,
      /contact/i,
      /お気軽に/,
      /ご相談/,
      /inquiry/i,
      /enquiry/i,
    ],
    urlPatterns: [
      /\/contact/i,
      /\/inquiry/i,
      /\/enquiry/i,
      /\/toiawase/i,
      /\/form/i,
      /\/otoiawase/i,
    ],
  },
  recruitmentUrl: {
    textPatterns: [
      /採用/,
      /求人/,
      /キャリア/,
      /新卒/,
      /中途/,
      /recruit/i,
      /career/i,
      /hiring/i,
      /join\s*us/i,
      /jobs?/i,
    ],
    urlPatterns: [
      /\/recruit/i,
      /\/career/i,
      /\/hiring/i,
      /\/jobs?/i,
      /\/saiyo/i,
    ],
  },
  newsUrl: {
    textPatterns: [
      /ニュース/,
      /お知らせ/,
      /新着情報/,
      /プレスリリース/,
      /news/i,
      /press/i,
      /release/i,
      /topics/i,
      /what's\s*new/i,
      /information/i,
    ],
    urlPatterns: [
      /\/news/i,
      /\/press/i,
      /\/release/i,
      /\/topics/i,
      /\/info/i,
      /\/whatsnew/i,
    ],
  },
  blogUrl: {
    textPatterns: [
      /ブログ/,
      /コラム/,
      /オウンドメディア/,
      /技術ブログ/,
      /blog/i,
      /column/i,
      /article/i,
      /insight/i,
      /tech\s*blog/i,
    ],
    urlPatterns: [
      /\/blog/i,
      /\/column/i,
      /\/article/i,
      /\/insight/i,
      /\/media/i,
      /\/journal/i,
    ],
  },
};

/**
 * Score a link against a page pattern.
 * Higher score = stronger match. Returns 0 for no match.
 */
function scoreLink(
  text: string,
  href: string,
  pattern: PagePattern,
): number {
  let score = 0;

  // Text matching is the strongest signal
  for (const re of pattern.textPatterns) {
    if (re.test(text)) {
      score += 10;
      break;
    }
  }

  // URL path matching is a secondary signal
  for (const re of pattern.urlPatterns) {
    if (re.test(href)) {
      score += 5;
      break;
    }
  }

  return score;
}

/**
 * Resolve a possibly-relative href against a base URL.
 * Returns null if the result is not a valid HTTP(S) URL.
 */
function resolveUrl(href: string, baseUrl: string): string | null {
  try {
    const resolved = new URL(href, baseUrl);
    if (resolved.protocol === "http:" || resolved.protocol === "https:") {
      return resolved.href;
    }
  } catch {
    // Malformed URL – ignore
  }
  return null;
}

/**
 * Crawl a company homepage and discover relevant sub-pages.
 *
 * Fetches the page at `baseUrl` with a simple HTTP request, parses all
 * `<a>` links, and scores them against known patterns for each page
 * category (about, executives, contact, recruitment, news, blog).
 *
 * Only links on the same domain as `baseUrl` are considered.
 *
 * @param baseUrl - The company homepage URL to start from.
 * @returns An object with discovered page URLs for each category.
 */
export async function findCompanyPages(
  baseUrl: string,
): Promise<DiscoveredPages> {
  const pageData = await fetchPageSimple(baseUrl);
  const $ = cheerio.load(pageData.html);
  const baseDomain = extractDomain(baseUrl);

  // Collect all links with their text and resolved URLs
  const links: Array<{ text: string; href: string }> = [];

  $("a[href]").each((_index, element) => {
    const rawHref = $(element).attr("href");
    if (!rawHref) return;

    const resolved = resolveUrl(rawHref, baseUrl);
    if (!resolved) return;

    // Only consider links on the same domain
    const linkDomain = extractDomain(resolved);
    if (linkDomain !== baseDomain) return;

    const text = $(element).text().trim();
    if (!text && !rawHref) return;

    links.push({ text, href: resolved });
  });

  // Score each link against each category and pick the best match
  const result: DiscoveredPages = {};

  for (const [key, pattern] of Object.entries(PAGE_PATTERNS)) {
    const categoryKey = key as keyof DiscoveredPages;

    let bestScore = 0;
    let bestUrl: string | undefined;

    for (const link of links) {
      const score = scoreLink(link.text, link.href, pattern);
      if (score > bestScore) {
        bestScore = score;
        bestUrl = link.href;
      }
    }

    // Only accept matches that scored above a minimum threshold
    if (bestScore >= 5 && bestUrl) {
      result[categoryKey] = bestUrl;
    }
  }

  return result;
}
