import { searchGoogle, fetchPageSimple } from "@sales-ai/scraper";

/**
 * Email address regex for extracting emails from web page text.
 */
const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

/**
 * Emails to ignore (tracking pixels, image files, common false positives).
 */
const IGNORE_PATTERNS = [
  /noreply@/i,
  /no-reply@/i,
  /mailer-daemon@/i,
  /postmaster@/i,
  /\.png$/i,
  /\.jpg$/i,
  /\.gif$/i,
  /example\.com$/i,
  /sentry\.io$/i,
  /webpack/i,
  /wixpress/i,
  /schema\.org/i,
];

function shouldIgnore(email: string): boolean {
  return IGNORE_PATTERNS.some((pattern) => pattern.test(email));
}

export interface WebDiscoveredEmail {
  email: string;
  confidence: number;
  source: string;
  context?: string;
}

/**
 * Discover email addresses associated with a company domain using Google
 * Search and web scraping — no paid API required.
 *
 * Strategy:
 *  1. Google search for `"@domain"` to find pages that publish emails
 *  2. Google search for `"company_name" メール OR email OR 連絡先`
 *  3. Scrape the top results and extract all email addresses at the domain
 */
export class WebEmailDiscovery {
  /**
   * Find emails for a domain by searching the web.
   */
  async discoverDomainEmails(
    domain: string,
    companyName: string,
  ): Promise<WebDiscoveredEmail[]> {
    const found = new Map<string, WebDiscoveredEmail>();

    // Strategy 1: Search for published emails at the domain
    const queries = [
      `"@${domain}"`,
      `"${companyName}" "@${domain}"`,
      `"${companyName}" メール OR email OR 連絡先 OR 問い合わせ`,
    ];

    for (const query of queries) {
      try {
        const results = await searchGoogle(query, 5);

        // Check snippets first (fast, no page fetching required)
        for (const result of results) {
          const snippetEmails = this.extractEmails(
            result.snippet ?? "",
            domain,
          );
          for (const email of snippetEmails) {
            if (!found.has(email)) {
              found.set(email, {
                email,
                confidence: 0.7,
                source: "google_snippet",
                context: result.title,
              });
            }
          }
        }

        // Fetch top 2 pages per query
        const toFetch = results.slice(0, 2);
        const fetched = await Promise.allSettled(
          toFetch.map((r) => fetchPageSimple(r.url)),
        );

        for (const result of fetched) {
          if (result.status === "fulfilled") {
            const pageEmails = this.extractEmails(
              result.value.text,
              domain,
            );
            for (const email of pageEmails) {
              if (!found.has(email)) {
                found.set(email, {
                  email,
                  confidence: 0.6,
                  source: "web_page",
                  context: result.value.title,
                });
              }
            }
          }
        }
      } catch {
        // Search failed — continue to next query
      }
    }

    return Array.from(found.values()).sort(
      (a, b) => b.confidence - a.confidence,
    );
  }

  /**
   * Search for a specific person's email at a domain.
   */
  async findPersonEmail(
    domain: string,
    personName: string,
    companyName: string,
  ): Promise<WebDiscoveredEmail | null> {
    try {
      const queries = [
        `"${personName}" "${companyName}" "@${domain}"`,
        `"${personName}" "@${domain}"`,
        `"${personName}" "${companyName}" メール OR email`,
      ];

      for (const query of queries) {
        try {
          const results = await searchGoogle(query, 5);

          for (const result of results) {
            // Check snippet
            const emails = this.extractEmails(
              result.snippet ?? "",
              domain,
            );
            if (emails.length > 0) {
              return {
                email: emails[0],
                confidence: 0.8,
                source: "google_person_search",
                context: `${personName} (${result.title})`,
              };
            }
          }

          // Fetch top result
          if (results.length > 0) {
            try {
              const page = await fetchPageSimple(results[0].url);
              const emails = this.extractEmails(page.text, domain);
              if (emails.length > 0) {
                return {
                  email: emails[0],
                  confidence: 0.65,
                  source: "web_page_person",
                  context: `${personName} (${page.title})`,
                };
              }
            } catch {
              // Page fetch failed
            }
          }
        } catch {
          // Search failed — try next query
        }
      }
    } catch {
      // Fatal error
    }

    return null;
  }

  /**
   * Extract email addresses from text, filtered to the target domain.
   */
  private extractEmails(text: string, domain: string): string[] {
    const matches = text.match(EMAIL_RE) ?? [];
    const domainLower = domain.toLowerCase();

    return [...new Set(matches)]
      .map((e) => e.toLowerCase())
      .filter((e) => e.endsWith(`@${domainLower}`))
      .filter((e) => !shouldIgnore(e));
  }
}
