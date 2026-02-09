import { createRateLimiter, retryWithBackoff } from "@sales-ai/core";

// ============================================================
// Result interfaces
// ============================================================

export interface HunterDomainEmail {
  value: string;
  type: "personal" | "generic" | null;
  confidence: number;
  first_name: string | null;
  last_name: string | null;
  position: string | null;
  department: string | null;
}

export interface HunterDomainResult {
  domain: string;
  pattern: string | null;
  emails: HunterDomainEmail[];
  total: number;
}

export interface HunterVerifyResult {
  email: string;
  status: "valid" | "invalid" | "accept_all" | "webmail" | "disposable" | "unknown";
  score: number;
  regexp: boolean;
  gibberish: boolean;
  disposable: boolean;
  webmail: boolean;
  mx_records: boolean;
  smtp_server: boolean;
  smtp_check: boolean;
  accept_all: boolean;
}

export interface HunterFinderResult {
  email: string | null;
  confidence: number;
  first_name: string;
  last_name: string;
  domain: string;
}

// ============================================================
// Hunter.io Client
// ============================================================

const HUNTER_API_BASE = "https://api.hunter.io/v2";

/**
 * Client for the Hunter.io email-finding API.
 *
 * All public methods are rate-limited to at most 1 request per second and
 * will automatically retry transient failures with exponential back-off.
 */
export class HunterIoClient {
  private readonly apiKey: string;
  private readonly rateLimit: () => Promise<void>;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    // 1 request per second
    this.rateLimit = createRateLimiter(1000);
  }

  /**
   * Search for all email addresses associated with a domain.
   */
  async domainSearch(domain: string): Promise<HunterDomainResult> {
    const url = new URL(`${HUNTER_API_BASE}/domain-search`);
    url.searchParams.set("domain", domain);
    url.searchParams.set("api_key", this.apiKey);

    const body = await this.request<{
      data: {
        domain: string;
        pattern: string | null;
        emails: HunterDomainEmail[];
      };
      meta: { results: number };
    }>(url.toString());

    return {
      domain: body.data.domain,
      pattern: body.data.pattern,
      emails: body.data.emails,
      total: body.meta.results,
    };
  }

  /**
   * Verify whether a given email address is deliverable.
   */
  async emailVerifier(email: string): Promise<HunterVerifyResult> {
    const url = new URL(`${HUNTER_API_BASE}/email-verifier`);
    url.searchParams.set("email", email);
    url.searchParams.set("api_key", this.apiKey);

    const body = await this.request<{ data: HunterVerifyResult }>(
      url.toString(),
    );
    return body.data;
  }

  /**
   * Attempt to find the email address for a specific person at a domain.
   */
  async emailFinder(
    domain: string,
    firstName: string,
    lastName: string,
  ): Promise<HunterFinderResult> {
    const url = new URL(`${HUNTER_API_BASE}/email-finder`);
    url.searchParams.set("domain", domain);
    url.searchParams.set("first_name", firstName);
    url.searchParams.set("last_name", lastName);
    url.searchParams.set("api_key", this.apiKey);

    const body = await this.request<{ data: HunterFinderResult }>(
      url.toString(),
    );
    return body.data;
  }

  // ----------------------------------------------------------
  // Internal helpers
  // ----------------------------------------------------------

  private async request<T>(url: string): Promise<T> {
    return retryWithBackoff(async () => {
      await this.rateLimit();

      const response = await fetch(url, {
        method: "GET",
        headers: { Accept: "application/json" },
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(
          `Hunter.io API error ${response.status}: ${text}`,
        );
      }

      return (await response.json()) as T;
    }, 2, 1000);
  }
}
