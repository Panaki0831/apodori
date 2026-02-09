export interface AppConfig {
  database: {
    url: string;
  };
  redis: {
    url: string;
  };
  api: {
    port: number;
  };
  claude: {
    apiKey: string;
  };
  openai: {
    apiKey: string;
  };
  hunterIo: {
    apiKey: string;
  };
  apolloIo: {
    apiKey: string;
  };
  googleSearch: {
    apiKey: string;
    engineId: string;
  };
  gbizinfo: {
    apiKey: string;
  };
  scraping: {
    /** Minimum delay between requests to the same domain (ms) */
    minRequestInterval: number;
    /** Page load timeout (ms) */
    pageTimeout: number;
    /** Max retries per task */
    maxRetries: number;
    /** Respect robots.txt */
    respectRobotsTxt: boolean;
  };
  llm: {
    /** Timeout for LLM API calls (ms) */
    timeout: number;
  };
}

export function loadConfig(): AppConfig {
  return {
    database: {
      url:
        process.env.DATABASE_URL ||
        "postgresql://postgres:postgres@localhost:5432/sales_ai_agent?schema=public",
    },
    redis: {
      url: process.env.REDIS_URL || "redis://localhost:6379",
    },
    api: {
      port: parseInt(process.env.API_PORT || "3000", 10),
    },
    claude: {
      apiKey: process.env.CLAUDE_API_KEY || "",
    },
    openai: {
      apiKey: process.env.OPENAI_API_KEY || "",
    },
    hunterIo: {
      apiKey: process.env.HUNTER_IO_API_KEY || "",
    },
    apolloIo: {
      apiKey: process.env.APOLLO_IO_API_KEY || "",
    },
    googleSearch: {
      apiKey: process.env.GOOGLE_SEARCH_API_KEY || "",
      engineId: process.env.GOOGLE_SEARCH_ENGINE_ID || "",
    },
    gbizinfo: {
      apiKey: process.env.GBIZINFO_API_KEY || "",
    },
    scraping: {
      minRequestInterval: 2000,
      pageTimeout: 30000,
      maxRetries: 3,
      respectRobotsTxt: true,
    },
    llm: {
      timeout: 120000,
    },
  };
}
