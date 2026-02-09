import { Hono } from "hono";
import { cors } from "hono/cors";
import type { ApiResponse } from "@sales-ai/core";
import health from "./routes/health.js";
import jobs from "./routes/jobs.js";
import companies from "./routes/companies.js";

const app = new Hono();

// ============================================================
// Middleware
// ============================================================

// CORS - allow all origins in development
// TODO: Restrict origins in production via config
app.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  }),
);

// ============================================================
// Mount route groups
// ============================================================

app.route("/", health);
app.route("/", jobs);
app.route("/", companies);

// ============================================================
// Global error handler
// ============================================================

app.onError((err, c) => {
  console.error("Unhandled error:", err);

  const status = "status" in err && typeof err.status === "number" ? err.status : 500;

  const errorResp: ApiResponse<never> = {
    success: false,
    error:
      process.env.NODE_ENV === "production"
        ? "Internal server error"
        : err.message || "Internal server error",
  };

  return c.json(errorResp, status as Parameters<typeof c.json>[1]);
});

// ============================================================
// 404 fallback
// ============================================================

app.notFound((c) => {
  const errorResp: ApiResponse<never> = {
    success: false,
    error: `Not found: ${c.req.method} ${c.req.path}`,
  };
  return c.json(errorResp, 404);
});

export default app;
