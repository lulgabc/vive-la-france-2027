# 2026-11 技术栈复核

- 目的：在开工前重新评估是否有更好/更新的技术栈
- 结论：**核心栈不变，三处更新**；Grok 不适合做采集器

---

## 1. 结论先行

| 层 | 原方案 | 复核后 | 动作 |
|---|---|---|---|
| 前端 | Astro + Svelte 5 | **Astro 7 + Svelte 5** | 升级 |
| 页面/API | Workers + Astro SSR | 不变；可用 Astro 7 的 Hono advanced routing | 保持 |
| 采集 | Cron + Queues + Workflows | 不变 | 保持 |
| 重计算 | Python Container | 不变；加 Polars/DuckDB 做回测 | 保持 |
| 数据 | D1 + R2 + KV + AE | 不变；D1 Sessions/读复制可用 | 保持 |
| 搜索 | D1 FTS5 | **D1 FTS5 为主；AI Search 可选** | 观察 |
| 实时 | CDN 轮询 + SSE | 不变；PartyKit 托管已关，勿用 | 保持 |
| X | 官方 API 核心账号 | 不变；**Grok 不做采集** | 明确 |
| 预算 | < $50 | 不变 | 保持 |

**没有发现需要推翻重来的新栈。** 2026 年真正影响决策的变化只有四个：

1. **Astro 在 2026-01 加入 Cloudflare**，Astro 7（2026-06）已稳定，Cloudflare 适配是一等公民。
2. **Cloudflare AI Search 2026-10 GA**，做站内语义搜索比手搓 Vectorize 更省事；但 v1 不需要。
3. **xAI API 的 `x_search` 按 $5/1k posts 计费**，和官方 X API 同价，还要加 token 费——Grok 不是便宜的采集通道。
4. **PartyKit 托管平台 2026-10-23 关闭**，继任者是 PartyServer（DO）；我们本来就不用，避免踩坑。

---

## 2. Grok 能不能做 X 采集？

### 2.1 技术上可以，但方式不对

xAI API 提供 `x_search` 工具：

- 搜索 X posts、profiles、threads
- 支持 `allowed_x_handles`、`from_date`、`to_date`
- 返回答案 + citations，并在 `usage.server_side_tool_usage_details` 里报告 `x_posts_fetched`

价格（2026-11 核实）：

| 项 | 价格 |
|---|---|
| X Search | **$5 / 1,000 posts fetched**（$0.005/post） |
| X profiles | $10 / 1,000 |
| Grok 4.7 tokens | $2 / M input，$6 / M output |
| Web Search | $5 / 1,000 calls |

### 2.2 为什么不适合做主采集

| 问题 | 说明 |
|---|---|
| **不便宜** | 每 post $0.005，和官方 X API 完全同价；还要付 Grok token 费。等于“读一遍再让模型读一遍”，比官方 API 更贵 |
| **不是 firehose** | 它是一次 LLM 查询，返回摘要 + 引用，不是可分页的原始数据流；无法稳定统计“今天有多少条”“谁发得最多” |
| **不可复现** | 同一 query 不同时间/模型版本，返回集合会变；做时间序列和回测很危险 |
| **数据不完整** | 一次通常只回 20 条左右；40 条/天不足以覆盖 25 个核心账号 |
| **ToS 风险** | 用 Grok 消费端账号在 X 站内自动搜索/导出，属于自动化滥用；xAI API 是合规路径，但价格不占优 |
| **幻觉/摘要偏差** | 你需要的是原始 post ID、作者、时间、互动量；LLM 摘要不适合做计数与聚合 |

### 2.3 正确用法：Grok 只做“分析师”，不做“采集器”

推荐分工：

```text
官方 X API（核心账号，原始 posts）──▶ D1 / R2 ──▶ Workers AI 分类/摘要
                                              │
                                              └──▶ 评分、声量、立场

xAI x_search（可选，2 次/天）──▶ 只生成“X 全网舆情周报”
                                 存 query + answer + citations，不存原始 posts
```

- 采集：官方 X API，25 个核心账号，$15–20/月。
- 分析：优先用 Workers AI 对**已经采集到的 posts** 做分类/摘要，边际成本接近 0。
- 如果确实想要“Grok 对全网 X 的看法”：xAI `x_search` 每天 2 次、每次 20 条，约 **$7–8/月**（含 token），只存摘要与引用，明确标注“AI 分析，不是原始数据”。
- **不要**用 Grok 消费端账号做站内自动采集。

### 2.4 预算影响

| 方案 | X 相关月成本 | 总预算 |
|---|---:|---:|
| 官方 API 3,000 posts | $15 | $25–40 |
| 官方 API + Grok 2 次/天 | $22–23 | $32–47 |
| Grok 替代官方 API | 不可行（覆盖不足） | — |

> 建议 v1 先不上 Grok。等评分/信息流跑通，再加“Grok 周报”作为可选模块。

---

## 3. 前端：为什么还是 Astro 7

### 3.1 2026 年的变化

- Astro Technology Company 于 **2026-01 加入 Cloudflare**。
- **Astro 7** 于 2026-06 发布：Vite 8、Rust 编译器、Advanced Routing（含 Hono 支持）。
- Astro 6.4 已支持 Cloudflare 的高级路由 helper。
- 这意味着 Astro + Cloudflare 的组合从“社区适配”变成“一方维护”，风险显著降低。

### 3.2 对比其他前端

| 方案 | 优点 | 为什么不选 |
|---|---|---|
| **Astro 7 + Svelte 5** | 内容/SEO 强、默认 0 JS、岛式交互、Cloudflare 一方支持 | **选它** |
| SvelteKit | 全栈一体、Svelte 生态好 | 内容组织/SEO 不如 Astro；SSR 默认更重 |
| Next.js 16 | 生态最大、RSC | 重、构建慢、与“轻”目标冲突 |
| TanStack Start | 类型安全、现代 | 新、生态小、React 运行时更重 |
| Qwik | resumability、首屏快 | 生态小、调试成本高 |
| Nuxt 4 | Vue 生态 | 没有明显优势 |
| Go + Templ + HTMX | 极简、服务端渲染 | Go 在 Cloudflare 只能容器；前端生态弱 |
| Phoenix LiveView | 实时强 | 不在 Cloudflare；托管成本/运维 |
| Rails 8 + Hotwire | 开发快 | 重、Ruby 托管 |
| Django + HTMX | 成熟 | 重、Python 托管 |

**结论**：Astro 7 + Svelte 5 仍是这个“内容 + 数据面板 + 三语 + 地图”场景的最优解。

### 3.3 Astro 7 的两个实用点

- **Advanced Routing + Hono**：可以把 `/api/v1/*` 用 Hono 写在 Astro 里，少一个 Worker。
- **Live Content Collections**：民调/候选人等外部数据可以作为 content layer 读取；但我们的数据在 D1，仍以 D1 查询为主。

---

## 4. 搜索：D1 FTS5 还是 AI Search？

| 方案 | 成本 | 适用 |
|---|---|---|
| **D1 FTS5** | 几乎为 0 | 关键词搜索、标题/摘要/实体过滤；v1 足够 |
| **Cloudflare AI Search** | 免费额度：5M ingestion tokens、10 GB、1,000 semantic + 1,000 full-text queries/月；超出 $0.75/1k semantic、$0.10/1k full-text | 语义搜索、“问数据”、RAG |
| 自建 Vectorize + embeddings | 需要自己切块/索引/重排 | 不推荐，AI Search 已封装 |

**建议**：

- v1 用 D1 FTS5 + 结构化筛选。
- Phase 2 若要做“用自然语言问选情”（例如“哪些候选人在购买力议题上声量上升？”），再接 AI Search；免费额度足够早期。
- 不要把 AI Search 当作主数据库；它只做检索层。

---

## 5. 数据层：D1 仍然够用

| 备选 | 结论 |
|---|---|
| **D1** | 选它：< 1 GB、读多写少、边缘、零运维 |
| Neon/Postgres + Hyperdrive | 需要 PostGIS/复杂 join/多写者时再换；$19+/月，挤压预算 |
| Supabase | 多一套 auth/realtime，重复 |
| Turso | 与 D1 同类，没有迁移理由 |
| Convex | 实时 reactivity 好，但锁定与成本 |
| ClickHouse | 规模不够，过重 |
| DuckDB | **在 Python 容器里做回测/聚合**，不对外提供服务；推荐 |

**D1 使用要点**：

- 开读复制 + Sessions API（读多）。
- 写入批处理；避免大范围 UPDATE。
- 每日导出到 R2；D1 Time Travel 7 天。
- 单库接近 8 GB 时评估迁移。

---

## 6. 采集/编排：Workflows 仍然比 Agents SDK 合适

| 方案 | 结论 |
|---|---|
| **Cron + Queues + Workflows** | 选它：确定性、可重试、可观测、便宜 |
| Cloudflare Agents SDK | 适合有状态、对话式 agent；我们不需要 |
| Temporal | 过重 |
| Airflow/Dagster/Prefect | 过重，且要额外托管 |
| Kafka/Redpanda | 过重；Queues 足够 |
| Basin Pipelines | 事件量 > 千万/天再考虑；现在不需要 |

**Grok/LLM 的位置**：在 Workflow 里作为一个 step 调用（Workers AI 或 xAI API），而不是让 agent 自己决定采集什么。采集逻辑必须是确定性的。

---

## 7. 实时：不要用 PartyKit，SSE/轮询足够

- PartyKit 托管平台 **2026-10-23 关闭**；继任者是 **PartyServer**（基于 DO）。
- Cloudflare Realtime 是音视频 SFU，不是数据广播。
- 我们的实时需求是“选举夜比分/地图更新”，用 **CDN 15s 快照 + 客户端 20–30s 轮询** 最简单、最便宜。
- 直播文字流用 SSE；只有在需要“房间/在线状态/协同”时才上 DO/PartyServer。

---

## 8. 模型：Python 仍然比 Julia 合适

| 方案 | 结论 |
|---|---|
| **Python + PyMC/NumPyro + ArviZ + Polars** | 选它：生态、部署、调试、招聘都更好 |
| Julia + Turing.jl | 数学表达好，但镜像大、生态小、部署资料少 |
| Stan + CmdStanPy | 也强；PyMC 的 Python 集成更顺 |
| Go + gonum | 蒙特卡洛可以，分层贝叶斯生态弱 |

**容器内工具链**：

- `uv` 管理依赖，多阶段构建。
- `polars` 做 ETL/回测（比 pandas 轻快）。
- `duckdb` 读 R2 上的 Parquet 做临时分析。
- `pymc` + `numpyro` 采样；`arviz` 诊断。
- 模型产物（后验摘要、校准表）写 R2/D1，不把 MCMC 放在请求路径。

---

## 9. 最终技术栈 v3

```text
前端        Astro 7 + Svelte 5 islands + Tailwind 4
路由/API    Astro SSR + Hono（advanced routing）on Workers
采集        Cron + Queues + Workflows（Hono）
重计算      Python Container（FastAPI + PyMC + Polars + pdfplumber）
数据        D1（运营）+ R2（原始/瓦片/导出）+ KV（快照指针）+ Analytics Engine（事件）
搜索        D1 FTS5（v1）→ Cloudflare AI Search（Phase 2，可选）
地图        TopoJSON/SVG + PMTiles on R2 + MapLibre（下钻）
实时        CDN 15s SWR + SSE（直播流）
AI          Workers AI 1B/3B + AI Gateway；Grok 仅可选“周报分析”
X           官方 API pay-per-use，25 个核心账号，cap 4,000 reads/月
管理        Cloudflare Access
CI          GitHub Actions + Wrangler
```

---

## 10. 什么情况下我会改结论

| 触发条件 | 改用什么 |
|---|---|
| 需要复杂 SQL/PostGIS/多写者 | Neon Postgres + Hyperdrive |
| 事件量 > 千万/天 | Basin（Iceberg） |
| 需要“问数据”/语义搜索 | Cloudflare AI Search |
| 需要房间/协同/在线状态 | PartyServer（DO） |
| 需要 Go 的高吞吐解析 | 加 Go Container |
| 预算提到 $300+/月 | 官方 X 全站搜索 |
| 团队更熟 React | Astro + React islands（仍是 Astro） |

---

## 11. 参考

- xAI API pricing / X Search docs（2026-11）
- Cloudflare AI Search GA & pricing（2026-10/11）
- Astro 6/7 release notes；Astro joins Cloudflare（2026-01）
- PartyKit hosted shutdown（2026-10-09）
- Cloudflare Containers GA（2026-04）
- Cloudflare D1 limits / read replication（2026-10）
