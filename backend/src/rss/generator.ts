import { Feed } from "feed";

export interface ArticleItem {
  title: string;
  url: string;
  description: string;
  thumbnail?: string;
  author?: string;
  publishedAt: Date;
  content: string;
}

export interface FeedConfig {
  title: string;
  description: string;
  link: string;
  feedUrl: string;
}

export function generateRssFeed(
  config: FeedConfig,
  items: ArticleItem[]
): string {
  const feed = new Feed({
    title: config.title,
    description: config.description,
    id: config.link,
    link: config.link,
    feedLinks: { rss: config.feedUrl },
    updated: new Date(),
    copyright: "",
  });

  for (const item of items) {
    feed.addItem({
      title: item.title,
      id: item.url,
      link: item.url,
      description: item.description,
      content: item.content,
      author: item.author ? [{ name: item.author }] : [],
      date: item.publishedAt,
      image: item.thumbnail,
    });
  }

  return feed.rss2();
}
