import type {
  CorporateSiteResult,
  ContactInfo,
  RecruitmentResult,
  NewsItem,
  CompanyDetailInfo,
  ExecutiveInfo,
} from "@sales-ai/core";
import { extractJsonFromText, safeJsonParse } from "@sales-ai/core";
import type { LlmClient } from "./llm-client.js";
import {
  EXTRACT_COMPANY_INFO,
  FIND_CONTACT_PERSON,
  EXTRACT_RECRUITMENT_INFO,
  EXTRACT_NEWS,
  ANALYZE_COMPANY,
} from "./prompts/index.js";

// ============================================================
// Raw LLM response shapes (before mapping to core types)
// ============================================================

interface RawCompanyInfo {
  company_name?: string | null;
  representative?: string | null;
  representative_romaji?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  business_description?: string | null;
  industry?: string | null;
  employee_count?: string | number | null;
  executives?: {
    name: string;
    name_romaji?: string;
    title: string;
    department?: string;
  }[];
  contact_form_url?: string | null;
}

interface RawContact {
  name: string;
  name_romaji?: string;
  title: string;
  department?: string;
  email?: string;
  linkedin_url?: string;
}

interface RawRecruitment {
  positions?: {
    title: string;
    department?: string;
    description?: string;
    source: string;
  }[];
  recruiterName?: string | null;
  recruiterEmail?: string | null;
  organizationGrowth?: string | null;
}

interface RawNewsItem {
  title: string;
  date?: string | null;
  summary?: string | null;
  mentionedPeople?: { name: string; title?: string }[];
}

interface RawCompanyAnalysis {
  revenue?: string | null;
  profit?: string | null;
  growthRate?: string | null;
  challenges?: string | null;
  competitors?: { name: string; url?: string; differentiator?: string }[];
  recentNews?: { title: string; url: string; date?: string; summary?: string }[];
  certifications?: string[];
  contactFormUrl?: string | null;
}

// ============================================================
// Public extraction functions
// ============================================================

/**
 * HTMLから企業の基本情報を抽出する。
 */
export async function extractCompanyInfo(
  llm: LlmClient,
  html: string,
): Promise<CorporateSiteResult> {
  const template = EXTRACT_COMPANY_INFO;

  const response = await llm.call({
    provider: template.provider,
    model: template.model,
    systemPrompt: template.systemPrompt,
    userPrompt: html,
    maxTokens: 4096,
    temperature: 0,
  });

  const jsonStr = extractJsonFromText(response.content);
  const raw = safeJsonParse<RawCompanyInfo>(jsonStr);

  if (!raw) {
    return { executives: [] };
  }

  const executives: ExecutiveInfo[] = (raw.executives ?? []).map((e) => ({
    name: e.name,
    nameRomaji: e.name_romaji ?? undefined,
    title: e.title,
    department: e.department,
  }));

  // Store extra fields that the CorporateSiteResult type doesn't carry natively.
  // The pipeline reads them via type casts.
  const extras: Record<string, unknown> = {};
  if (raw.representative_romaji) {
    extras._representativeRomaji = raw.representative_romaji;
  }
  if (raw.industry) {
    extras._industry = raw.industry;
  }
  if (raw.employee_count) {
    const n =
      typeof raw.employee_count === "number"
        ? raw.employee_count
        : parseInt(String(raw.employee_count).replace(/[^0-9]/g, ""), 10);
    if (n && !isNaN(n)) extras._employeeCount = n;
  }

  const result: CorporateSiteResult = {
    companyName: raw.company_name ?? undefined,
    representative: raw.representative ?? undefined,
    address: raw.address ?? undefined,
    phone: raw.phone ?? undefined,
    email: raw.email ?? undefined,
    businessDescription: raw.business_description ?? undefined,
    executives,
    contactFormUrl: raw.contact_form_url ?? undefined,
  };

  // Attach extra fields so the pipeline can read them
  Object.assign(result, extras);

  return result;
}

/**
 * テキストからキーパーソン（意思決定者）の連絡先を抽出する。
 */
export async function extractContacts(
  llm: LlmClient,
  text: string,
  companyName: string,
): Promise<ContactInfo[]> {
  const template = FIND_CONTACT_PERSON;

  const userPrompt = `企業名: ${companyName}\n\n以下のテキストからキーパーソンを特定してください:\n\n${text}`;

  const response = await llm.call({
    provider: template.provider,
    model: template.model,
    systemPrompt: template.systemPrompt,
    userPrompt,
    maxTokens: 4096,
    temperature: 0,
  });

  const jsonStr = extractJsonFromText(response.content);
  const raw = safeJsonParse<RawContact[]>(jsonStr);

  if (!raw || !Array.isArray(raw)) {
    return [];
  }

  return raw.map((c) => ({
    personName: c.name,
    personNameReading: c.name_romaji,
    jobTitle: c.title,
    department: c.department,
    email: c.email,
    emailSource: c.email
      ? ("hp" as const)
      : c.linkedin_url
        ? ("linkedin" as const)
        : undefined,
    linkedinUrl: c.linkedin_url,
  }));
}

/**
 * HTMLから採用情報を抽出する。
 */
export async function extractRecruitmentInfo(
  llm: LlmClient,
  html: string,
): Promise<RecruitmentResult> {
  const template = EXTRACT_RECRUITMENT_INFO;

  const response = await llm.call({
    provider: template.provider,
    model: template.model,
    systemPrompt: template.systemPrompt,
    userPrompt: html,
    maxTokens: 4096,
    temperature: 0,
  });

  const jsonStr = extractJsonFromText(response.content);
  const raw = safeJsonParse<RawRecruitment>(jsonStr);

  if (!raw) {
    return { positions: [] };
  }

  return {
    positions: (raw.positions ?? []).map((p) => ({
      title: p.title,
      department: p.department,
      description: p.description,
      source: p.source,
    })),
    recruiterName: raw.recruiterName ?? undefined,
    recruiterEmail: raw.recruiterEmail ?? undefined,
    organizationGrowth: raw.organizationGrowth ?? undefined,
  };
}

/**
 * HTMLからニュース・プレスリリース情報を抽出する。
 */
export async function extractNews(
  llm: LlmClient,
  html: string,
): Promise<NewsItem[]> {
  const template = EXTRACT_NEWS;

  const response = await llm.call({
    provider: template.provider,
    model: template.model,
    systemPrompt: template.systemPrompt,
    userPrompt: html,
    maxTokens: 4096,
    temperature: 0,
  });

  const jsonStr = extractJsonFromText(response.content);
  const raw = safeJsonParse<RawNewsItem[]>(jsonStr);

  if (!raw || !Array.isArray(raw)) {
    return [];
  }

  return raw.map((n) => ({
    title: n.title,
    url: "",
    date: n.date ?? undefined,
    summary: n.summary ?? undefined,
  }));
}

/**
 * 企業データから詳細分析を行う。
 */
export async function analyzeCompany(
  llm: LlmClient,
  companyData: string,
): Promise<CompanyDetailInfo> {
  const template = ANALYZE_COMPANY;

  const response = await llm.call({
    provider: template.provider,
    model: template.model,
    systemPrompt: template.systemPrompt,
    userPrompt: companyData,
    maxTokens: 4096,
    temperature: 0,
  });

  const jsonStr = extractJsonFromText(response.content);
  const raw = safeJsonParse<RawCompanyAnalysis>(jsonStr);

  if (!raw) {
    return {};
  }

  return {
    revenue: raw.revenue ?? undefined,
    profit: raw.profit ?? undefined,
    growthRate: raw.growthRate ?? undefined,
    challenges: raw.challenges ?? undefined,
    competitors: raw.competitors?.map((c) => ({
      name: c.name,
      url: c.url,
      differentiator: c.differentiator,
    })),
    recentNews: raw.recentNews?.map((n) => ({
      title: n.title,
      url: n.url,
      date: n.date,
      summary: n.summary,
    })),
    certifications: raw.certifications,
    contactFormUrl: raw.contactFormUrl ?? undefined,
  };
}
