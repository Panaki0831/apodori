import type {
  TaskResult,
  ContactInfo,
  ExecutiveInfo,
} from "@sales-ai/core";
import { extractDomain, parseJapaneseName } from "@sales-ai/core";
import {
  EmailFinder,
  type ContactInput,
  type EmailFinderResult,
} from "@sales-ai/email-finder";
import type { CollectionTask, TaskContext } from "./base-task.js";

/**
 * Task #11: Contact and email search.
 *
 * Combines contacts discovered from the corporate site crawling (executives,
 * recruiter contacts) with the email-finder package to locate and verify
 * email addresses for key decision-makers.
 */
export class ContactSearchTask implements CollectionTask {
  readonly type = "contact_search" as const;

  private executives: ExecutiveInfo[];
  private existingContacts: ContactInfo[];
  private hunterIoApiKey: string;

  /**
   * @param executives - Executives discovered from the corporate site task.
   * @param existingContacts - Contacts already found from other tasks.
   * @param hunterIoApiKey - API key for Hunter.io email lookups.
   */
  constructor(
    executives: ExecutiveInfo[] = [],
    existingContacts: ContactInfo[] = [],
    hunterIoApiKey: string = "",
  ) {
    this.executives = executives;
    this.existingContacts = existingContacts;
    this.hunterIoApiKey = hunterIoApiKey;
  }

  /**
   * Update executives list before execution (pipeline injects data from
   * earlier tasks).
   */
  setExecutives(executives: ExecutiveInfo[]): void {
    this.executives = executives;
  }

  /**
   * Update existing contacts before execution.
   */
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

      // Build contact inputs from executives.
      // Prefer romaji names (from LLM extraction) for email pattern generation.
      const contactInputs: ContactInput[] = this.executives.map((exec) => {
        if (exec.nameRomaji) {
          // Romaji is available — split "tanaka taro" into last/first
          const parts = exec.nameRomaji.trim().toLowerCase().split(/\s+/);
          return {
            firstName: parts.length >= 2 ? parts.slice(1).join("") : parts[0],
            lastName: parts.length >= 2 ? parts[0] : "",
            jobTitle: exec.title,
          };
        }
        // Fallback: try parsing the Japanese name
        const [lastName, firstName] = parseJapaneseName(exec.name);
        return {
          firstName: firstName || lastName,
          lastName: firstName ? lastName : "",
          jobTitle: exec.title,
        };
      });

      // Find emails for all contacts
      let emailResults: EmailFinderResult[] = [];
      if (contactInputs.length > 0) {
        emailResults = await emailFinder.findEmails(domain, contactInputs);
      }

      // Also try domain-wide email discovery
      const domainEmails = await emailFinder.findDomainEmails(domain);

      // Merge executives with found emails
      const contacts: ContactInfo[] = this.executives.map((exec, index) => {
        const emailResult = emailResults[index];
        return {
          personName: exec.name,
          jobTitle: exec.title,
          department: exec.department,
          email: emailResult?.email,
          emailConfidence: emailResult?.confidence,
          emailSource: emailResult?.source,
        };
      });

      // Add contacts from domain-wide search that are not already present
      const existingEmails = new Set(
        contacts.map((c) => c.email).filter(Boolean),
      );

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

      // Merge with existing contacts from other tasks (avoid duplicates)
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
      // When no specific contacts were found, provide standard
      // departmental addresses as low-confidence leads.
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
