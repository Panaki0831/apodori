import type { EmailSource } from "@sales-ai/core";
import { generateEmailCandidates } from "./pattern-generator.js";
import { HunterIoClient } from "./hunter-io.js";
import { verifyEmailSmtp } from "./smtp-verifier.js";

// ============================================================
// Public interfaces
// ============================================================

export interface ContactInput {
  firstName: string;
  lastName: string;
  jobTitle?: string;
}

export interface EmailFinderResult {
  email: string;
  confidence: number;
  source: EmailSource;
  verified: boolean;
}

export interface DomainEmailResult {
  domain: string;
  pattern: string | null;
  emails: Array<{
    email: string;
    confidence: number;
    firstName: string | null;
    lastName: string | null;
    position: string | null;
  }>;
}

// ============================================================
// EmailFinder
// ============================================================

/** Maximum number of pattern candidates to SMTP-verify per contact. */
const MAX_SMTP_CANDIDATES = 3;

/**
 * Orchestrates email discovery for one or more contacts at a given domain.
 *
 * The pipeline for each contact is:
 *  1. If a Hunter.io API key is configured, attempt an API lookup first.
 *  2. Generate pattern-based candidates.
 *  3. SMTP-verify the top candidates.
 *  4. Return the best result (highest confidence, prefer verified).
 */
export class EmailFinder {
  private readonly hunterClient: HunterIoClient | null;

  constructor(config: { hunterIoApiKey?: string } = {}) {
    this.hunterClient = config.hunterIoApiKey
      ? new HunterIoClient(config.hunterIoApiKey)
      : null;
  }

  /**
   * Find email addresses for a list of contacts at the given domain.
   */
  async findEmails(
    domain: string,
    contacts: ContactInput[],
  ): Promise<EmailFinderResult[]> {
    const results: EmailFinderResult[] = [];

    for (const contact of contacts) {
      const result = await this.findEmailForContact(domain, contact);
      if (result) {
        results.push(result);
      }
    }

    return results;
  }

  /**
   * Discover all known email addresses for a domain via Hunter.io.
   */
  async findDomainEmails(domain: string): Promise<DomainEmailResult> {
    if (!this.hunterClient) {
      return { domain, pattern: null, emails: [] };
    }

    const hunterResult = await this.hunterClient.domainSearch(domain);

    return {
      domain: hunterResult.domain,
      pattern: hunterResult.pattern,
      emails: hunterResult.emails.map((e) => ({
        email: e.value,
        confidence: e.confidence,
        firstName: e.first_name,
        lastName: e.last_name,
        position: e.position,
      })),
    };
  }

  // ----------------------------------------------------------
  // Private helpers
  // ----------------------------------------------------------

  private async findEmailForContact(
    domain: string,
    contact: ContactInput,
  ): Promise<EmailFinderResult | null> {
    // 1. Try Hunter.io email finder
    if (this.hunterClient) {
      try {
        const hunterResult = await this.hunterClient.emailFinder(
          domain,
          contact.firstName,
          contact.lastName,
        );

        if (hunterResult.email) {
          const verified = await this.smtpVerify(hunterResult.email);
          return {
            email: hunterResult.email,
            confidence: hunterResult.confidence / 100,
            source: "api" as EmailSource,
            verified,
          };
        }
      } catch {
        // Hunter.io failed – fall through to pattern matching
      }
    }

    // 2. Generate pattern-based candidates
    const candidates = generateEmailCandidates(
      contact.firstName,
      contact.lastName,
      domain,
    );

    if (candidates.length === 0) {
      return null;
    }

    // 3. SMTP-verify the top candidates (sorted by confidence desc)
    const sorted = [...candidates].sort(
      (a, b) => b.confidence - a.confidence,
    );
    const toVerify = sorted.slice(0, MAX_SMTP_CANDIDATES);

    for (const candidate of toVerify) {
      try {
        const verified = await this.smtpVerify(candidate.email);
        if (verified) {
          return {
            email: candidate.email,
            confidence: Math.min(candidate.confidence + 0.15, 1),
            source: "pattern" as EmailSource,
            verified: true,
          };
        }
      } catch {
        // SMTP verification failed – continue to next candidate
      }
    }

    // 4. No SMTP confirmation – return the highest-confidence candidate
    const best = sorted[0];
    return {
      email: best.email,
      confidence: best.confidence,
      source: "pattern" as EmailSource,
      verified: false,
    };
  }

  /**
   * Attempt SMTP verification, returning true only for a definitive
   * positive result. Returns false for errors and inconclusive results.
   */
  private async smtpVerify(email: string): Promise<boolean> {
    try {
      const result = await verifyEmailSmtp(email);
      return result.isValid === true;
    } catch {
      return false;
    }
  }
}
