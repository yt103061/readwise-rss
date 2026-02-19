import { NextResponse } from "next/server";

export const runtime = "edge";

// Revalidate every 30 minutes on the Vercel CDN
export const revalidate = 1800;

export async function GET(): Promise<NextResponse> {
  const backendUrl = process.env.BACKEND_URL;
  if (!backendUrl) {
    return NextResponse.json(
      { error: "BACKEND_URL is not configured" },
      { status: 500 }
    );
  }

  try {
    const upstream = await fetch(`${backendUrl}/rss/newspicks`, {
      next: { revalidate: 1800 },
    });

    if (!upstream.ok) {
      const body = await upstream.text();
      return new NextResponse(body, {
        status: upstream.status,
        headers: { "Content-Type": "application/json" },
      });
    }

    const xml = await upstream.text();
    return new NextResponse(xml, {
      status: 200,
      headers: {
        "Content-Type": "application/rss+xml; charset=utf-8",
        "Cache-Control": "public, max-age=1800, stale-while-revalidate=3600",
      },
    });
  } catch (err) {
    console.error("[NewsPicks proxy] fetch error:", err);
    return NextResponse.json(
      { error: "upstream_error", message: String(err) },
      { status: 502 }
    );
  }
}
