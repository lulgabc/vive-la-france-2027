# Web 更新机制（2026-11-11）

## 结论

当前站点是：

> **定时采集写入 D1 → 页面请求时 SSR 读取 D1 → 浏览器刷新后看到新数据。**

不是 WebSocket 实时推送。Dashboard 的时钟每秒更新，但业务数据默认不自动刷新。

## 数据流

```text
RSS / GDELT / Mastodon / Bluesky / X / Sondax / Polymarket
        │
        ▼
Cloudflare Cron（pipeline Worker）
        │
        ├── D1：articles、social_posts、polls、markets、scores...
        ├── Queue：新文章 → Jev 判断
        └── 重算：poll_averages、media_momentum、scores
        │
        ▼
Astro SSR（web Worker）
        │
        ├── 每次请求读取 D1
        ├── API：15–60 秒 CDN 缓存
        └── 页面：默认不缓存
        │
        ▼
浏览器刷新
```

## Cron 频率

配置：`apps/pipeline/wrangler.jsonc`

| Cron | 频率 | 任务 |
|---|---|---|
| `*/5 * * * *` | 每 5 分钟 | RSS |
| `*/15 * * * *` | 每 15 分钟 | GDELT、Polymarket、Mastodon |
| `0 * * * *` | 每小时 | X、Bluesky |
| `0 6 * * *` | 每天 06:00 UTC | 全量采集、民调聚合、媒体热度、评分 |
| `0 7 * * *` | 每天 07:00 UTC | 省级/立法情景快照 |

## 新文章如何进入页面

1. RSS / GDELT 插入 `articles`
2. 发送 Queue 消息 `{ kind: 'article', articleId }`
3. Queue consumer 调用 `judgeArticle()`
4. Jev 判断结果写入 `judgments`
5. LiveHub 推送 `judgment` 事件
6. 前端收到事件后刷新 `/api/v1/feed`
7. `/fil` 读取最新 judgment，默认只显示 `election_related = true`

## 页面读取

`apps/web` 是 Astro SSR，不是静态站。

例如 `DashboardPage.astro` 在请求时读取：

- `readFeed`
- `readMomentum`
- `readMarkets`
- `readPollAverages`
- `readScores`
- `readScoreHistory`

因此刷新页面才会重新读取 D1。

## 缓存

API：

```http
cache-control: public, s-maxage=15, stale-while-revalidate=60
```

| API | 缓存 |
|---|---|
| `/api/v1/feed` | 15 秒 |
| `/api/v1/scores` | 15 秒 |
| `/api/v1/markets` | 15 秒 |
| `/api/v1/projection` | 60 秒 |
| `/api/v1/legislative` | 60 秒 |

页面：SSR + `ETag` + `Cache-Control: public, max-age=0, s-maxage=15, stale-while-revalidate=60`。

API 也返回 `ETag`；`If-None-Match` 匹配时返回 304。

## 更新延迟

| 模块 | 延迟 |
|---|---|
| RSS | 5 分钟 |
| GDELT / 市场 / Mastodon | 15 分钟 |
| Bluesky / X | 1 小时 |
| 民调 CSV | 1 天或手动 |
| PDF 民调 | 人工复核后 |
| 五因子评分 | 1 天 |
| 情景快照 | 1 天 |
| Jev 判断 | 队列异步，几秒到几分钟 |

## 本地 vs 生产

### 本地

`wrangler.local.jsonc` 没有 cron triggers，所以不会自动跑。使用：

```bash
curl -X POST http://127.0.0.1:8787/admin/ingest/rss -H "x-admin-token: dev-token"
curl -X POST http://127.0.0.1:8787/admin/ingest/gdelt -H "x-admin-token: dev-token"
curl -X POST http://127.0.0.1:8787/admin/recompute-scores -H "x-admin-token: dev-token"
```

本地状态在 `.wrangler/state`，和生产 D1 不互通。

### 生产

Cloudflare Cron Triggers 自动执行。

## 当前局限

1. 页面不自动刷新，必须手动刷新。
2. 评分每天才重算。
3. API 有 15–60 秒 CDN 缓存。
4. Queue 是 best-effort，失败时文章仍入库但可能没有判断。
5. cron 表达式有重叠，例如 `*/5` 和 `*/15` 在 0/15/30/45 分都匹配；靠 `content_hash` 和唯一索引去重。
6. 没有 SSE/WebSocket。

## 本轮新增（2026-11-11）

### 1. 前端轮询

Dashboard 每 45 秒请求：

- `/api/v1/feed?limit=60`
- `/api/v1/scores`
- `/api/v1/markets`
- `/api/v1/momentum`

页面隐藏时暂停；重新可见时立即刷新。排名面板显示同步时间和 SSE/轮询状态。

### 2. SSE 实时推送

Pipeline 新增 Durable Object `LiveHub`：

- `GET /live`：SSE 订阅
- `GET /live/recent`：最近 50 条事件
- 内部 `POST /publish`：广播事件

写入后推送：

```text
articles / social / markets / scores / judgment / forecasts
```

前端 `EventSource` 连接 `/live`，收到事件后 5 秒节流刷新；SSE 不可用时自动回退到 45 秒轮询。

本地默认：

```text
http://127.0.0.1:8787/live
```

生产设置：

```bash
PUBLIC_PIPELINE_URL=https://vlf-pipeline.<subdomain>.workers.dev
```

### 3. 评分触发

- `*/15` cron：Polymarket 更新后重算评分
- `0 *` cron：X/Bluesky 更新后重算评分
- `/admin/ingest/markets`、`/admin/ingest/social`、`/admin/ingest/bluesky` 手动触发时也会重算
- 每日 06:00 UTC 仍保留全量重算

### 4. ETag / stale-while-revalidate

- API：响应带 `ETag`；`If-None-Match` 匹配返回 **304**
- 页面：middleware 按 D1 数据版本生成 `ETag`
  - `Cache-Control: public, max-age=0, s-maxage=15, stale-while-revalidate=60`
- 复核页 `/sondages/relecture` 不做缓存

### 5. Connector 状态

- `GET /admin/connectors`
- `/sondages/relecture` 顶部显示每个 connector 的最后成功时间、状态、items、errors、detail

配置新增：

- `LIVE_HUB` Durable Object binding
- `PUBLIC_PIPELINE_URL`（web）
- `JEV_ELECTION_THRESHOLD=0.4`
