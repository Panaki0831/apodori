import { Hono } from "hono";
import type { ApiResponse } from "@sales-ai/core";

const health = new Hono();

interface HealthStatus {
  status: "ok" | "degraded" | "error";
  timestamp: string;
}

health.get("/api/health", (c) => {
  const body: ApiResponse<HealthStatus> = {
    success: true,
    data: {
      status: "ok",
      timestamp: new Date().toISOString(),
    },
  };
  return c.json(body);
});

export default health;
