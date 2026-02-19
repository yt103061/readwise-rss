export default function Home() {
  return (
    <main style={{ fontFamily: "sans-serif", padding: "2rem", maxWidth: "600px" }}>
      <h1>Readwise RSS Bridge</h1>
      <p>Available RSS feeds:</p>
      <ul>
        <li>
          <a href="/api/rss/newspicks">/api/rss/newspicks</a>
          {" — NewsPicks 全文フィード"}
        </li>
        <li>
          <a href="/api/rss/nikkei-xtrend">/api/rss/nikkei-xtrend</a>
          {" — 日経クロストレンド 全文フィード"}
        </li>
      </ul>
    </main>
  );
}
