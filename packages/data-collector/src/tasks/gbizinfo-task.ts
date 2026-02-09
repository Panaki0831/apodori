import type { TaskResult, GbizInfoResult } from "@sales-ai/core";
import { loadConfig } from "@sales-ai/core";
import type { CollectionTask, TaskContext } from "./base-task.js";

/**
 * Raw response shape from the gBizINFO API.
 */
interface GbizApiResponse {
  "hojin-infos"?: GbizHojinInfo[];
  totalCount?: number;
  errors?: Array<{ message: string }>;
}

interface GbizHojinInfo {
  "corporate_number"?: string;
  name?: string;
  location?: string;
  capital_stock?: string;
  employee_number?: string;
  date_of_establishment?: string;
  certification?: Array<{
    title?: string;
  }>;
}

const GBIZINFO_API_BASE = "https://info.gbiz.go.jp/hojin/v1/hojin";

/**
 * Task #5: gBizINFO API lookup.
 *
 * Queries the Japanese government's gBizINFO API to retrieve official
 * corporate data such as the corporate number, location, capital, and
 * employee count.
 */
export class GbizInfoTask implements CollectionTask {
  readonly type = "gbizinfo" as const;

  async execute(ctx: TaskContext): Promise<TaskResult> {
    try {
      const config = loadConfig();
      const apiKey = config.gbizinfo.apiKey;

      if (!apiKey) {
        return {
          taskType: this.type,
          success: false,
          error:
            "gBizINFO API key is not configured. Set GBIZINFO_API_KEY environment variable.",
        };
      }

      const params = new URLSearchParams({
        name: ctx.companyName,
      });

      const url = `${GBIZINFO_API_BASE}?${params.toString()}`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      try {
        const response = await fetch(url, {
          signal: controller.signal,
          headers: {
            Accept: "application/json",
            "X-hojinInfo-api-token": apiKey,
          },
        });

        if (!response.ok) {
          const body = await response.text().catch(() => "");
          throw new Error(
            `gBizINFO API returned HTTP ${response.status}: ${body}`,
          );
        }

        const data = (await response.json()) as GbizApiResponse;

        if (data.errors && data.errors.length > 0) {
          throw new Error(
            `gBizINFO API error: ${data.errors.map((e) => e.message).join(", ")}`,
          );
        }

        const hojinList = data["hojin-infos"] ?? [];

        if (hojinList.length === 0) {
          return {
            taskType: this.type,
            success: true,
            data: null,
          };
        }

        // Use the first matching company
        const hojin = hojinList[0];

        const gbizResult: GbizInfoResult = {
          corporateNumber: hojin["corporate_number"] ?? "",
          name: hojin.name ?? ctx.companyName,
          location: hojin.location ?? undefined,
          capital: hojin.capital_stock ?? undefined,
          employeeCount: hojin.employee_number
            ? parseInt(hojin.employee_number, 10) || undefined
            : undefined,
          dateOfEstablishment: hojin.date_of_establishment ?? undefined,
          certifications: hojin.certification
            ?.map((c) => c.title)
            .filter((t): t is string => !!t),
        };

        return {
          taskType: this.type,
          success: true,
          data: gbizResult,
        };
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (error) {
      return {
        taskType: this.type,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
