import type {
  AppConfig,
  TaskResult,
  CompanyInfo,
  CompanyDetailInfo,
  ContactInfo,
  CorporateSiteResult,
  RecruitmentResult,
  GbizInfoResult,
  NewsItem,
  CompetitorInfo,
  SearchResult,
  ExecutiveInfo,
} from "@sales-ai/core";
import type { LlmClient } from "@sales-ai/ai-engine";
import type { DiscoveredPages } from "@sales-ai/scraper";
import type { CollectionTask, TaskContext } from "./tasks/base-task.js";
import { GoogleSearchTask } from "./tasks/google-search-task.js";
import { CorporateSiteTask } from "./tasks/corporate-site-task.js";
import { RecruitmentTask } from "./tasks/recruitment-task.js";
import { GbizInfoTask } from "./tasks/gbizinfo-task.js";
import { IrReportTask } from "./tasks/ir-report-task.js";
import { PressReleaseTask } from "./tasks/press-release-task.js";
import { MediaTask } from "./tasks/media-task.js";
import { CompetitorTask } from "./tasks/competitor-task.js";
import { ContactSearchTask } from "./tasks/contact-search-task.js";

// ============================================================
// Pipeline Result
// ============================================================

export interface PipelineResult {
  companyInfo: CompanyInfo;
  contacts: ContactInfo[];
  details: CompanyDetailInfo;
  taskResults: TaskResult[];
}

// ============================================================
// Collection Pipeline
// ============================================================

/**
 * Orchestrates all data collection tasks for a single company.
 *
 * The pipeline runs the Google search task first to resolve the company URL,
 * then runs all remaining tasks in parallel. Results from earlier tasks
 * are injected into later tasks (e.g. executives into the contact search,
 * aggregated info into competitor analysis).
 */
export class CollectionPipeline {
  private readonly llm: LlmClient;
  private readonly config: AppConfig;

  constructor(llm: LlmClient, config: AppConfig) {
    this.llm = llm;
    this.config = config;
  }

  /**
   * Execute the full data collection pipeline for a company.
   *
   * @param companyName - The company name to research.
   * @param companyUrl - Optional known company URL (skips URL discovery).
   * @param industry - Optional industry classification for context.
   * @returns Aggregated pipeline results.
   */
  async executeForCompany(
    companyName: string,
    companyUrl?: string,
    industry?: string,
  ): Promise<PipelineResult> {
    const taskResults: TaskResult[] = [];

    // Build the task context (URL may be updated after google search)
    const ctx: TaskContext = {
      companyName,
      companyUrl,
      industry,
      llm: this.llm,
    };

    // ---------------------------------------------------------------
    // Phase 1: Google search to resolve the company URL
    // ---------------------------------------------------------------
    const googleTask = new GoogleSearchTask();
    const googleResult = await googleTask.execute(ctx);
    taskResults.push(googleResult);

    // Update context with discovered URL
    if (googleResult.success && googleResult.data) {
      const googleData = googleResult.data as {
        officialUrl?: string;
        searchResults?: SearchResult[];
      };
      if (!ctx.companyUrl && googleData.officialUrl) {
        ctx.companyUrl = googleData.officialUrl;
      }
    }

    // ---------------------------------------------------------------
    // Phase 2: Run all remaining tasks in parallel
    // ---------------------------------------------------------------
    const competitorTask = new CompetitorTask();
    const contactSearchTask = new ContactSearchTask(
      [],
      [],
      this.config.hunterIo.apiKey,
    );

    const parallelTasks: CollectionTask[] = [
      new CorporateSiteTask(),
      new RecruitmentTask(),
      new GbizInfoTask(),
      new IrReportTask(),
      new PressReleaseTask(),
      new MediaTask(),
    ];

    const parallelResults = await Promise.allSettled(
      parallelTasks.map((task) => task.execute(ctx)),
    );

    for (const result of parallelResults) {
      if (result.status === "fulfilled") {
        taskResults.push(result.value);
      } else {
        // This shouldn't happen since tasks handle errors internally,
        // but handle it defensively
        taskResults.push({
          taskType: "google_search",
          success: false,
          error: result.reason instanceof Error
            ? result.reason.message
            : String(result.reason),
        });
      }
    }

    // ---------------------------------------------------------------
    // Phase 3: Extract data from task results for dependent tasks
    // ---------------------------------------------------------------
    const corporateSiteResult = this.findTaskData<{
      companyInfo?: CorporateSiteResult;
      discoveredPages?: DiscoveredPages;
    }>(taskResults, "corporate_site");

    const recruitmentResult = this.findTaskData<RecruitmentResult>(
      taskResults,
      "recruitment",
    );

    const gbizResult = this.findTaskData<GbizInfoResult>(
      taskResults,
      "gbizinfo",
    );

    const irResult = this.findTaskData<{
      revenue?: string;
      profit?: string;
      growthRate?: string;
    }>(taskResults, "ir_report");

    const pressReleaseResult = this.findTaskData<NewsItem[]>(
      taskResults,
      "press_release",
    );

    const mediaResult = this.findTaskData<{
      blogArticles?: NewsItem[];
      mediaCoverage?: NewsItem[];
    }>(taskResults, "company_blog");

    // Collect executives from the corporate site crawl
    const executives: ExecutiveInfo[] =
      corporateSiteResult?.companyInfo?.executives ?? [];

    // Build aggregated info string for competitor analysis
    const aggregatedInfo = this.buildAggregatedInfo({
      companyName,
      industry,
      corporateSite: corporateSiteResult?.companyInfo,
      gbiz: gbizResult,
      ir: irResult,
      recruitment: recruitmentResult,
    });

    // ---------------------------------------------------------------
    // Phase 4: Run dependent tasks (competitor analysis, contact search)
    // ---------------------------------------------------------------
    competitorTask.setCollectedInfo(aggregatedInfo);

    // Collect any contacts found so far (from corporate site, recruitment)
    const existingContacts: ContactInfo[] = [];
    if (recruitmentResult?.recruiterName) {
      existingContacts.push({
        personName: recruitmentResult.recruiterName,
        email: recruitmentResult.recruiterEmail,
        emailSource: recruitmentResult.recruiterEmail ? "hp" : undefined,
        jobTitle: "採用担当",
      });
    }

    contactSearchTask.setExecutives(executives);
    contactSearchTask.setExistingContacts(existingContacts);

    const [competitorResult, contactResult] = await Promise.allSettled([
      competitorTask.execute(ctx),
      contactSearchTask.execute(ctx),
    ]);

    if (competitorResult.status === "fulfilled") {
      taskResults.push(competitorResult.value);
    }
    if (contactResult.status === "fulfilled") {
      taskResults.push(contactResult.value);
    }

    // ---------------------------------------------------------------
    // Phase 5: Merge all results into the final pipeline result
    // ---------------------------------------------------------------
    const companyInfo = this.buildCompanyInfo(
      companyName,
      ctx.companyUrl,
      industry,
      corporateSiteResult?.companyInfo,
      gbizResult,
    );

    const contacts = this.extractContacts(taskResults);

    const details = this.buildCompanyDetails(
      irResult,
      pressReleaseResult,
      mediaResult,
      competitorResult.status === "fulfilled"
        ? competitorResult.value
        : undefined,
    );

    return {
      companyInfo,
      contacts,
      details,
      taskResults,
    };
  }

  // ================================================================
  // Private helpers
  // ================================================================

  /**
   * Find data from a specific task type in the results array.
   */
  private findTaskData<T>(
    results: TaskResult[],
    taskType: string,
  ): T | undefined {
    const result = results.find(
      (r) => r.taskType === taskType && r.success && r.data,
    );
    return result?.data as T | undefined;
  }

  /**
   * Build aggregated information string for the LLM to analyze.
   */
  private buildAggregatedInfo(params: {
    companyName: string;
    industry?: string;
    corporateSite?: CorporateSiteResult;
    gbiz?: GbizInfoResult;
    ir?: { revenue?: string; profit?: string; growthRate?: string };
    recruitment?: RecruitmentResult;
  }): string {
    const lines: string[] = [];

    lines.push(`企業名: ${params.companyName}`);
    if (params.industry) lines.push(`業種: ${params.industry}`);

    if (params.corporateSite) {
      const cs = params.corporateSite;
      if (cs.businessDescription)
        lines.push(`事業内容: ${cs.businessDescription}`);
      if (cs.representative) lines.push(`代表者: ${cs.representative}`);
      if (cs.address) lines.push(`所在地: ${cs.address}`);
    }

    if (params.gbiz) {
      const g = params.gbiz;
      if (g.capital) lines.push(`資本金: ${g.capital}`);
      if (g.employeeCount) lines.push(`従業員数: ${g.employeeCount}`);
      if (g.dateOfEstablishment) lines.push(`設立日: ${g.dateOfEstablishment}`);
      if (g.certifications && g.certifications.length > 0) {
        lines.push(`認証: ${g.certifications.join(", ")}`);
      }
    }

    if (params.ir) {
      if (params.ir.revenue) lines.push(`売上高: ${params.ir.revenue}`);
      if (params.ir.profit) lines.push(`利益: ${params.ir.profit}`);
      if (params.ir.growthRate)
        lines.push(`成長率: ${params.ir.growthRate}`);
    }

    if (params.recruitment) {
      const r = params.recruitment;
      if (r.positions.length > 0) {
        lines.push(
          `募集ポジション数: ${r.positions.length}`,
        );
        lines.push(
          `募集例: ${r.positions
            .slice(0, 3)
            .map((p) => p.title)
            .join(", ")}`,
        );
      }
      if (r.organizationGrowth)
        lines.push(`組織動向: ${r.organizationGrowth}`);
    }

    return lines.join("\n");
  }

  /**
   * Build the merged CompanyInfo from multiple data sources.
   */
  private buildCompanyInfo(
    companyName: string,
    companyUrl?: string,
    industry?: string,
    corporateSite?: CorporateSiteResult,
    gbiz?: GbizInfoResult,
  ): CompanyInfo {
    return {
      name: corporateSite?.companyName ?? companyName,
      url: companyUrl,
      industry,
      employeeCount: gbiz?.employeeCount,
      capital: gbiz?.capital,
      corporateNumber: gbiz?.corporateNumber,
      address: corporateSite?.address ?? gbiz?.location,
      phone: corporateSite?.phone,
      representative: corporateSite?.representative,
      businessDescription: corporateSite?.businessDescription,
      foundedDate: gbiz?.dateOfEstablishment,
    };
  }

  /**
   * Extract all contacts from task results.
   */
  private extractContacts(taskResults: TaskResult[]): ContactInfo[] {
    const contactResult = taskResults.find(
      (r) => r.taskType === "contact_search" && r.success && r.data,
    );

    if (contactResult?.data && Array.isArray(contactResult.data)) {
      return contactResult.data as ContactInfo[];
    }

    return [];
  }

  /**
   * Build the merged CompanyDetailInfo from multiple data sources.
   */
  private buildCompanyDetails(
    ir?: { revenue?: string; profit?: string; growthRate?: string },
    newsItems?: NewsItem[],
    media?: {
      blogArticles?: NewsItem[];
      mediaCoverage?: NewsItem[];
    },
    competitorResult?: TaskResult,
  ): CompanyDetailInfo {
    const recentNews: NewsItem[] = [];

    if (newsItems && Array.isArray(newsItems)) {
      recentNews.push(...newsItems);
    }

    if (media?.mediaCoverage) {
      recentNews.push(...media.mediaCoverage);
    }

    let competitors: CompetitorInfo[] | undefined;
    let challenges: string | undefined;

    if (
      competitorResult?.success &&
      competitorResult.data
    ) {
      const compData = competitorResult.data as {
        competitors?: CompetitorInfo[];
        challenges?: string;
      };
      competitors = compData.competitors;
      challenges = compData.challenges;
    }

    return {
      revenue: ir?.revenue,
      profit: ir?.profit,
      growthRate: ir?.growthRate,
      challenges,
      competitors,
      recentNews: recentNews.length > 0 ? recentNews : undefined,
    };
  }
}
