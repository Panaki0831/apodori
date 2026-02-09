import "dotenv/config";
import { serve } from "@hono/node-server";
import { loadConfig } from "@sales-ai/core";
import app from "./app.js";

const config = loadConfig();
const port = config.api.port;

console.log("=".repeat(50));
console.log("  Sales AI Lead Acquisition - API Server");
console.log("=".repeat(50));
console.log(`  Port:        ${port}`);
console.log(`  Environment: ${process.env.NODE_ENV || "development"}`);
console.log(`  Redis:       ${config.redis.url}`);
console.log(`  Database:    ${config.database.url.replace(/\/\/.*@/, "//***@")}`);
console.log("=".repeat(50));

serve(
  {
    fetch: app.fetch,
    port,
  },
  (info) => {
    console.log(`Server listening on http://localhost:${info.port}`);
  },
);
