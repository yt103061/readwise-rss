import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow streaming responses from backend
  async headers() {
    return [
      {
        source: "/api/rss/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=1800, stale-while-revalidate=3600" },
        ],
      },
    ];
  },
};

export default nextConfig;
