# readwise-rss

NewsPicks・日経クロストレンドのログイン壁を突破し、全文RSSとして配信するブリッジサーバー。
Readwise Reader でのハイライト活用を最終目的としている。

## アーキテクチャ

```
[Railway] backend (Playwright + Express)
    ↓ RSS XML
[Vercel]  frontend (Next.js proxy)
    ↓ RSS feed URL
[Readwise Reader]
```

## ディレクトリ構成

```
.
├── backend/          # Railway デプロイ対象
│   ├── src/
│   │   ├── scrapers/
│   │   │   ├── newspicks.ts      # NewsPicks スクレイパー
│   │   │   └── nikkei-xtrend.ts  # 日経クロストレンド スクレイパー
│   │   ├── rss/
│   │   │   └── generator.ts      # RSS XML 生成
│   │   ├── cache/
│   │   │   └── store.ts          # インメモリキャッシュ
│   │   └── index.ts              # Express エントリーポイント
│   ├── Dockerfile
│   ├── .env.example
│   └── package.json
└── frontend/         # Vercel デプロイ対象
    ├── app/
    │   ├── api/rss/
    │   │   ├── newspicks/route.ts      # NewsPicks プロキシ
    │   │   └── nikkei-xtrend/route.ts  # 日経クロストレンド プロキシ
    │   ├── layout.tsx
    │   └── page.tsx
    ├── .env.example
    └── package.json
```

## セットアップ

### 1. Cookie の取得

Chrome で対象サイトにログイン済みの状態で:

1. DevTools を開く（F12）
2. **Application** タブ → **Cookies** → サイトのドメインを選択
3. 全Cookieを `key=value; key2=value2` 形式でコピー

### 2. Railway（バックエンド）デプロイ

1. Railway で新しいプロジェクトを作成
2. このリポジトリを接続、**Root Directory** を `backend` に設定
3. 環境変数を設定（`.env.example` を参照）:
   - `NEWSPICKS_COOKIE`: NewsPicks の Cookie 文字列
   - `NIKKEI_COOKIE`: 日経クロストレンドの Cookie 文字列
   - `SELF_URL`: Railway の公開 URL
4. デプロイ → 公開 URL を控える

### 3. Vercel（フロントエンド）デプロイ

1. Vercel で新しいプロジェクトを作成
2. このリポジトリを接続、**Root Directory** を `frontend` に設定
3. 環境変数を設定:
   - `BACKEND_URL`: Railway の公開 URL（末尾スラッシュなし）
4. デプロイ

### 4. Readwise Reader にフィード登録

```
https://your-vercel-app.vercel.app/api/rss/newspicks
https://your-vercel-app.vercel.app/api/rss/nikkei-xtrend
```

## エンドポイント（バックエンド）

| エンドポイント        | 説明                        |
|---------------------|-----------------------------|
| `GET /rss/newspicks`      | NewsPicks 全文 RSS 2.0      |
| `GET /rss/nikkei-xtrend`  | 日経クロストレンド 全文 RSS 2.0 |
| `GET /health`             | ヘルスチェック + キャッシュ状態 |

## エラーレスポンス

Cookie 期限切れ:
```json
{ "error": "scrape_failed", "site": "newspicks", "message": "..." }
```

前回キャッシュがある場合は古いデータを返す（stale-while-revalidate 的挙動）。

## ローカル開発

```bash
cd backend
cp .env.example .env
# .env に Cookie を設定
npm install
npm run dev
```
