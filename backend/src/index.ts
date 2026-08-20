import { timingSafeEqual } from "node:crypto";
import express, { Request, Response } from "express";
import cron from "node-cron";
import { scrapeNewsPicks } from "./scrapers/newspicks";
import { scrapeNikkeiXTrend } from "./scrapers/nikkei-xtrend";
import { generateRssFeed } from "./rss/generator";
import {
  getCachedFeed,
  setCachedFeed,
  getCacheStats,
  FeedKey,
} from "./cache/store";

const PORT = parseInt(process.env.PORT ?? "3001", 10);
const CRON_INTERVAL = parseInt(process.env.CRON_INTERVAL_MINUTES ?? "30", 10);

const app = express();

function sendRss(res: Response, xml: string): void {
  res.setHeader("Content-Type", "application/rss+xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=1800");
  res.send(xml);
}

async function refreshFeed(key: FeedKey): Promise<void> {
  console.log(`[${key}] Starting refresh...`);
  try {
    let articles;
    let feedConfig;

    if (key === "newspicks") {
      articles = await scrapeNewsPicks();
      feedConfig = {
        title: "NewsPicks - 全文フィード",
        description: "NewsPicks の全文記事を配信するRSSフィード",
        link: "https://newspicks.com",
        feedUrl: `${process.env.SELF_URL ?? ""}/rss/newspicks`,
      };
    } else {
      articles = await scrapeNikkeiXTrend();
      feedConfig = {
        title: "日経クロストレンド - 全文フィード",
        description: "日経クロストレンドの全文記事を配信するRSSフィード",
        link: "https://xtrend.nikkei.com",
        feedUrl: `${process.env.SELF_URL ?? ""}/rss/nikkei-xtrend`,
      };
    }

    if (articles.length === 0) {
      console.warn(`[${key}] No articles scraped - keeping existing cache`);
      return;
    }

    const feedXml = generateRssFeed(feedConfig, articles);
    setCachedFeed(key, {
      feedXml,
      articles,
      lastUpdated: new Date(),
      itemCount: articles.length,
    });
    console.log(`[${key}] Refresh complete. ${articles.length} articles cached.`);
  } catch (err) {
    console.error(`[${key}] Refresh error:`, err);
  }
}

function privateApiAuthorization(req: Request): "ok" | "not-configured" | "unauthorized" {
  const expected = process.env.BRIDGE_SECRET?.trim() ?? "";
  if (expected.length < 16) return "not-configured";

  const authorization = req.header("authorization")?.trim() ?? "";
  const bearer = authorization.toLowerCase().startsWith("bearer ")
    ? authorization.slice(7).trim()
    : "";
  const supplied = bearer || req.header("x-bridge-secret")?.trim() || "";
  const actualBuffer = Buffer.from(supplied);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length) return "unauthorized";
  return timingSafeEqual(actualBuffer, expectedBuffer) ? "ok" : "unauthorized";
}

async function sendPrivateArticles(req: Request, res: Response, key: FeedKey) {
  const auth = privateApiAuthorization(req);
  if (auth === "not-configured") {
    return res.status(503).json({ error: "bridge_not_configured" });
  }
  if (auth !== "ok") {
    return res.status(401).json({ error: "unauthorized" });
  }

  let cached = getCachedFeed(key);
  if (!cached) {
    await refreshFeed(key);
    cached = getCachedFeed(key);
  }
  if (!cached) {
    return res.status(502).json({
      error: "scrape_failed",
      site: key,
      message: "認証済み記事の取得に失敗しました。Cookie を更新してください。",
    });
  }

  res.setHeader("Cache-Control", "private, max-age=300");
  return res.json({
    source: key,
    lastUpdated: cached.lastUpdated.toISOString(),
    articles: cached.articles.map((article) => ({
      ...article,
      publishedAt: article.publishedAt.toISOString(),
    })),
  });
}

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", cache: getCacheStats(), uptime: process.uptime() });
});

// Golail consumes these protected JSON endpoints directly. RSS remains available
// for the original Readwise Reader workflow, but Golail no longer needs RSS as an
// intermediate representation.
app.get("/api/articles/newspicks", (req: Request, res: Response) =>
  sendPrivateArticles(req, res, "newspicks")
);
app.get("/api/articles/nikkei-xtrend", (req: Request, res: Response) =>
  sendPrivateArticles(req, res, "nikkei-xtrend")
);

app.get("/rss/newspicks", async (_req: Request, res: Response) => {
  const cached = getCachedFeed("newspicks");
  if (cached) return sendRss(res, cached.feedXml);

  await refreshFeed("newspicks");
  const fresh = getCachedFeed("newspicks");
  if (fresh) return sendRss(res, fresh.feedXml);

  return res.status(500).json({
    error: "scrape_failed",
    site: "newspicks",
    message: "スクレイピングに失敗しました。Cookie が設定されているか確認してください。",
  });
});

app.get("/rss/nikkei-xtrend", async (_req: Request, res: Response) => {
  const cached = getCachedFeed("nikkei-xtrend");
  if (cached) return sendRss(res, cached.feedXml);

  await refreshFeed("nikkei-xtrend");
  const fresh = getCachedFeed("nikkei-xtrend");
  if (fresh) return sendRss(res, fresh.feedXml);

  return res.status(500).json({
    error: "scrape_failed",
    site: "nikkei-xtrend",
    message: "スクレイピングに失敗しました。Cookie が設定されているか確認してください。",
  });
});

app.listen(PORT, () => {
  console.log(`[server] Listening on port ${PORT}`);

  void refreshFeed("newspicks");
  void refreshFeed("nikkei-xtrend");

  const cronExpr = `*/${CRON_INTERVAL} * * * *`;
  console.log(`[cron] Scheduled with expression: ${cronExpr}`);
  cron.schedule(cronExpr, () => {
    void refreshFeed("newspicks");
    void refreshFeed("nikkei-xtrend");
  });
});
