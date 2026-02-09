import { Hono } from "hono";
import { loadConfig } from "@sales-ai/core";
import type {
  ApiResponse,
  CompanyInfo,
  CompanyDetailInfo,
  ContactInfo,
} from "@sales-ai/core";
import { ResultStore } from "@sales-ai/worker";

// ============================================================
// Redis result store (reads results written by the worker)
// ============================================================

const config = loadConfig();
const resultStore = new ResultStore(config.redis.url);

// ============================================================
// Helper: convert a raw Redis result to the frontend Company shape
// ============================================================

interface RedisCompanyResult {
  companyInfo?: CompanyInfo;
  contacts?: ContactInfo[];
  details?: CompanyDetailInfo;
  _companyId?: string;
  _jobId?: string;
  _savedAt?: string;
}

function toFrontendCompany(raw: RedisCompanyResult) {
  const info = raw.companyInfo ?? ({} as CompanyInfo);
  const detail = raw.details ?? ({} as CompanyDetailInfo);
  const contacts = raw.contacts ?? [];
  const id = raw._companyId ?? "unknown";

  return {
    id,
    name: info.name ?? "Unknown",
    url: info.url,
    address: info.address,
    phone: info.phone,
    industry: info.industry,
    employeeCount: info.employeeCount,
    description: info.businessDescription,
    contacts: contacts.map((ct: ContactInfo, i: number) => ({
      id: `${id}-ct-${i}`,
      name: ct.personName,
      email: ct.email ?? "",
      confidence: ct.emailConfidence ?? 0,
      title: ct.jobTitle,
      department: ct.department,
      source: ct.emailSource,
    })),
    news: detail.recentNews?.map((n) => ({
      title: n.title,
      url: n.url,
      date: n.date ?? "",
      summary: n.summary,
    })),
    competitors: detail.competitors?.map((comp) => ({
      name: comp.name,
      url: comp.url,
      description: comp.differentiator,
    })),
  };
}

// ============================================================
// Routes
// ============================================================

const companies = new Hono();

/**
 * GET /api/companies - List collected companies from Redis
 */
companies.get("/api/companies", async (c) => {
  const search = c.req.query("search")?.toLowerCase();

  const allResults = await resultStore.getAllCompanyResults();

  let companyList = allResults.map((r) =>
    toFrontendCompany(r as unknown as RedisCompanyResult),
  );

  if (search) {
    companyList = companyList.filter((company) =>
      company.name.toLowerCase().includes(search),
    );
  }

  const resp: ApiResponse<typeof companyList> = {
    success: true,
    data: companyList,
  };

  return c.json(resp);
});

/**
 * GET /api/companies/:id - Get company details from Redis
 */
companies.get("/api/companies/:id", async (c) => {
  const id = c.req.param("id");
  const raw = await resultStore.getCompanyResult(id);

  if (!raw) {
    const errorResp: ApiResponse<never> = {
      success: false,
      error: `Company not found: ${id}`,
    };
    return c.json(errorResp, 404);
  }

  const company = toFrontendCompany(raw as unknown as RedisCompanyResult);

  const resp: ApiResponse<typeof company> = {
    success: true,
    data: company,
  };

  return c.json(resp);
});

/**
 * GET /api/companies/:id/contacts - Get contacts for a specific company
 */
companies.get("/api/companies/:id/contacts", async (c) => {
  const id = c.req.param("id");
  const raw = await resultStore.getCompanyResult(id);

  if (!raw) {
    const errorResp: ApiResponse<never> = {
      success: false,
      error: `Company not found: ${id}`,
    };
    return c.json(errorResp, 404);
  }

  const result = raw as unknown as RedisCompanyResult;
  const contacts = result.contacts ?? [];

  const resp: ApiResponse<ContactInfo[]> = {
    success: true,
    data: contacts,
  };

  return c.json(resp);
});

/**
 * GET /api/export - Export results as CSV or JSON
 */
companies.get("/api/export", async (c) => {
  const format = c.req.query("format") || "json";

  const allResults = await resultStore.getAllCompanyResults();
  const exportCompanies = allResults.map(
    (r) => r as unknown as RedisCompanyResult,
  );

  const exportRows = exportCompanies.flatMap((result) => {
    const info = result.companyInfo ?? ({} as CompanyInfo);
    const detail = result.details ?? ({} as CompanyDetailInfo);
    const contacts = result.contacts ?? [];

    if (contacts.length === 0) {
      return [
        {
          company_name: info.name ?? "",
          company_url: info.url || "",
          industry: info.industry || "",
          employee_count: info.employeeCount ?? "",
          address: info.address || "",
          representative: info.representative || "",
          business_description: info.businessDescription || "",
          revenue: detail.revenue || "",
          growth_rate: detail.growthRate || "",
          contact_form_url: detail.contactFormUrl || "",
          contact_name: "",
          contact_email: "",
          contact_title: "",
          contact_department: "",
          email_confidence: "",
          email_source: "",
        },
      ];
    }

    return contacts.map((contact: ContactInfo) => ({
      company_name: info.name ?? "",
      company_url: info.url || "",
      industry: info.industry || "",
      employee_count: info.employeeCount ?? "",
      address: info.address || "",
      representative: info.representative || "",
      business_description: info.businessDescription || "",
      revenue: detail.revenue || "",
      growth_rate: detail.growthRate || "",
      contact_form_url: detail.contactFormUrl || "",
      contact_name: contact.personName,
      contact_email: contact.email || "",
      contact_title: contact.jobTitle || "",
      contact_department: contact.department || "",
      email_confidence: contact.emailConfidence ?? "",
      email_source: contact.emailSource || "",
    }));
  });

  if (format === "csv") {
    if (exportRows.length === 0) {
      return c.text("", 200);
    }

    const headers = Object.keys(exportRows[0]);
    const csvLines = [
      headers.join(","),
      ...exportRows.map((row) =>
        headers
          .map((h) => {
            const value = String(row[h as keyof typeof row]);
            if (
              value.includes(",") ||
              value.includes('"') ||
              value.includes("\n")
            ) {
              return `"${value.replace(/"/g, '""')}"`;
            }
            return value;
          })
          .join(","),
      ),
    ];

    c.header("Content-Type", "text/csv; charset=utf-8");
    c.header("Content-Disposition", "attachment; filename=export.csv");
    return c.text(csvLines.join("\n"));
  }

  const resp: ApiResponse<typeof exportRows> = {
    success: true,
    data: exportRows,
  };

  return c.json(resp);
});

export default companies;
