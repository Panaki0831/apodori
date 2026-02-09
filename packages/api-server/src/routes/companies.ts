import { Hono } from "hono";
import { randomUUID } from "node:crypto";
import type {
  ApiResponse,
  CompanyInfo,
  CompanyDetailInfo,
  ContactInfo,
} from "@sales-ai/core";

// ============================================================
// In-memory storage (MVP)
// TODO: Replace with Prisma database integration
// ============================================================

interface StoredCompany {
  id: string;
  info: CompanyInfo;
  detail: CompanyDetailInfo;
  contacts: ContactInfo[];
  jobId?: string;
  createdAt: Date;
}

/** In-memory company store keyed by company ID */
const companyStore = new Map<string, StoredCompany>();

// Seed some mock data so the API is demonstrable
function seedMockData(): void {
  if (companyStore.size > 0) return;

  const mockCompanies: StoredCompany[] = [
    {
      id: randomUUID(),
      info: {
        name: "Example Corp",
        url: "https://example.com",
        industry: "IT",
        employeeCount: 500,
        address: "Tokyo, Japan",
        representative: "Taro Yamada",
        businessDescription: "Enterprise SaaS solutions",
      },
      detail: {
        revenue: "10B JPY",
        growthRate: "15%",
        contactFormUrl: "https://example.com/contact",
      },
      contacts: [
        {
          personName: "Hanako Suzuki",
          email: "h.suzuki@example.com",
          emailConfidence: 0.9,
          emailSource: "hp",
          jobTitle: "CTO",
          department: "Engineering",
        },
        {
          personName: "Jiro Tanaka",
          email: "j.tanaka@example.com",
          emailConfidence: 0.8,
          emailSource: "pattern",
          jobTitle: "VP Sales",
          department: "Sales",
        },
      ],
      createdAt: new Date(),
    },
    {
      id: randomUUID(),
      info: {
        name: "Sample Inc",
        url: "https://sample.co.jp",
        industry: "Manufacturing",
        employeeCount: 1200,
        address: "Osaka, Japan",
        representative: "Ichiro Sato",
        businessDescription: "Precision manufacturing components",
      },
      detail: {
        revenue: "50B JPY",
        growthRate: "8%",
      },
      contacts: [
        {
          personName: "Yuki Watanabe",
          email: "y.watanabe@sample.co.jp",
          emailConfidence: 0.95,
          emailSource: "hp",
          jobTitle: "Head of Purchasing",
          department: "Procurement",
        },
      ],
      createdAt: new Date(),
    },
  ];

  for (const company of mockCompanies) {
    companyStore.set(company.id, company);
  }
}

// Initialize mock data
seedMockData();

// ============================================================
// Routes
// ============================================================

const companies = new Hono();

/**
 * GET /api/companies - List companies (paginated, searchable)
 *
 * Query params:
 *   page  - Page number (default: 1)
 *   limit - Items per page (default: 20)
 *   search - Filter by company name (partial match)
 */
companies.get("/api/companies", (c) => {
  const page = Math.max(1, parseInt(c.req.query("page") || "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(c.req.query("limit") || "20", 10)));
  const search = c.req.query("search")?.toLowerCase();

  // TODO: Replace with Prisma query
  let allCompanies = Array.from(companyStore.values()).sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  );

  // Apply search filter
  if (search) {
    allCompanies = allCompanies.filter((company) =>
      company.info.name.toLowerCase().includes(search),
    );
  }

  const totalCount = allCompanies.length;
  const totalPages = Math.ceil(totalCount / limit);
  const offset = (page - 1) * limit;
  const pageItems = allCompanies.slice(offset, offset + limit);

  const resp: ApiResponse<{
    companies: Array<{ id: string; info: CompanyInfo; contactCount: number }>;
    pagination: {
      page: number;
      limit: number;
      totalCount: number;
      totalPages: number;
    };
  }> = {
    success: true,
    data: {
      companies: pageItems.map((company) => ({
        id: company.id,
        info: company.info,
        contactCount: company.contacts.length,
      })),
      pagination: {
        page,
        limit,
        totalCount,
        totalPages,
      },
    },
  };

  return c.json(resp);
});

/**
 * GET /api/companies/:id - Get company details
 */
companies.get("/api/companies/:id", (c) => {
  const id = c.req.param("id");
  const company = companyStore.get(id);

  if (!company) {
    const errorResp: ApiResponse<never> = {
      success: false,
      error: `Company not found: ${id}`,
    };
    return c.json(errorResp, 404);
  }

  // TODO: Fetch from Prisma with relations
  const resp: ApiResponse<{
    id: string;
    info: CompanyInfo;
    detail: CompanyDetailInfo;
    contacts: ContactInfo[];
  }> = {
    success: true,
    data: {
      id: company.id,
      info: company.info,
      detail: company.detail,
      contacts: company.contacts,
    },
  };

  return c.json(resp);
});

/**
 * GET /api/companies/:id/contacts - Get contacts for a specific company
 */
companies.get("/api/companies/:id/contacts", (c) => {
  const id = c.req.param("id");
  const company = companyStore.get(id);

  if (!company) {
    const errorResp: ApiResponse<never> = {
      success: false,
      error: `Company not found: ${id}`,
    };
    return c.json(errorResp, 404);
  }

  const resp: ApiResponse<ContactInfo[]> = {
    success: true,
    data: company.contacts,
  };

  return c.json(resp);
});

/**
 * GET /api/export - Export results as CSV or JSON
 *
 * Query params:
 *   jobId  - Filter by job ID (optional)
 *   format - "csv" or "json" (default: "json")
 */
companies.get("/api/export", (c) => {
  const jobId = c.req.query("jobId");
  const format = c.req.query("format") || "json";

  // TODO: Fetch from Prisma, optionally filtered by jobId
  let exportCompanies = Array.from(companyStore.values());

  if (jobId) {
    exportCompanies = exportCompanies.filter((company) => company.jobId === jobId);
  }

  // Build flat export records (one row per contact, with company info repeated)
  const exportRows = exportCompanies.flatMap((company) => {
    if (company.contacts.length === 0) {
      // Include company with no contacts as a single row
      return [
        {
          company_name: company.info.name,
          company_url: company.info.url || "",
          industry: company.info.industry || "",
          employee_count: company.info.employeeCount ?? "",
          address: company.info.address || "",
          representative: company.info.representative || "",
          business_description: company.info.businessDescription || "",
          revenue: company.detail.revenue || "",
          growth_rate: company.detail.growthRate || "",
          contact_form_url: company.detail.contactFormUrl || "",
          contact_name: "",
          contact_email: "",
          contact_title: "",
          contact_department: "",
          email_confidence: "",
          email_source: "",
        },
      ];
    }

    return company.contacts.map((contact) => ({
      company_name: company.info.name,
      company_url: company.info.url || "",
      industry: company.info.industry || "",
      employee_count: company.info.employeeCount ?? "",
      address: company.info.address || "",
      representative: company.info.representative || "",
      business_description: company.info.businessDescription || "",
      revenue: company.detail.revenue || "",
      growth_rate: company.detail.growthRate || "",
      contact_form_url: company.detail.contactFormUrl || "",
      contact_name: contact.personName,
      contact_email: contact.email || "",
      contact_title: contact.jobTitle || "",
      contact_department: contact.department || "",
      email_confidence: contact.emailConfidence ?? "",
      email_source: contact.emailSource || "",
    }));
  });

  if (format === "csv") {
    // Generate CSV string
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
            // Escape values that contain commas, quotes, or newlines
            if (value.includes(",") || value.includes('"') || value.includes("\n")) {
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

  // Default: JSON export
  const resp: ApiResponse<typeof exportRows> = {
    success: true,
    data: exportRows,
  };

  return c.json(resp);
});

export default companies;
