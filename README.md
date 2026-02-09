# アポドリクローン - AI営業リード獲得システム

AIを活用した営業リード獲得の自動化システムです。企業情報の収集、担当者の特定、メールアドレスの推定・検証を一括で行います。

## アーキテクチャ

```
sales-ai-agent/
├── packages/
│   ├── core/            # 共通型定義・ユーティリティ
│   ├── scraper/         # Playwright + Cheerio によるWebスクレイピング
│   ├── ai-engine/       # Claude / OpenAI LLMクライアント
│   ├── email-finder/    # メールアドレス推定・検証
│   ├── data-collector/  # 情報収集パイプライン
│   ├── worker/          # BullMQ ジョブワーカー
│   ├── api-server/      # Hono REST API サーバー (port 3000)
│   └── web-ui/          # Next.js 15 フロントエンド (port 3001)
├── prisma/              # Prisma スキーマ・マイグレーション
└── docker-compose.yml   # PostgreSQL + Redis
```

## 技術スタック

| カテゴリ | 技術 |
|---------|------|
| ランタイム | Node.js >= 20 |
| 言語 | TypeScript |
| パッケージ管理 | pnpm 9.15 + Turbo (monorepo) |
| フロントエンド | Next.js 15 (App Router) |
| API サーバー | Hono |
| データベース | PostgreSQL 16 |
| キャッシュ / キュー | Redis 7 + BullMQ |
| ORM | Prisma |
| スクレイピング | Playwright, Cheerio |
| AI | Claude API, OpenAI API |
| 外部API | Hunter.io, gBizINFO, Google Custom Search |

## セットアップ

### 前提条件

- Node.js 20 以上
- pnpm 9 以上
- Docker / Docker Compose

### 1. 依存パッケージのインストール

```bash
pnpm install
```

### 2. 環境変数の設定

```bash
cp .env.example .env
```

`.env` を編集して API キーを設定してください：

```env
# Database
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/sales_ai_agent?schema=public"

# Redis
REDIS_URL="redis://localhost:6379"

# AI APIs（必須: いずれか1つ以上）
CLAUDE_API_KEY="sk-ant-..."
OPENAI_API_KEY="sk-..."

# External APIs（オプション）
HUNTER_IO_API_KEY=""
GOOGLE_SEARCH_API_KEY=""
GOOGLE_SEARCH_ENGINE_ID=""
GBIZINFO_API_KEY=""
```

### 3. Docker コンテナの起動

```bash
docker compose up -d
```

PostgreSQL と Redis が起動します。

### 4. データベースのセットアップ

```bash
pnpm db:push
```

### 5. ビルド

```bash
pnpm build
```

## 起動方法

### 開発モード

ターミナルを3つ開いて、それぞれ以下を実行します：

```bash
# ターミナル 1: API サーバー (http://localhost:3000)
cd packages/api-server
pnpm dev

# ターミナル 2: Web UI (http://localhost:3001)
cd packages/web-ui
pnpm dev

# ターミナル 3: ワーカー（ジョブ処理）
cd packages/worker
pnpm dev
```

ブラウザで **http://localhost:3001** を開くとダッシュボードが表示されます。

## 使い方

### 1. CSV インポート

Web UI の「CSVインポート」ページから企業リストをアップロードします。

CSV フォーマット：
```csv
企業名,URL,業種
株式会社テスト,https://test.co.jp,IT
合同会社サンプル,,製造業
```

### 2. ジョブの実行

インポートすると自動的に情報収集ジョブが作成されます。「ジョブ管理」ページで進捗を確認できます。

### 3. 結果の確認

「企業一覧」ページで収集された企業情報・連絡先を確認し、CSVエクスポートが可能です。

## 情報収集タスク

各企業に対して以下の11種類のタスクが実行されます：

1. **Google検索** - 企業URLの特定
2. **企業サイト解析** - 基本情報の抽出
3. **採用情報収集** - 組織構造の把握
4. **gBizINFO連携** - 法人番号・公開情報の取得
5. **IR情報収集** - 財務・成長性の分析
6. **プレスリリース** - 最新動向の把握
7. **ブログ・技術記事** - 技術スタック・課題の分析
8. **外部メディア** - 業界評判の収集
9. **競合分析** - 競合企業の特定
10. **導入事例** - ターゲット業界の把握
11. **連絡先検索** - メールアドレスの推定・検証

## API エンドポイント

| メソッド | パス | 説明 |
|---------|------|------|
| GET | `/api/companies` | 企業一覧取得 |
| GET | `/api/companies/:id` | 企業詳細取得 |
| GET | `/api/companies/:id/contacts` | 連絡先一覧取得 |
| GET | `/api/jobs` | ジョブ一覧取得 |
| GET | `/api/jobs/:jobId` | ジョブ詳細取得 |
| POST | `/api/jobs` | ジョブ作成（JSON） |
| POST | `/api/jobs/csv` | ジョブ作成（CSVアップロード） |
| GET | `/api/export?format=csv` | 結果エクスポート |

## プロジェクト構成の詳細

### packages/core
共通の型定義（`CompanyInfo`, `ContactInfo`, `TaskType` 等）とユーティリティ関数（リトライ、レート制限、JSON抽出等）を提供。

### packages/scraper
Playwright によるブラウザ自動操作と Cheerio による HTML パースを担当。ページプール管理、レート制限、robots.txt 準拠を実装。

### packages/ai-engine
Claude API と OpenAI API のデュアルプロバイダー対応 LLM クライアント。YAML テンプレートによるプロンプト管理。

### packages/email-finder
メールアドレスのパターン生成（名前 + ドメインから候補生成）、Hunter.io API 連携、SMTP 検証を実装。

### packages/data-collector
11種類の情報収集タスクを統合するパイプライン。各タスクの実行順序制御と結果の集約を担当。

### packages/worker
BullMQ ベースのジョブワーカー。Redis キューから収集タスクを取得し、非同期で実行。並行度制御とリトライ機能を搭載。

### packages/api-server
Hono フレームワークによる REST API。企業情報の CRUD、ジョブ管理、CSV インポート/エクスポートを提供。

### packages/web-ui
Next.js 15 App Router によるダッシュボード。リアルタイム進捗表示、企業詳細ビュー、CSV インポート UI を提供。

## ライセンス

Private
