export const metadata = {
  title: "Readwise RSS Bridge",
  description: "Full-text RSS bridge for NewsPicks and Nikkei XTrend",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
