import type {
  TaskResult,
  ContactInfo,
  ExecutiveInfo,
} from "@sales-ai/core";
import { extractDomain, parseJapaneseName } from "@sales-ai/core";
import {
  EmailFinder,
  WebEmailDiscovery,
  type ContactInput,
  type EmailFinderResult,
} from "@sales-ai/email-finder";
import type { CollectionTask, TaskContext } from "./base-task.js";

/**
 * Task #11: Contact and email search.
 *
 * Discovers email addresses for key decision-makers using multiple strategies:
 *  1. Google Search-based web email discovery (primary — no paid API needed)
 *  2. Pattern-based email generation from romaji executive names
 *  3. SMTP verification of generated candidates
 *  4. Hunter.io API lookup (optional, if API key is provided)
 *  5. Generic department emails as last-resort fallback
 */
export class ContactSearchTask implements CollectionTask {
  readonly type = "contact_search" as const;

  private executives: ExecutiveInfo[];
  private existingContacts: ContactInfo[];
  private hunterIoApiKey: string;

  constructor(
    executives: ExecutiveInfo[] = [],
    existingContacts: ContactInfo[] = [],
    hunterIoApiKey: string = "",
  ) {
    this.executives = executives;
    this.existingContacts = existingContacts;
    this.hunterIoApiKey = hunterIoApiKey;
  }

  setExecutives(executives: ExecutiveInfo[]): void {
    this.executives = executives;
  }

  setExistingContacts(contacts: ContactInfo[]): void {
    this.existingContacts = contacts;
  }

  async execute(ctx: TaskContext): Promise<TaskResult> {
    try {
      if (!ctx.companyUrl) {
        return {
          taskType: this.type,
          success: false,
          error:
            "No company URL available. Cannot search for contact emails without a domain.",
        };
      }

      const domain = extractDomain(ctx.companyUrl);
      if (!domain) {
        return {
          taskType: this.type,
          success: false,
          error: `Could not extract domain from URL: ${ctx.companyUrl}`,
        };
      }

      const emailFinder = new EmailFinder({
        hunterIoApiKey: this.hunterIoApiKey || undefined,
      });
      const webDiscovery = new WebEmailDiscovery();

      // ── Step 1: Google Search-based domain email discovery ──
      // This is the primary strategy — works for Japanese companies
      // without any paid API.
      const webEmails = await webDiscovery.discoverDomainEmails(
        domain,
        ctx.companyName,
      );

      // ── Step 2: Build contact inputs from executives ──
      const contactInputs: ContactInput[] = this.executives.map((exec) => {
        if (exec.nameRomaji) {
          const parts = exec.nameRomaji.trim().toLowerCase().split(/\s+/);
          return {
            firstName: parts.length >= 2 ? parts.slice(1).join("") : parts[0],
            lastName: parts.length >= 2 ? parts[0] : "",
            jobTitle: exec.title,
          };
        }
        const [lastName, firstName] = parseJapaneseName(exec.name);
        return {
          firstName: firstName || lastName,
          lastName: firstName ? lastName : "",
          jobTitle: exec.title,
        };
      });

      // ── Step 3: Pattern-based email + optional Hunter.io lookup ──
      let emailResults: EmailFinderResult[] = [];
      if (contactInputs.length > 0) {
        emailResults = await emailFinder.findEmails(domain, contactInputs);
      }

      // ── Step 4: Google Search for specific person emails ──
      // For executives whose pattern generation returned nothing (e.g. Japanese names)
      const personSearchResults: Array<{
        index: number;
        email: string;
        confidence: number;
      }> = [];

      for (let i = 0; i < this.executives.length; i++) {
        if (!emailResults[i]?.email) {
          const exec = this.executives[i];
          try {
            const found = await webDiscovery.findPersonEmail(
              domain,
              exec.name,
              ctx.companyName,
            );
            if (found) {
              personSearchResults.push({
                index: i,
                email: found.email,
                confidence: found.confidence,
              });
            }
          } catch {
            // Person search failed — continue
          }
        }
      }

      // ── Step 5: Merge all results ──
      const contacts: ContactInfo[] = this.executives.map((exec, index) => {
        // Priority: pattern/Hunter result > Google person search > none
        const emailResult = emailResults[index];
        const personSearch = personSearchResults.find(
          (p) => p.index === index,
        );

        if (emailResult?.email) {
          return {
            personName: exec.name,
            jobTitle: exec.title,
            department: exec.department,
            email: emailResult.email,
            emailConfidence: emailResult.confidence,
            emailSource: emailResult.source,
          };
        }

        if (personSearch) {
          return {
            personName: exec.name,
            jobTitle: exec.title,
            department: exec.department,
            email: personSearch.email,
            emailConfidence: personSearch.confidence,
            emailSource: "hp" as const,
          };
        }

        return {
          personName: exec.name,
          jobTitle: exec.title,
          department: exec.department,
        };
      });

      const existingEmails = new Set(
        contacts.map((c) => c.email).filter(Boolean),
      );

      // Add emails from web domain discovery
      for (const webEmail of webEmails) {
        if (!existingEmails.has(webEmail.email)) {
          contacts.push({
            personName: webEmail.context ?? "（Web検索より）",
            email: webEmail.email,
            emailConfidence: webEmail.confidence,
            emailSource: "hp",
          });
          existingEmails.add(webEmail.email);
        }
      }

      // Also try Hunter.io domain-wide search (if API key is available)
      try {
        const domainEmails = await emailFinder.findDomainEmails(domain);
        for (const domainEmail of domainEmails.emails) {
          if (domainEmail.email && !existingEmails.has(domainEmail.email)) {
            contacts.push({
              personName: [domainEmail.firstName, domainEmail.lastName]
                .filter(Boolean)
                .join(" "),
              email: domainEmail.email,
              emailConfidence: domainEmail.confidence / 100,
              emailSource: "api",
              jobTitle: domainEmail.position ?? undefined,
            });
            existingEmails.add(domainEmail.email);
          }
        }
      } catch {
        // Hunter.io domain search failed — not critical
      }

      // Merge with existing contacts from other tasks
      for (const existing of this.existingContacts) {
        if (existing.email && !existingEmails.has(existing.email)) {
          contacts.push(existing);
          existingEmails.add(existing.email);
        } else if (
          !existing.email &&
          !contacts.some((c) => c.personName === existing.personName)
        ) {
          contacts.push(existing);
        }
      }

      // ── Fallback: generate generic department emails ──
      if (contacts.filter((c) => c.email).length === 0) {
        const genericAddresses: Array<{
          prefix: string;
          label: string;
          confidence: number;
        }> = [
          { prefix: "info", label: "代表（info）", confidence: 0.4 },
          { prefix: "contact", label: "問い合わせ（contact）", confidence: 0.35 },
          { prefix: "sales", label: "営業部（sales）", confidence: 0.3 },
          { prefix: "support", label: "サポート（support）", confidence: 0.25 },
        ];

        for (const addr of genericAddresses) {
          const email = `${addr.prefix}@${domain}`;
          if (!existingEmails.has(email)) {
            contacts.push({
              personName: addr.label,
              email,
              emailConfidence: addr.confidence,
              emailSource: "pattern",
              jobTitle: "部門代表",
            });
            existingEmails.add(email);
          }
        }
      }

      return {
        taskType: this.type,
        success: true,
        data: contacts,
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
