import { chromium, BrowserContext, Page } from "playwright";
import { ArticleItem } from "../rss/generator";

const BASE_URL = "https://newspicks.com";

/**
 * Parse a cookie string (key=value; key2=value2) into Playwright cookie objects.
 * All cookies are scoped to the base domain.
 */
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
    .filter((c): c is { name: string; value: string; domain: string; path: string } => c !== null);
}

async function extractArticleContent(page: Page): Promise<string> {
  const selectors = [
    ".articleBody",
    '[class="article-body"]',
    '[class="ArticleBody"]',
    ".article-body",
    ".np-article-body",
    'article',
    '[data-testid="article-body"]',
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
  // Newspicks top feed article links
  return page.evaluate(() => {
    const links: { url: string; title: string }[] = [];
    const anchors = document.querySelectorAll("a[href]");
    for (const a of anchors) {
      const href = (a as HTMLAnchorElement).href;
      // Match article paths like /news/XXXXXXX/YYYYYYY
      if (/\/news\/\d+\/\d+/.test(href)) {
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
  });
}

async function scrapeArticle(
  context: BrowserContext,
  link: ArticleLink
): Promise<ArticleItem | null> {
  const page = await context.newPage();
  try {
    await page.goto(link.url, { waitUntil: "networkidle", timeout: 30000 });

    // Check for auth wall (redirect to login)
    const currentUrl = page.url();
    if (currentUrl.includes("/login") || currentUrl.includes("/signin")) {
      console.warn(`[NewsPicks] Auth redirect for ${link.url} - cookie may be expired`);
      return null;
    }

    const title = await page
      .$eval('meta[property="og:title"]', (el) => el.getAttribute("content") ?? "")
      .catch(() => link.title);

    const description = await page
      .$eval('meta[property="og:description"]', (el) => el.getAttribute("content") ?? "")
      .catch(() => "");

    const thumbnail = await page
      .$eval('meta[property="og:image"]', (el) => el.getAttribute("content") ?? "")
      .catch(() => undefined);

    const author = await page
      .$eval(".author, .byline, [class*='author']", (el) => el.textContent?.trim() ?? "")
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
      console.warn(`[NewsPicks] No content found for ${link.url}`);
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
    console.warn(`[NewsPicks] Failed to scrape ${link.url}:`, err);
    return null;
  } finally {
    await page.close();
  }
}

export async function scrapeNewsPicks(): Promise<ArticleItem[]> {
  const cookieStr = process.env.NEWSPICKS_COOKIE ?? "";
  if (!cookieStr) {
    console.warn("[NewsPicks] NEWSPICKS_COOKIE is not set");
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });

  if (cookieStr) {
    const cookies = parseCookies(cookieStr, ".newspicks.com");
    await context.addCookies(cookies);
  }

  const articles: ArticleItem[] = [];

  try {
    const topPage = await context.newPage();
    await topPage.goto(BASE_URL, { waitUntil: "networkidle", timeout: 30000 });

    const links = await getArticleLinks(topPage);
    await topPage.close();

    console.log(`[NewsPicks] Found ${links.length} article links`);

    // Scrape up to 20 articles
    const targets = links.slice(0, 20);
    for (const link of targets) {
      const article = await scrapeArticle(context, link);
      if (article) articles.push(article);
    }
  } catch (err) {
    console.error("[NewsPicks] Scrape failed:", err);
  } finally {
    await browser.close();
  }

  return articles;
}
