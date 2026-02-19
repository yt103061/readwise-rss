import NodeCache from "node-cache";

export interface CacheEntry {
  feedXml: string;
  lastUpdated: Date;
  itemCount: number;
}

export type FeedKey = "newspicks" | "nikkei-xtrend";

const TTL_SECONDS =
  parseInt(process.env.CACHE_TTL_MINUTES ?? "60", 10) * 60;

const cache = new NodeCache({ stdTTL: TTL_SECONDS, checkperiod: 120 });

export function getCachedFeed(key: FeedKey): CacheEntry | undefined {
  return cache.get<CacheEntry>(key);
}

export function setCachedFeed(key: FeedKey, entry: CacheEntry): void {
  cache.set(key, entry);
}

export function getCacheStats(): Record<
  FeedKey,
  { cached: boolean; lastUpdated?: Date; itemCount?: number }
> {
  const keys: FeedKey[] = ["newspicks", "nikkei-xtrend"];
  const stats: Record<string, unknown> = {};
  for (const key of keys) {
    const entry = cache.get<CacheEntry>(key);
    if (entry) {
      stats[key] = {
        cached: true,
        lastUpdated: entry.lastUpdated,
        itemCount: entry.itemCount,
      };
    } else {
      stats[key] = { cached: false };
    }
  }
  return stats as Record<
    FeedKey,
    { cached: boolean; lastUpdated?: Date; itemCount?: number }
  >;
}
