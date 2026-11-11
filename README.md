# Vive la France 2027

实时收集 2027 法国总统/立法选举相关的舆论、新闻、观点、民调与预测市场，提供选情地图、候选人/政党评分与可解释预测。

- 技术栈：[docs/01-tech-stack.md](docs/01-tech-stack.md)
- 产品范围与评分模型：[docs/02-product-scope.md](docs/02-product-scope.md)
- 2026-11 技术栈复核：[docs/03-stack-review-2026-11.md](docs/03-stack-review-2026-11.md)
- Jev 评估：[docs/04-jev-evaluation.md](docs/04-jev-evaluation.md)
- X 核心账号清单：[docs/05-x-accounts.md](docs/05-x-accounts.md)
- P0 实现状态：[docs/06-p0-status.md](docs/06-p0-status.md)
- P1 实现状态：[docs/07-p1-status.md](docs/07-p1-status.md)
- 界面重构（数字大屏）：[docs/08-ui-dashboard.md](docs/08-ui-dashboard.md)
- P2 实现状态：[docs/09-p2-status.md](docs/09-p2-status.md)
- P3 实现状态：[docs/10-p3-status.md](docs/10-p3-status.md)
- Jev/Clef 校准报告：[docs/11-jev-calibration.md](docs/11-jev-calibration.md)
- Web 更新机制：[docs/12-update-mechanism.md](docs/12-update-mechanism.md)
- 状态：**P3 已可运行**（Bluesky、背书、五因子、PDF 复核、市场历史、情景回测、577 选区）

## 快速结论

| 层 | 选择 |
|---|---|
| 前端 | Astro 7 + Svelte 5 islands，Tailwind 4，三语（fr/en/zh） |
| 页面/只读 API | Cloudflare Workers（Static Assets + SSR），可用 Hono advanced routing |
| 采集编排 | Workers Cron + Queues + Workflows（Hono） |
| 重计算 | Python Container（FastAPI + PyMC + Polars + pdfplumber） |
| 数据 | D1 + R2 + KV + Analytics Engine |
| 搜索 | D1 FTS5（v1）；Cloudflare AI Search（Phase 2 可选） |
| 地图 | TopoJSON/SVG（省/大区）+ PMTiles on R2（577 选区） |
| 实时 | CDN 15s 快照轮询 + SSE（选举夜） |
| AI | Workers AI（1B/3B）+ **TypeSafe Jev**（判断/分类）+ AI Gateway |
| X | 官方 API pay-per-use，25 个核心账号，硬 cap 4,000 reads/月 |
| 管理端 | Cloudflare Access |
| 预算 | 目标 $25–40/月（上限 $50） |

## 关于 Grok

Grok 的 `x_search` 按 **$5/1k posts** 计费，和官方 X API 同价，还要加 token 费；返回的是摘要 + 引用，不是可分页的原始数据流。**结论：Grok 不做采集器，只做可选“X 全网舆情周报”**（Phase 2，2 次/天，约 $7–8/月）。采集用官方 X API，分析用 Workers AI 对已采集 posts 处理。

## 关于 TypeSafe Jev

Jev 是“判断模型”：输入 state + typed questions，返回 `noul` / `choice` / `score` 的校准概率，不生成文本。适合做相关性过滤、议题分类、立场判断、摘要 groundedness 检查；不适合做 PDF 数字抽取、实体发现、去重或选举预测。通过 Cloudflare Workers AI 调用（`typesafe/jev`，$0.042/M input，output 免费），预计 **$2–8/月**。详见 [docs/04-jev-evaluation.md](docs/04-jev-evaluation.md)。

## 产品重点（选举前）

不是结果站，而是“选情情报面板”：

- 民调聚合 + 市场概率 + 媒体声量 + 社交关注度 + 立场/议题 → 候选人/政党综合评分
- 默认权重 40/20/15/10/15，用户可在前端调整、分享链接
- 贝叶斯模型给出 `P(win)` / `P(runoff)`，与评分分开呈现
- 地图：2022/2024 基线、2027 投影、关注度、竞选活动
- 所有数字可拆解、可追溯、可回测

## 本地运行

要求：Node **24.x**（Astro 7 要求 >= 22.23.4；本机 22.22.3 不够）、pnpm 12。

```bash
pnpm install
pnpm --filter @vlf/web dev -- --port 4321
# 另一个终端
cp apps/pipeline/.dev.vars.example apps/pipeline/.dev.vars
pnpm --filter @vlf/pipeline dev -- --port 8787
```

- Web: http://localhost:4321
- Pipeline: http://127.0.0.1:8787/health
- 手动触发 RSS: `curl -X POST http://127.0.0.1:8787/admin/ingest/rss -H "x-admin-token: dev-token"`
- 真实信息流: http://localhost:4321/fil
- 民调复核页: http://localhost:4321/sondages/relecture（token `dev-token`）

Python PDF 解析器（可选，复核 PDF 时需要）：

```bash
cd apps/compute
uv run --no-project --with fastapi --with 'uvicorn[standard]' --with pydantic --with httpx --with pdfplumber \
  python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

解析真实 Commission notice：

```bash
curl -X POST http://127.0.0.1:8787/admin/polls/parse \
  -H "x-admin-token: dev-token" -H 'content-type: application/json' \
  -d '{"url":"https://www.commission-des-sondages.fr/notices/medias/fichiers/add/2381"}'

curl "http://127.0.0.1:8787/admin/polls/drafts?status=pending" -H "x-admin-token: dev-token"
curl -X POST http://127.0.0.1:8787/admin/polls/drafts/<id>/approve \
  -H "x-admin-token: dev-token" -H 'content-type: application/json' -d '{}'

# official 2022 parrainages + scenario audit
curl -X POST http://127.0.0.1:8787/admin/ingest/parrainages -H "x-admin-token: dev-token"
node scripts/store_forecasts.mjs
curl -X POST http://127.0.0.1:8787/admin/forecast/snapshot -H "x-admin-token: dev-token"
curl "http://127.0.0.1:8787/admin/forecast/runs?limit=5" -H "x-admin-token: dev-token"
```

本地 D1：

```bash
pnpm db:migrate:local
pnpm db:seed:local
```

> `wrangler.local.jsonc` 去掉了 Workers AI binding，方便无 Cloudflare token 本地开发；Jev 会回退到关键词规则。生产 `wrangler.jsonc` 保留 AI binding。

## 已实现（P0）

- pnpm workspace：`apps/web`、`apps/pipeline`、`apps/compute`、`packages/domain`、`packages/db`
- Astro 7 + Svelte 5 + Tailwind 4，法语/英语/中文路由
- 首页评分榜、候选人页、地图页、民调页、市场页、方法论页、关于页、信息流占位
- 真实 2022 年首轮省级结果（data.gouv.fr / 内政部）→ SVG 地图
- D1 schema（37 张表/索引/FTS）+ 种子数据（15 政党、15 候选人、107 省、1,284 条 2022 结果）
- Hono pipeline：RSS 连接器（实测 302 条）、GDELT 连接器、X 连接器（需 token）、Jev 判断接口、队列消费者、Cron
- Python 容器：FastAPI + `/health`、`/parse-poll`、`/forecast`（蒙特卡洛骨架）
- 只读 API：`/api/v1/health`、`/candidates`、`/scores`、`/map/departments`，D1 不可用时回退种子

## P1 已实现

- `/fil`、`/en/feed`、`/zh/feed` 读取 D1 真实文章，支持来源/议题/搜索/分页
- 默认只显示选举相关文章；可切换“全部新闻”
- 规则分类器 + `judgments` 表；Jev 可用时自动替换
- 媒体热度 `media_momentum`：首页与信息流侧栏
- Kalshi / Polymarket / Metaculus 连接器（无匹配市场时安全跳过）
- 本地 Web/Pipeline 共用 `.wrangler/state`，端到端可读
- 管理接口：采集、回填判断、重算热度、清洗 HTML 实体

## 界面重构（数字大屏）

- 固定 `100dvh`，无整页滚动；6 个面板内部独立滚动
- 深色控制台 + 网格 + 青色高亮 + 等宽数字
- 排名 / 地图 / 详情 / 媒体热度 / 信息流 / 市场
- `/carte` 全屏深色地图 + 省份详情
- 点击候选人、地图省份、热度条目互相联动
- 权重滑块实时重算排名，URL `?w=` + localStorage 持久化
- 移动端为内部滚动的单列布局
- 详见 [docs/08-ui-dashboard.md](docs/08-ui-dashboard.md)

## P2 第一轮已实现

- 22 张 Wikimedia Commons 真人照片，本地 512×512，附作者/许可/来源；失败回退字母 SVG
- Sondax / Wikipédia 真实民调：48 个民调、535 行、16 位候选人
- 60 天窗口、样本量加权、21 天半衰期聚合
- 首页/候选人页显示真实民调均值、样本 n、最后调查日期
- `/sondages` 读取真实民调表，链接官方 notice
- 临时评分 v1：`poll + market + media + social`；缺失分量显示 `—`
- Polymarket 26 个市场（经 Sondax JSON），市场页真实数据
- Mastodon 82 条公开帖子，社交关注度进入评分
- 新 API：`/api/v1/polls`、`/polls/averages`、`/scores`
- 新迁移：`0003_candidate_avatar.sql`、`0004_poll_averages.sql`、`0005_avatar_credit.sql`、`0006_score_history_unique.sql`、`0007_market_candidate.sql`
- 60 天历史评分回填（930 行，poll+market）；趋势线已显示
- 2027 省级“机械情景”地图：2022 基线 + 全国统一 swing，明确标注不是预测
- Jev smoke eval：12 条法语样本；规则 baseline 相关性 91.7%、议题 50%；Jev 待 AI binding

## P3 已实现

- Jev 评估集：**360 条真实法语文本** + 360 条合成回归集；真实集规则相关性 96.4%、precision 97.3%；Jev 1.14.0 复核后 accuracy 98.3%、precision 94.3%、recall 98.8%、Brier 0.023、ECE 0.050（复核前 93.3/90.5/79.8）；302 篇文章已用 Jev 重新判断（43 篇选举相关）；Cloudflare 路径仍 402，TypeSafe 直连成功
- 民调 PDF 解析：`pdfplumber` 解析 Commission notice，草稿队列 + 复核页 `/sondages/relecture`
- Bluesky 连接器：585 条法语公开帖子；X 仍待 token
- 背书/parrainages：**13,427 条官方 2022 parrainages** + 11 条 2027 公开背书；五因子评分 40/20/15/10/15
- 市场历史：26 个 Polymarket、754 个快照；sparkline + 7/30 天变化 + 平台标签
- 省级情景：区域异质 swing、500 次抽样、领先概率、80% 区间、2017→2022 回测
- 577 选区立法模型：**2022/2024 双基线** + 4 种转移策略 + 亲和转移第二轮；`/legislatives`
- 情景审计：**18 个 run / 9,564 条 outcomes** 写入 `forecast_runs` / `forecast_outcomes`
- 每日 07:00 UTC 情景快照 + `/previsions` run 对比页
- Dashboard 45 秒轮询 + `/live` SSE（Durable Object）+ 页面/API ETag
- 评分每 15 分钟（市场后）和每小时（社交后）重算
- `/sondages/relecture` 显示 connector 最后成功时间
- 新迁移：`0008_poll_drafts.sql`、`0009_endorsements.sql`、`0010_parrainage_baseline.sql`、`0011_forecast_scope.sql`

## 下一步（P3 剩余）

1. 给 Workers AI 充值或配置 BYOK，然后用 `scripts/run_clef_calibration.py --model typesafe/jev` 跑 Jev 并记录校准。
2. 对真实文本评估集做独立人工复核，优先修正 precision 和退休/司法/制度议题。
3. 接入 X 官方 API（25 账号、4,000 reads/月硬 cap）。
4. 2027 官方 parrainages 公布后替换 2022 历史先验。
5. 立法模型加入 2024 第二轮真实转移率和政党退出协议。
6. 观察每日快照积累后的席位区间变化；必要时增加按模型筛选和导出。
