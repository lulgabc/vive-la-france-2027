# P1 实现状态（2026-11-10）

## 本轮完成

| 模块 | 状态 |
|---|---|
| 真实信息流 `/fil` | D1 文章、来源筛选、议题筛选、搜索、分页、来源链接 |
| 三语信息流 | `/fil`、`/en/feed`、`/zh/feed` 均使用真实数据 |
| 选举相关性过滤 | 默认只显示 `election_related=true`；可勾选“全部新闻” |
| 规则分类器 | 标题/摘要 → 议题 + 相关性；用于无 AI binding 的本地/兜底 |
| 判断入库 | `judgments` 表；Jev 可用时写 Jev，否则写 `fallback-keywords` |
| 媒体热度 | `media_momentum` 表；7 天提及量；首页 + 信息流侧栏 |
| 市场连接器 | Kalshi 全量、Polymarket Gamma、Metaculus（需 token） |
| 首页真实模块 | “Momentum média” + 最新 3 条真实文章 |
| 本地共享 D1 | Web 与 Pipeline 共用 `.wrangler/state`，本地端到端可读 |
| 管理接口 | 采集、回填判断、重算热度、清洗 HTML 实体、重置规则判断 |
| 数据清洗 | `html-entities` 解码 `&amp;`、`&#x27;`、`&eacute;` 等 |

## 实测数字（本地）

| 指标 | 数值 |
|---|---:|
| RSS 文章 | 302 |
| 选举相关文章 | 55 |
| 判断记录 | 604（302 × 2） |
| 媒体热度候选人 | 15 |
| 市场 | 0（Kalshi 暂无 France 2027；Polymarket 网络不可达；Metaculus 无 token） |
| 信息流分页 | 3 页 × 20 条 |
| 三语信息流 | 200，无 console error |
| 横向溢出 | 1440 / 390 均无 |

## 新增 API

```bash
# Web（只读）
GET /api/v1/feed?source=lefigaro&topic=economy_purchasing_power&q=retraites&limit=20&offset=0
GET /api/v1/sources
GET /api/v1/momentum
GET /api/v1/markets

# Pipeline（需 x-admin-token）
POST /admin/ingest/rss
POST /admin/ingest/gdelt
POST /admin/ingest/x
POST /admin/ingest/markets
POST /admin/backfill-judgments?force=1
POST /admin/reset-fallback-judgments
POST /admin/recompute-momentum
POST /admin/clean-articles
GET  /admin/stats
```

## 关键实现

### 1. 相关性过滤

`judgments` 中每个 article 有两条记录：

- `election_related`：`noul`，值 `true/false`
- `topic`：`choice`，12 个议题之一

信息流默认取**最新**的 `election_related` 判断，避免旧判断污染。规则分类器会误判，因此：

- 去掉了过于宽泛的关键词：`2027`、`candidat`、`candidate`、裸 `Renaissance`、裸 `Horizons`、`ue`。
- 短关键词使用词边界匹配。
- 支持 `force=1` 重新判断全部文章。

### 2. 媒体热度

`recomputeMomentum`：

- 取最近 7 天最多 1000 篇文章。
- 用候选人姓名/别名做提及计数。
- 写入 `media_momentum`（entity、as_of、window_days、mentions、share）。
- 首页与信息流侧栏读取最新一天。

这是“媒体可见度”指标，不是民意。

### 3. 市场连接器

- **Kalshi**：拉 open events，过滤 France/French/présidentielle 关键词；当前无匹配。
- **Polymarket**：Gamma API；本机网络不可达，错误被记录，不影响其他连接器。
- **Metaculus**：需要 `METACULUS_TOKEN`；无 token 时返回 `skipped: true`。
- 三者都写 `ingestion_runs`，失败不会中断整条链路。

### 4. 本地共享状态

- `apps/web/astro.config.mjs`：`persistState: { path: '../../.wrangler/state' }`
- `apps/pipeline`：`wrangler dev --persist-to ../../.wrangler/state`
- 根目录 `.wrangler/state` 是 Web/Pipeline 共用的本地 D1/KV/R2/Queue。

## 已知问题

1. **规则分类器仍会误判**：如体育/文化新闻含候选人姓名时会被判为相关；议题标签也较粗。下一步用 Jev + 300–500 条法语标注集替换。
2. **Jev 未实际跑通**：本地无 Workers AI binding，全部走 fallback；生产需配置 AI binding 并评估法语表现。
3. **市场为空**：Kalshi 暂无 France 2027；Polymarket 在本机不可达；Metaculus 需 token。
4. **民调仍是 demo**：PDF 解析、Commission notice、人工复核未接。
5. **577 选区未入库**：当前到省级。
6. **中文信息流保留法语原文**：按约定只翻译 UI + 关键页面。
7. **D1 并发写**：本地曾出现 `SQLITE_BUSY`，已加 `withRetry`；生产 D1 会排队，但仍应避免大规模并发写。

## 下一步（P2）

1. Jev 法语标注集（300–500 条）+ 准确率/校准/党派偏差评估；通过后替换规则分类器。
2. 民调 PDF 解析 + 人工复核队列 + Commission notice。
3. 真实民调聚合 + 市场快照 → 评分 v1 从 demo 切到真实。
4. 577 选区数据 + 立法席位模型。
5. 来源健康度面板（哪些 RSS 403/404，自动降频）。
