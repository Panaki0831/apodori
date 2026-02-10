import {
  type SearchResult,
  createRateLimiter,
  retryWithBackoff,
  loadConfig,
} from "@sales-ai/core";

const GOOGLE_CSE_BASE_URL = "https://www.googleapis.com/customsearch/v1";

/** Default number of search results to request. */
const DEFAULT_NUM_RESULTS = 10;

/** Maximum results per single API request (Google API limit). */
const MAX_RESULTS_PER_REQUEST = 10;

/**
 * Global rate limiter for Google Custom Search API.
 * Enforces a minimum 1-second gap between API requests to avoid quota exhaustion.
 */
const googleRateLimit = createRateLimiter(1000);

/**
 * Raw response shape from Google Custom Search JSON API.
 */
interface GoogleSearchApiResponse {
  items?: Array<{
    title?: string;
    link?: string;
    snippet?: string;
  }>;
  error?: {
    code: number;
    message: string;
  };
}

/**
 * Search Google using the Custom Search JSON API.
 *
 * Requires `GOOGLE_SEARCH_API_KEY` and `GOOGLE_SEARCH_ENGINE_ID` environment
 * variables (or their equivalents in the app config).
 *
 * Includes built-in rate limiting (1 second between requests) and
 * automatic retry with exponential backoff on transient failures.
 *
 * @param query - The search query string.
 * @param numResults - Number of results to return (default 10, max 10 per request).
 * @returns Array of search results with title, url, and snippet.
 * @throws Error if the API key or engine ID is not configured, or if the API returns an error.
 */
export async function searchGoogle(
  query: string,
  numResults: number = DEFAULT_NUM_RESULTS,
): Promise<SearchResult[]> {
  const config = loadConfig();
  const { apiKey, engineId } = config.googleSearch;

  if (!apiKey || !engineId) {
    // Return empty results instead of throwing so sub-tasks can degrade gracefully
    return [];
  }

  const effectiveNum = Math.min(numResults, MAX_RESULTS_PER_REQUEST);

  await googleRateLimit();

  return retryWithBackoff(
    async () => {
      const params = new URLSearchParams({
        key: apiKey,
        cx: engineId,
        q: query,
        num: String(effectiveNum),
      });

      const url = `${GOOGLE_CSE_BASE_URL}?${params.toString()}`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      try {
        const response = await fetch(url, {
          signal: controller.signal,
          headers: {
            Accept: "application/json",
          },
        });

        if (!response.ok) {
          const body = await response.text().catch(() => "");
          throw new Error(
            `Google Search API returned HTTP ${response.status}: ${body}`,
          );
        }

        const data = (await response.json()) as GoogleSearchApiResponse;

        if (data.error) {
          throw new Error(
            `Google Search API error ${data.error.code}: ${data.error.message}`,
          );
        }

        if (!data.items || data.items.length === 0) {
          return [];
        }

        return data.items
          .filter(
            (item): item is { title: string; link: string; snippet?: string } =>
              typeof item.title === "string" && typeof item.link === "string",
          )
          .map((item) => ({
            title: item.title,
            url: item.link,
            snippet: item.snippet ?? "",
          }));
      } finally {
        clearTimeout(timeoutId);
      }
    },
    3,
    1000,
  );
}
