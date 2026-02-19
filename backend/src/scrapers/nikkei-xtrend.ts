import { chromium, BrowserContext, Page } from "playwright";
import { ArticleItem } from "../rss/generator";

const BASE_URL = "https://xtrend.nikkei.com";

function parseCookies(
  cookieStr: string,
  domain: string
): Array<{ name: string; value: string; domain: string; path: string }> {
  return cookieStr
    .split(";")
    .map((pair) => pair.trim())
    .filter(Boolean)
    .map((pair) => {
      const idx = pair.indexOf("=");
      if (idx === -1) return null;
      const name = pair.slice(0, idx).trim();
      const value = pair.slice(idx + 1).trim();
      return { name, value, domain, path: "/" };
    })
    .filter(
      (c): c is { name: string; value: string; domain: string; path: string } =>
        c !== null
    );
}

async function expandArticleContent(page: Page): Promise<void> {
  const expandSelectors = [
    'button[class="more"]',
    ".continue-reading",
    '[data-action="expand"]',
    "button.more",
    ".btn-more",
    '[class*="readMore"]',
    '[class*="read-more"]',
  ];

  for (const selector of expandSelectors) {
    try {
      const btn = await page.$(selector);
      if (btn) {
        await btn.click();
        // Wait for button to disappear or content to expand
        await page
          .waitForSelector(selector, { state: "hidden", timeout: 5000 })
          .catch(() => page.waitForTimeout(2000));
        break;
      }
    } catch {
      // try next selector
    }
  }
}

async function extractArticleContent(page: Page): Promise<string> {
  const selectors = [
    ".article-body",
    '[class*="nui-articleBody"]',
    ".cmn-article-body",
    '[class*="articleBody"]',
    ".content-body",
    "article",
    '[data-testid="article-body"]',
    ".article__body",
  ];

  for (const selector of selectors) {
    try {
      const el = await page.$(selector);
      if (el) {
        const html = await el.innerHTML();
        if (html && html.length > 100) return html;
      }
    } catch {
      // try next selector
    }
  }
  return "";
}

interface ArticleLink {
  url: string;
  title: string;
}

async function getArticleLinks(page: Page): Promise<ArticleLink[]> {
  return page.evaluate((baseUrl) => {
    const links: { url: string; title: string }[] = [];
    const anchors = document.querySelectorAll("a[href]");
    for (const a of anchors) {
      const href = (a as HTMLAnchorElement).href;
      // Match article paths like /atcl/... or /contents/...
      if (
        href.startsWith(baseUrl) &&
        (/\/atcl\//.test(href) || /\/contents\//.test(href))
      ) {
        const title =
          (a as HTMLAnchorElement).textContent?.trim() ||
          (a as HTMLAnchorElement).getAttribute("aria-label") ||
          "";
        if (title) {
          links.push({ url: href, title });
        }
      }
    }
    // Deduplicate by URL
    const seen = new Set<string>();
    return links.filter(({ url }) => {
      if (seen.has(url)) return false;
      seen.add(url);
      return true;
    });
  }, BASE_URL);
}

async function scrapeArticle(
  context: BrowserContext,
  link: ArticleLink
): Promise<ArticleItem | null> {
  const page = await context.newPage();
  try {
    await page.goto(link.url, { waitUntil: "networkidle", timeout: 30000 });

    // Check for auth wall
    const currentUrl = page.url();
    if (
      currentUrl.includes("/login") ||
      currentUrl.includes("/signin") ||
      currentUrl.includes("id.nikkei.com")
    ) {
      console.warn(
        `[NikkeiXTrend] Auth redirect for ${link.url} - cookie may be expired`
      );
      return null;
    }

    // Try to expand paywalled content
    await expandArticleContent(page);

    const title = await page
      .$eval(
        'meta[property="og:title"]',
        (el) => el.getAttribute("content") ?? ""
      )
      .catch(() => link.title);

    const description = await page
      .$eval(
        'meta[property="og:description"]',
        (el) => el.getAttribute("content") ?? ""
      )
      .catch(() => "");

    const thumbnail = await page
      .$eval(
        'meta[property="og:image"]',
        (el) => el.getAttribute("content") ?? ""
      )
      .catch(() => undefined);

    const author = await page
      .$eval(
        ".author, .byline, [class*='author'], .cmn-author",
        (el) => el.textContent?.trim() ?? ""
      )
      .catch(() => undefined);

    const publishedAtStr = await page
      .$eval(
        'meta[property="article:published_time"]',
        (el) => el.getAttribute("content") ?? ""
      )
      .catch(() => "");

    const publishedAt = publishedAtStr ? new Date(publishedAtStr) : new Date();

    const content = await extractArticleContent(page);

    if (!content) {
      console.warn(`[NikkeiXTrend] No content found for ${link.url}`);
    }

    return {
      title: title || link.title,
      url: link.url,
      description,
      thumbnail: thumbnail ?? undefined,
      author: author ?? undefined,
      publishedAt,
      content: content || description,
    };
  } catch (err) {
    console.warn(`[NikkeiXTrend] Failed to scrape ${link.url}:`, err);
    return null;
  } finally {
    await page.close();
  }
}

export async function scrapeNikkeiXTrend(): Promise<ArticleItem[]> {
  const cookieStr = process.env.NIKKEI_COOKIE ?? "";
  if (!cookieStr) {
    console.warn("[NikkeiXTrend] NIKKEI_COOKIE is not set");
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });

  if (cookieStr) {
    const cookies = parseCookies(cookieStr, ".nikkei.com");
    await context.addCookies(cookies);
  }

  const articles: ArticleItem[] = [];

  try {
    const topPage = await context.newPage();
    await topPage.goto(BASE_URL, { waitUntil: "networkidle", timeout: 30000 });

    const links = await getArticleLinks(topPage);
    await topPage.close();

    console.log(`[NikkeiXTrend] Found ${links.length} article links`);

    // Scrape up to 20 articles
    const targets = links.slice(0, 20);
    for (const link of targets) {
      const article = await scrapeArticle(context, link);
      if (article) articles.push(article);
    }
  } catch (err) {
    console.error("[NikkeiXTrend] Scrape failed:", err);
  } finally {
    await browser.close();
  }

  return articles;
}
