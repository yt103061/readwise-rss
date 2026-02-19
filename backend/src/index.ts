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

// ----------------------------------------------------------------
// RSS response helper
// ----------------------------------------------------------------
function sendRss(res: Response, xml: string): void {
  res.setHeader("Content-Type", "application/rss+xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=1800");
  res.send(xml);
}

// ----------------------------------------------------------------
// Feed refresh logic
// ----------------------------------------------------------------
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
      lastUpdated: new Date(),
      itemCount: articles.length,
    });
    console.log(`[${key}] Refresh complete. ${articles.length} articles cached.`);
  } catch (err) {
    console.error(`[${key}] Refresh error:`, err);
  }
}

// ----------------------------------------------------------------
// Routes
// ----------------------------------------------------------------
app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", cache: getCacheStats(), uptime: process.uptime() });
});

app.get("/rss/newspicks", async (_req: Request, res: Response) => {
  const cached = getCachedFeed("newspicks");
  if (cached) {
    return sendRss(res, cached.feedXml);
  }

  // No cache: run on-demand
  await refreshFeed("newspicks");
  const fresh = getCachedFeed("newspicks");
  if (fresh) {
    return sendRss(res, fresh.feedXml);
  }

  return res.status(500).json({
    error: "scrape_failed",
    site: "newspicks",
    message: "スクレイピングに失敗しました。Cookie が設定されているか確認してください。",
  });
});

app.get("/rss/nikkei-xtrend", async (_req: Request, res: Response) => {
  const cached = getCachedFeed("nikkei-xtrend");
  if (cached) {
    return sendRss(res, cached.feedXml);
  }

  await refreshFeed("nikkei-xtrend");
  const fresh = getCachedFeed("nikkei-xtrend");
  if (fresh) {
    return sendRss(res, fresh.feedXml);
  }

  return res.status(500).json({
    error: "scrape_failed",
    site: "nikkei-xtrend",
    message: "スクレイピングに失敗しました。Cookie が設定されているか確認してください。",
  });
});

// ----------------------------------------------------------------
// Startup
// ----------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`[server] Listening on port ${PORT}`);

  // Warm up caches on start
  void refreshFeed("newspicks");
  void refreshFeed("nikkei-xtrend");

  // Schedule periodic refresh
  const cronExpr = `*/${CRON_INTERVAL} * * * *`;
  console.log(`[cron] Scheduled with expression: ${cronExpr}`);
  cron.schedule(cronExpr, () => {
    void refreshFeed("newspicks");
    void refreshFeed("nikkei-xtrend");
  });
});
