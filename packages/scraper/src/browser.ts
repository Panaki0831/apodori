import { chromium, type Browser, type Page } from "playwright";
import { loadConfig } from "@sales-ai/core";

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const DEFAULT_VIEWPORT = { width: 1280, height: 800 };

/**
 * Manages a Playwright Chromium browser instance.
 * Lazily initializes the browser on first use and reuses it across calls.
 */
export class BrowserManager {
  private browser: Browser | null = null;
  private pageTimeout: number;

  constructor(pageTimeout?: number) {
    const config = loadConfig();
    this.pageTimeout = pageTimeout ?? config.scraping.pageTimeout;
  }

  /**
   * Lazily launch the browser if it hasn't been started yet.
   */
  private async ensureBrowser(): Promise<Browser> {
    if (!this.browser || !this.browser.isConnected()) {
      this.browser = await chromium.launch({
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
        ],
      });
    }
    return this.browser;
  }

  /**
   * Create a new browser page with preconfigured settings.
   * - Custom user agent
   * - Viewport set to 1280x800
   * - Images and fonts blocked for faster loading
   * - Navigation timeout applied from config
   */
  async getPage(): Promise<Page> {
    const browser = await this.ensureBrowser();
    const context = await browser.newContext({
      userAgent: DEFAULT_USER_AGENT,
      viewport: DEFAULT_VIEWPORT,
      ignoreHTTPSErrors: true,
    });

    const page = await context.newPage();

    // Block images, fonts, and media to speed up page loads
    await page.route("**/*", (route) => {
      const resourceType = route.request().resourceType();
      if (["image", "font", "media"].includes(resourceType)) {
        return route.abort();
      }
      return route.continue();
    });

    page.setDefaultNavigationTimeout(this.pageTimeout);
    page.setDefaultTimeout(this.pageTimeout);

    return page;
  }

  /**
   * Close the browser and release all resources.
   */
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}
