/**
 * Normalize a company name for search/dedup purposes.
 * Removes common suffixes like 株式会社, (株), etc.
 */
export function normalizeCompanyName(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[（(]株[）)]/g, "")
    .replace(/株式会社/g, "")
    .replace(/有限会社/g, "")
    .replace(/合同会社/g, "")
    .replace(/合資会社/g, "")
    .replace(/一般社団法人/g, "")
    .replace(/一般財団法人/g, "")
    .replace(/公益社団法人/g, "")
    .replace(/公益財団法人/g, "")
    .trim();
}

/**
 * Extract domain from a URL.
 */
export function extractDomain(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.hostname;
  } catch {
    return null;
  }
}

/**
 * Sleep for a given number of milliseconds.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff.
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000,
): Promise<T> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt);
        await sleep(delay);
      }
    }
  }
  throw lastError;
}

/**
 * Truncate text to a maximum length, preserving word boundaries.
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  const truncated = text.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(" ");
  if (lastSpace > maxLength * 0.8) {
    return truncated.slice(0, lastSpace) + "...";
  }
  return truncated + "...";
}

/**
 * Parse a Japanese name into family/given name components.
 * Returns [familyName, givenName] or [fullName, ""] if can't split.
 */
export function parseJapaneseName(
  fullName: string,
): [string, string] {
  const trimmed = fullName.trim();
  // Try splitting by space (full-width or half-width)
  const parts = trimmed.split(/[\s　]+/);
  if (parts.length >= 2) {
    return [parts[0], parts.slice(1).join("")];
  }
  return [trimmed, ""];
}

/**
 * Convert Japanese name to romaji-like format for email pattern generation.
 * This is a simplified version - in production you'd use a proper library.
 */
export function romanizeSimple(text: string): string {
  // This would need a real romanization library like kuroshiro
  // For now, return the text as-is (assumes already romanized for pattern generation)
  return text.toLowerCase().replace(/\s+/g, "");
}

/**
 * Deduplicate an array of objects by a key.
 */
export function deduplicateBy<T>(
  items: T[],
  keyFn: (item: T) => string,
): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = keyFn(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Safely parse JSON, returning null on failure.
 */
export function safeJsonParse<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/**
 * Extract JSON from LLM text response that may contain markdown code blocks.
 */
export function extractJsonFromText(text: string): string {
  // Try to find JSON in markdown code blocks
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim();
  }
  // Try to find raw JSON (object or array)
  const jsonMatch = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (jsonMatch) {
    return jsonMatch[1].trim();
  }
  return text.trim();
}

/**
 * Create a rate limiter that ensures a minimum delay between calls.
 */
export function createRateLimiter(minIntervalMs: number) {
  let lastCallTime = 0;
  return async function rateLimit(): Promise<void> {
    const now = Date.now();
    const elapsed = now - lastCallTime;
    if (elapsed < minIntervalMs) {
      await sleep(minIntervalMs - elapsed);
    }
    lastCallTime = Date.now();
  };
}
