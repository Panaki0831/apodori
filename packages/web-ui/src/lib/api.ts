export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

export interface ApiResponse<T> {
  data: T;
  ok: boolean;
  status: number;
  error?: string;
}

export async function fetchApi<T>(
  path: string,
  options?: RequestInit,
): Promise<ApiResponse<T>> {
  const url = `${API_BASE}${path}`;

  try {
    const res = await fetch(url, {
      headers: {
        "Content-Type": "application/json",
        ...(options?.headers as Record<string, string>),
      },
      ...options,
    });

    if (!res.ok) {
      const body = await res.text();
      return {
        data: null as unknown as T,
        ok: false,
        status: res.status,
        error: body || res.statusText,
      };
    }

    const json = await res.json();

    // The API server wraps responses in { success, data, error }.
    // Unwrap the envelope so callers receive the inner payload directly.
    if (json && typeof json === "object" && "success" in json) {
      if (json.success) {
        return { data: json.data as T, ok: true, status: res.status };
      }
      return {
        data: null as unknown as T,
        ok: false,
        status: res.status,
        error: json.error ?? "Unknown server error",
      };
    }

    // Fallback: response is not in the envelope format
    return { data: json as T, ok: true, status: res.status };
  } catch (err) {
    return {
      data: null as unknown as T,
      ok: false,
      status: 0,
      error: err instanceof Error ? err.message : "Network error",
    };
  }
}

/* ── Common domain types used across pages ── */

export interface Job {
  id: string;
  status: "pending" | "running" | "completed" | "failed";
  totalCompanies: number;
  completedCompanies: number;
  failedCompanies: number;
  createdAt: string;
  updatedAt: string;
  companies?: CompanySummary[];
}

export interface CompanySummary {
  id: string;
  name: string;
  url?: string;
  tasksCompleted: number;
  tasksFailed: number;
  tasksTotal: number;
}

export interface Company {
  id: string;
  name: string;
  url?: string;
  address?: string;
  phone?: string;
  industry?: string;
  employeeCount?: number;
  description?: string;
  contacts: Contact[];
  news?: NewsItem[];
  competitors?: Competitor[];
}

export interface Contact {
  id: string;
  name: string;
  email: string;
  confidence: number;
  title?: string;
  department?: string;
  source?: string;
}

export interface NewsItem {
  title: string;
  url: string;
  date: string;
  summary?: string;
}

export interface Competitor {
  name: string;
  url?: string;
  description?: string;
}
