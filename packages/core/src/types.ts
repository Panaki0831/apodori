import { z } from "zod";

// ============================================================
// Task Types
// ============================================================

export const TASK_TYPES = [
  "google_search",
  "corporate_site",
  "recruitment",
  "public_jobs",
  "gbizinfo",
  "ir_report",
  "press_release",
  "company_blog",
  "external_media",
  "competitor_analysis",
  "case_study",
  "contact_search",
  "email_search",
  "executive_search",
] as const;

export type TaskType = (typeof TASK_TYPES)[number];

export const TASK_STATUS = [
  "pending",
  "running",
  "completed",
  "failed",
] as const;
export type TaskStatus = (typeof TASK_STATUS)[number];

export const JOB_STATUS = [
  "pending",
  "running",
  "completed",
  "failed",
] as const;
export type JobStatus = (typeof JOB_STATUS)[number];

// ============================================================
// CSV Import
// ============================================================

export const csvRowSchema = z.object({
  company_name: z.string().min(1, "企業名は必須です"),
  company_url: z.string().url().optional().or(z.literal("")),
  industry: z.string().optional().or(z.literal("")),
  target_department: z.string().optional().or(z.literal("")),
  notes: z.string().optional().or(z.literal("")),
});

export type CsvRow = z.infer<typeof csvRowSchema>;

// ============================================================
// Company Information
// ============================================================

export interface CompanyInfo {
  name: string;
  url?: string;
  industry?: string;
  employeeCount?: number;
  capital?: string;
  corporateNumber?: string;
  address?: string;
  phone?: string;
  representative?: string;
  businessDescription?: string;
  foundedDate?: string;
}

export interface CompanyDetailInfo {
  revenue?: string;
  profit?: string;
  growthRate?: string;
  challenges?: string;
  competitors?: CompetitorInfo[];
  recentNews?: NewsItem[];
  certifications?: string[];
  contactFormUrl?: string;
}

export interface CompetitorInfo {
  name: string;
  url?: string;
  differentiator?: string;
}

export interface NewsItem {
  title: string;
  url: string;
  date?: string;
  summary?: string;
}

// ============================================================
// Contact / Person
// ============================================================

export interface ContactInfo {
  personName: string;
  personNameReading?: string;
  email?: string;
  emailConfidence?: number;
  emailSource?: EmailSource;
  jobTitle?: string;
  department?: string;
  linkedinUrl?: string;
  sourceUrl?: string;
}

export type EmailSource = "hp" | "linkedin" | "api" | "pattern";

export interface ExecutiveInfo {
  name: string;
  /** Romanized name for email pattern generation (e.g. "tanaka taro") */
  nameRomaji?: string;
  title: string;
  department?: string;
}

// ============================================================
// Email Verification
// ============================================================

export interface EmailCandidate {
  email: string;
  pattern: string;
  confidence: number;
}

export interface EmailVerificationResult {
  email: string;
  isValid: boolean | null;
  method: "smtp" | "api" | "pattern";
  details?: Record<string, unknown>;
}

// ============================================================
// Scraping
// ============================================================

export interface ScrapedPageData {
  url: string;
  html: string;
  text: string;
  title?: string;
}

export interface CorporateSiteResult {
  companyName?: string;
  representative?: string;
  address?: string;
  phone?: string;
  email?: string;
  businessDescription?: string;
  executives: ExecutiveInfo[];
  contactFormUrl?: string;
}

export interface RecruitmentResult {
  positions: RecruitmentPosition[];
  recruiterName?: string;
  recruiterEmail?: string;
  organizationGrowth?: string;
}

export interface RecruitmentPosition {
  title: string;
  department?: string;
  description?: string;
  source: string;
}

// ============================================================
// gBizINFO
// ============================================================

export interface GbizInfoResult {
  corporateNumber: string;
  name: string;
  location?: string;
  capital?: string;
  employeeCount?: number;
  dateOfEstablishment?: string;
  certifications?: string[];
}

// ============================================================
// Task Results
// ============================================================

export interface TaskResult {
  taskType: TaskType;
  success: boolean;
  data?: unknown;
  error?: string;
}

// ============================================================
// Collection Job
// ============================================================

export interface CollectionJobInput {
  companies: CsvRow[];
  csvFileName?: string;
}

export interface CollectionJobStatus {
  id: string;
  status: JobStatus;
  totalCount: number;
  doneCount: number;
  failedCount: number;
  startedAt?: Date;
  completedAt?: Date;
}

// ============================================================
// API Responses
// ============================================================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// ============================================================
// Search Results
// ============================================================

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

// ============================================================
// LLM
// ============================================================

export type LlmProvider = "claude" | "openai";

export interface LlmRequest {
  provider: LlmProvider;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  temperature?: number;
}

export interface LlmResponse {
  content: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}
