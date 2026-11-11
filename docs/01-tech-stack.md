# Vive la France 2027 — 技术栈决策（ADR-001 v2）

- 状态：已按你的 7 项决定修订
- 日期：2026-11-10
- 目标：选举前持续收集舆论、新闻、观点，对政党/候选人做统计分析、打分与预测
- 硬约束：Cloudflare 优先、前端轻、月预算 **< $50**、X 必须有、不做用户评论

## 0. 已锁定的决定

| 决定 | 落地方式 |
|---|---|
| 法语为主 + 英文 + 中文 | Astro i18n：`/`（fr）、`/en/`、`/zh/`；UI 全量翻译，内容按需翻译 |
| 不开放评论/线索 | 无用户账号、无 Turnstile、无 UGC 审核；只有 Cloudflare Access 保护的管理端 |
| 允许 Python/Julia 做贝叶斯 | **Python 容器**（PyMC + ArviZ + pdfplumber）；v1 不引入 Go |
| X 必须有 | 官方 X API pay-per-use，**只监控核心账号**，硬上限约 4,000 post reads/月 |
| 月预算 < $50 | 目标 $28–40，留 20% 缓冲；所有付费项设硬上限 |
| 暂不考虑域名 | 先用 `*.workers.dev`，站点 URL 走环境变量，后续换域名不改代码 |
| 选举前以舆论/新闻/观点为主 | 产品定位为“选情情报面板”，不是结果站；地图默认展示基线 + 模型投影 |

---

## 1. 修订后的技术栈

| 层 | 选择 | 相比 v1 的变化 |
|---|---|---|
| 前端 | **Astro 7 + Svelte 5 islands** + Tailwind 4 | 升级 Astro 7（2026-06 稳定，Astro 已加入 Cloudflare）；增加三语 i18n |
| 页面/只读 API | **Workers Static Assets + Astro SSR** | 不变 |
| 采集编排 | **Workers Cron + Queues + Workflows**（Hono） | 去掉 Browser Rendering（省钱） |
| 重计算 | **Python Container**（FastAPI + PyMC） | **替换 Go Container**；Go 仅保留为未来选项 |
| 数据 | **D1 + R2 + KV + Analytics Engine** | 不上 Basin、不上 Vectorize（v1） |
| 地图 | **TopoJSON/SVG** + **PMTiles on R2** | 选举前以省级投影/关注度图层为主 |
| 实时 | **CDN 15s 快照轮询 + SSE** | 不变；选举夜再启用 |
| AI | **Workers AI**（1B/3B）+ **TypeSafe Jev** + AI Gateway | Jev 做固定标签判断；生成类任务用 Workers AI；超限降级到规则 |
| X | **官方 API pay-per-use** | 只做核心账号，不做全站关键词搜索 |
| 管理端 | **Cloudflare Access** | 不变 |

```text
RSS / GDELT / Bluesky / Mastodon / X(核心账号) / 民调PDF / 市场API
                              │
                    ┌─────────▼──────────┐
                    │ pipeline Worker     │
                    │ Hono · Cron · Queue │
                    │ Workflows           │
                    └───────┬──────┬──────┘
                            │      │
              ┌─────────────▼──┐ ┌─▼──────────────┐
              │ Python Container│ │ Workers AI     │
              │ PDF / 贝叶斯 /  │ │ 分类/摘要/翻译 │
              │ 蒙特卡洛        │ │ 1B/3B + 缓存   │
              └─────────────┬──┘ └─┬──────────────┘
                            │      │
        ┌───────────────────▼──────▼──────────────────┐
        │ D1 运营库 · R2 原始快照/瓦片 · KV 快照指针   │
        │ Analytics Engine 事件 · Queues 缓冲          │
        └───────────────────┬─────────────────────────┘
                            │
                  ┌─────────▼──────────┐
                  │ web Worker (Astro) │──▶ CDN 15s SWR
                  │ SSR + /api/v1      │
                  └─────────┬──────────┘
                            │
                   Browser: Svelte islands
                   SVG 地图 + 图表 + 筛选器
```

---

## 2. X/Twitter：预算现实与方案

### 2.1 官方价格（2026-11 核实）

X API 已改为 **pay-per-use**，无月费：

- **Post read：$0.005 / 条**
- User read：$0.010 / 个
- 同一 post 在同一 UTC 日内重复读取只计一次
- 自助账户上限 300 万 post reads/月
- 新账户首次购 credits 有 $20 赠送，首次自动充值最高再 match $50（一次性）

### 2.2 三种做法与成本

| 做法 | 月 reads | 月成本 | 可行性 |
|---|---:|---:|---|
| 全站关键词搜索（20 次/天 × 100 条） | 60,000 | **$300** | 不可行 |
| 中等范围（10 次/天 × 100 条） | 30,000 | **$150** | 不可行 |
| **核心账号监控（25 个账号，1 次/小时，去重）** | **约 3,000–4,000** | **$15–20** | **推荐** |

> 结论：在 $50 总预算下，X 只能做“核心账号 + 列表”监控，不能做全站舆情搜索。全站覆盖交给 GDELT、Bluesky、Mastodon、法媒 RSS。

### 2.3 核心账号清单（约 25 个）

- 政党/阵营官方账号：RN、Renaissance、LFI、PS、LR、EELV、PCF、Horizons、Modem 等
- 已宣布/潜在候选人本人账号
- 民调机构：Ifop、Ipsos、Elabe、Harris、Odoxa、Cluster17 等
- 关键政治记者/评论员（5–8 个）
- 内政部/宪法委员会/官方选举账号

### 2.4 成本控制

- X Developer Console 设 **spending cap $20/月**。
- Worker 内维护 `x_reads_this_month` 计数器（KV/D1），达到 4,000 停止拉取。
- 按 `post_id` 去重；同一 UTC 日重复读取不重复计费。
- 每 60 分钟拉一次，不用 filtered stream（Enterprise 才有稳定低价）。
- 可尝试申请 X **Public Utility** 免费/ scaled access（选举信息类项目有机会，但不保证）。

### 2.5 如果“全站 X 搜索”是硬需求

只有两条路：

1. 预算提高到 **$300+/月**（官方 API），或
2. 用第三方转售 API（如 twitterapi.io，约 $0.15/1k tweets，$15 可买 10 万条），但**可能违反 X ToS**，需法务评估，不建议作为主方案。

### 2.6 Grok 能不能做采集？

**结论：不能作为主采集器。**

xAI API 的 `x_search` 确实能搜 X posts/profiles/threads，但：

- 计费是 **$5 / 1,000 posts fetched**（$0.005/post），和官方 X API **同价**；
- 还要加 Grok token 费（Grok 4.7：$2/M input、$6/M output）；
- 返回的是“答案 + 引用”，不是可分页的原始数据流；一次约 20 条，无法稳定计数/回测；
- 用 Grok 消费端账号在 X 站内自动搜索/导出，属于自动化滥用，ToS 风险高。

正确分工：

```text
官方 X API（核心账号原始 posts）──▶ D1/R2 ──▶ Workers AI 分类/摘要 ──▶ 评分
xAI x_search（可选，2 次/天）──────▶ 只生成“X 全网舆情周报”，存摘要+引用
```

- 采集：官方 X API，25 个核心账号，$15–20/月。
- 分析：优先用 Workers AI 对已采集 posts 做分类/摘要，边际成本接近 0。
- 若确实要“Grok 对全网的看法”：xAI `x_search` 每天 2 次、每次 20 条，约 **$7–8/月**，只存摘要与引用，明确标注“AI 分析，不是原始数据”。
- **不要**用 Grok 消费端账号做站内自动采集。

详细复核见 [`03-stack-review-2026-11.md`](03-stack-review-2026-11.md)。

---

## 3. Python 容器（替换 Go）

### 3.1 为什么是 Python

- 贝叶斯：PyMC / NumPyro / ArviZ 生态成熟，分层模型、收敛诊断、后验可视化都现成。
- PDF：`pdfplumber` 对民调表格的抽取明显好于 Go 现成库。
- 蒙特卡洛：NumPy 向量化足够，20k 次模拟秒级完成。
- Julia（Turing.jl）也可行，但镜像更大、部署资料少、团队协作成本高；v1 不选。

### 3.2 形态

- 单容器，FastAPI，端点：
  - `POST /parse-poll`：PDF → 结构化 JSON
  - `POST /forecast`：读取 D1 快照 → 贝叶斯/蒙特卡洛 → 结果
  - `POST /backfill`：历史数据 ETL
  - `GET /health`
- 只由 Queue/Workflow 调用，不直接暴露公网；Container binding + shared secret。
- 镜像：`python:3.12-slim` + `uv`，多阶段构建；PyMC 镜像约 700 MB–1 GB。
- 实例：`standard-1`（0.5 vCPU、4 GiB、8 GB disk），`sleepAfter=60s`，`maxInstances=1`。
- 模型结果写 D1/R2，**不在请求时跑 MCMC**；每天/每周批量跑一次。

### 3.3 成本

按每天 1–2 小时运行：约 **$2.5–5/月**。即使 24/7 跑 `standard-1`，也约 $12–15/月，仍在预算内，但没必要。

### 3.4 Go 还要不要

v1 不需要。以下情况再引入 Go：

- 每天解析数万份文档，Python 吞吐不够；
- 需要长连接/高并发抓取；
- 想把容器缩到 30 MB、冷启动 1 秒内。

届时加一个 Go 容器即可，架构不变。

---

## 4. 预算表（目标 < $50）

| 项目 | 规格 | 月成本 |
|---|---|---:|
| Workers Paid | 基础订阅 | $5.00 |
| Workers 请求/CPU | 约 1–3M 请求，低 CPU | $1–3 |
| D1 | < 1 GB，读多写少 | $0.50–1 |
| R2 | 5–10 GB 原始快照 + 瓦片 | $0.50–1.50 |
| Queues | < 1M operations | $0.20–1 |
| Workers AI | 1B/3B，优先用每日 10k 免费 neurons | $0–3 |
| Python Container | `standard-1`，1–2 h/天 | $2.50–5 |
| X API | 3,000–4,000 post reads | $15–20 |
| 监控/备份 | Workers Logs + R2 导出 | $0 |
| **合计** | | **$25–40** |

**缓冲**：$10–25。触发扩容的条件：X reads 超 4,000、AI 超免费额度、选举夜流量。

### 4.1 省钱规则

- 不用 Browser Rendering、Cloudflare Images、Basin、Vectorize。
- Workers AI 只对“需要判断”的条目调用；先用关键词/词典/规则。
- 摘要只做 Top N/天；翻译只做首页、候选人页、Top 文章。
- 原始 HTML/PDF 在 R2 存 90 天，之后转 IA 或删除；聚合结果长期保留。
- 所有付费 API 设硬 cap + 告警（X、AI Gateway、Cloudflare 预算提醒）。

---

## 5. 选举前的产品形态

> 详细指标与页面见 [`02-product-scope.md`](02-product-scope.md)。

核心不是“结果地图”，而是 **舆情 + 民调 + 市场 + 媒体关注度 → 候选人/政党评分与胜率**。

### 5.1 每个候选人/政党的指标

| 指标 | 来源 | 说明 |
|---|---|---|
| `poll_avg` | 民调聚合 | 首轮意向均值 + 趋势 + 区间 |
| `market_prob` | Polymarket/Kalshi/Betfair/Metaculus | 去水后的胜率/进次轮概率 |
| `share_of_voice` | 法媒 + 非法媒 RSS/GDELT | 提及量占比，按来源加权 |
| `social_attention` | X/Bluesky/Mastodon/YouTube | 去重作者 + 互动量，过滤机器人 |
| `stance_balance` | 文章/帖子分类 | 支持/反对/中性分布，附样本量 |
| `topic_salience` | 议题分类 | 该候选人被关联到哪些议题 |
| `composite_score` | 上述加权 | 0–100，可拆解、可调权重 |
| `P(win)` / `P(runoff)` | 贝叶斯 + 蒙特卡洛 | 与 composite score 分开呈现 |

**原则**：不输出“全国情绪”单一结论；展示分布、样本量、置信度与方法论。

### 5.2 地图（选举前）

1. **2022/2024 基线**（真实结果）
2. **2027 首轮投影**（全国民调 + 地区 swing + 人口结构；标注“模型估计”）
3. **媒体/社交关注度**（按省/大区）
4. **竞选活动**（访问、集会、背书；人工/半自动）
5. **立法席位投影**（后续，577 选区）

默认打开“基线”，投影层需用户主动切换，并显示不确定性。

### 5.3 页面

- `/` 总览：评分榜、趋势、最新民调、市场、地图预览
- `/candidats/[slug]`、`/partis/[slug]`
- `/sondages`、`/marches`、`/carte`、`/fil`
- `/methodologie`、`/a-propos`
- `/admin`（Access）：民调复核、实体合并、来源健康度

### 5.4 三语

- UI：全量 fr/en/zh。
- 内容：法文原文为主；标题/摘要按需机器翻译，标注“自动翻译”。
- 候选人/政党/议题有术语表，保证中文译名一致。
- `hreflang`、分语言 sitemap、语言切换不丢当前页。

---

## 6. 数据层（在 v1 基础上补充）

新增/调整：

```sql
entities(id, type, canonical_name, name_fr, name_en, name_zh, aliases_json)
article_entities(article_id, entity_id, stance, confidence, evidence_span)
social_posts(id, platform, post_id, author_hash, author_type, text, lang,
             created_at, like_count, repost_count, reply_count, url,
             bot_score, candidate_ids_json, party_ids_json)
social_aggregates(platform, entity_id, bucket_hour, posts, unique_authors,
                  engagement, stance_support, stance_oppose, stance_neutral)
scores(entity_id, as_of, poll_avg, market_prob, share_of_voice,
       social_attention, stance_balance, composite, components_json, confidence)
score_history(entity_id, as_of, composite, components_json)
```

保留 v1 的 `parties/candidates/elections/constituencies/polls/poll_results/markets/market_snapshots/articles/forecast_runs/forecast_outcomes/results`。

---

## 7. 采集与合规

| 源 | 方式 | 频率 | 成本/备注 |
|---|---|---|---|
| 法媒 RSS | RSS/Atom | 5 min | 免费；只存标题+摘要+链接 |
| 非法媒 | GDELT DOC 2.0 + RSS | 15 min | 免费；覆盖面广 |
| Bluesky | AT Protocol 公开 API | 5 min | 免费；需 app password |
| Mastodon | 公开 API | 5 min | 免费；按实例限速 |
| X | 官方 API，核心账号 | 60 min | $15–20/月；硬 cap |
| YouTube | Data API | 30 min | 配额内免费；可选 |
| 民调 | 官网/PDF/Commission des sondages | 1 h | PDF 解析 + 人工复核 |
| 市场 | Polymarket/Kalshi/Betfair/Metaculus | 5–15 min | 免费 API；Betfair 需账户 |
| 参考 | data.gouv/内政部/INSEE/Wikidata | 日/周 | 免费 |

**不做**：Reddit（API 成本/限额不划算）、Instagram/TikTok（无权限）、Browser Rendering（省钱）、付费墙绕过。

**合规**：
- 民调必须附机构、样本、日期、方法论、误差、Commission notice；投票前一天与投票日关闭民调/预测模块（L52-2）。
- 社交数据只处理公开内容，不建用户画像；只存聚合 + 必要样本；提供删除/更正通道。
- X 遵守 Developer Agreement；不转售原始数据；展示以聚合/引用为主。
- 所有 AI 生成内容标注；不自动发布断言式结论。

---

## 8. 里程碑（选举前）

| 阶段 | 时间 | 交付 |
|---|---|---|
| P0 | 第 1–2 周 | pnpm workspace、Astro 三语骨架、D1 schema、种子数据（政党/候选人/577 选区/2022 基线）、静态地图、部署 |
| P1 | 第 3–4 周 | RSS + GDELT + Bluesky/Mastodon、去重、实体链接、`/fil`、候选人页、share of voice |
| P2 | 第 5–6 周 | 民调 PDF 解析 + 复核、市场快照、`/sondages`、`/marches`、评分 v1 |
| P3 | 第 7–9 周 | X 核心账号、贝叶斯模型、投影地图、方法论页、回测 |
| P4 | 第 10–12 周 | 提醒/日报、性能与成本压测、合规复核、选举夜模式预留 |

目标：**2027 年 1 月前**完成 P0–P3，留出 3 个月积累历史数据与调参。

---

## 9. 风险与对策

| 风险 | 对策 |
|---|---|
| X 成本失控 | spending cap + 代码内计数器 + 只拉核心账号；申请 Public Utility |
| 预算超 $50 | 所有付费项硬 cap；AI 先用免费额度；容器按需；每月对账 |
| 民调 PDF 格式杂 | 模板 + LLM 兜底 + 人工复核队列；先覆盖 8–10 家主要机构 |
| 社交噪声/机器人 | 去重作者、账号年龄/粉丝阈值、bot score；只展示分布与样本 |
| 投影地图误导 | 明确“模型估计”；默认显示基线；给区间；方法论页 |
| 法语/中文翻译质量 | 只翻译关键内容；术语表；标注自动翻译；重要页面人工校对 |
| 法律风险 | 律师复核 L52-2、GDPR、X ToS；静默期自动开关 |
| 供应商锁定 | D1 可导出 SQLite；R2 原始数据可重放；容器可移植 |

---

## 10. 已确认与仍待确认

已确认：

- 语言：法语为主 + 英语 + 中文；中文只做 UI + 关键页面，新闻流保留法语原文。
- 不做用户评论/线索。
- 评分权重：有默认值，用户可在前端调整并分享。
- Python 容器做贝叶斯，v1 不用 Go。
- X 必须有；官方 API 核心账号监控；Grok 只做可选“周报分析”，不做采集。
- 月预算 < $50；暂不考虑域名。

仍待确认：

1. **X 核心账号清单**：25 个账号的具体名单（政党/候选人/民调机构/记者/官方）。
2. **Grok 周报**：v1 是否要（+$7–8/月），还是 Phase 2 再加。
3. **Betfair**：是否有账户/API 权限？没有就先用 Polymarket + Kalshi + Metaculus。
4. **部署账户**：Cloudflare 账号是否已开 Workers Paid？X 开发者账号是否已建？
