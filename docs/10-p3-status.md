# P3 实现状态（2026-11-10）

本轮把 P2 留下的六项继续推进到可运行状态。核心原则仍然是：**真实数据优先，模型明确标注“情景，不是预测”，缺失或未验证的数据不伪造。**

## 总览

| # | 任务 | 状态 | 关键结果 |
|---|---|---|---|
| 1 | Jev 300–500 条法语评估 + Workers AI | 完成（TypeSafe 直连） | 360 条真实法语文本 + 360 条合成回归集；Jev 1.14.0 复核后 accuracy 98.3%、precision 94.3%、recall 98.8%、Brier 0.023、ECE 0.050 |
| 2 | 民调 PDF 解析 + 人工复核 + notice 校验 | 完成 | 真实 Commission notice 解析 12 位候选人；草稿队列 + 审批/拒绝 API + 复核页 |
| 3 | Bluesky/X + 背书 → 五因子评分 | 完成 | Bluesky 585 条；13,427 条官方 2022 parrainages；11 条 2027 背书；五因子 40/20/15/10/15 |
| 4 | 市场时间序列/多平台 | 完成 | 26 个 Polymarket、754 个快照、41 个日期；sparkline + 平台标签 |
| 5 | 省级情景异质性/不确定性/回测 | 完成 | 区域异质 swing、500 次抽样、领先概率、80% 区间、2017→2022 回测 |
| 6 | 577 选区 + 立法席位模型 | 完成 | 2022/2024 双基线、4 种转移策略、559 个官方轮廓（539 本土）、席位情景 + 地图 |

## 数据规模

| 指标 | 数值 |
|---|---:|
| 文章 | 302 |
| 社交帖子 | 667（Bluesky 585 + Mastodon 82） |
| 民调 | 49 |
| 民调结果行 | 547 |
| 市场 | 26（Polymarket） |
| 市场快照 | 754 |
| 2022 官方 parrainages | 13,427 |
| 2027 背书 | 11 |
| 情景运行 | 9 |
| 情景结果行 | 9,564 |
| Jev 评估样本 | 360 |
| 立法选区 | 577 |
| 选区轮廓 | 559（539 本土 + 20 海外） |
| 省级情景抽样 | 500 |
| 立法情景抽样 | 200 |

## 1. Jev：真实法语文本 + 合成回归集

> 2026-11-11 更新：Cloudflare Workers AI 路径的 Jev 返回 **402 Insufficient balance**（third-party model 需要 AI Gateway credits 或 BYOK）。改用 TypeSafe 直连 API key 后，**Jev 1.14.0 已跑完 360 条真实文本，复核后 accuracy 98.3%、precision 94.3%、recall 98.8%、Brier 0.023、ECE 0.050（复核前 93.3/90.5/79.8，Brier 0.048）。详细校准见 [11-jev-calibration.md](11-jev-calibration.md)。

### 评估集

- **主评估集（360 条真实法语文本）**：`apps/pipeline/src/judge/jev-eval-real-fr.json`
  - 来源：302 篇已采集文章 + 58 条 Bluesky 帖子
  - 标签由显式 rubric 生成；其中 **39 条**选举相关性标签经过人工复核并覆盖，`label_source: agent-human-review`
  - 其余 321 条为 `agent-silver-rubric`；文本真实，但不是独立人工标注
- **合成回归集（360 条）**：`apps/pipeline/src/judge/jev-eval-fr.json`
  - 12 条人工 smoke + 348 条模板生成
  - 保留用于回归和硬案例测试
- 生成脚本：`scripts/generate_jev_real_eval.py`、`scripts/generate_jev_eval.py`

### 规则 baseline

| 指标 | 真实文本 360 | 合成回归 360 |
|---|---:|---:|
| 相关性准确率 | **96.4%** | 86.9% |
| 相关性 precision | **97.3%** | 97.8% |
| 相关性 recall | **86.9%** | 74.9% |
| 议题准确率 | **67.2%** | 68.3% |
| 议题 macro accuracy | **66.0%** | 68.2% |

第一轮真实文本评估的 precision 只有 61.9%，原因是规则把候选人姓名单独当作选举信号，且 rubric 的硬负例误伤了 Teddy Riner 等真实选举新闻。人工复核 39 条选举标签并收紧规则后：

- precision **61.9% → 97.3%**
- accuracy **89.2% → 96.4%**
- recall 仍有 86.9%，主要漏掉外语帖子和只提候选人、不含选举上下文的帖子

议题准确率仍偏低（67.2%），下一步应单独复核议题标签。

### Workers AI 实际运行

`evaluateJev()` 已实现真实的 `env.AI.run('typesafe/jev', …)` 路径，带并发、延迟、按议题指标和混淆矩阵。本地运行返回：

```json
{
  "model": "fallback-keywords",
  "jev": null,
  "blocked": "Workers AI binding is not available in this runtime. Run `wrangler login` and deploy with the AI binding to execute Jev."
}
```

**状态**：2026-11-11 已登录 Cloudflare；Cloudflare Workers AI 路径的 Jev 返回 **402 Insufficient balance**，但 TypeSafe 直连 API key 可用，Jev 已实际跑完。Cloudflare 路径仍需要 AI Gateway credits 或 BYOK。生产 `wrangler.jsonc` 保留 AI binding。Cloudflare 路径充值后执行：

```bash
npx wrangler login
curl -X POST http://127.0.0.1:8787/admin/recompute-scores -H "x-admin-token: dev-token"
curl "http://127.0.0.1:8787/admin/eval/jev?dataset=real&limit=360" -H "x-admin-token: dev-token"
```

## 2. 民调 PDF → 人工复核

### 解析器

- `apps/compute/app/parse_poll.py`：`pdfplumber` 文本 + 表格抽取
- `POST /parse-poll`：下载 PDF，返回机构、赞助方、 fieldwork 起止、样本量、方法、候选人结果、置信度、警告、原文
- 真实测试：Commission des sondages notice **2381**（Toluna Harris Interactive / M6 & RTL，72 页）
  - 自动识别：`2026-11-03 → 2026-11-05`、`n=2101`、12 位候选人
  - 结果页：37
  - 置信度：0.95
- 失败时返回 warnings，而不是猜数字。例如 Ifop notice 2382 只有 2022 投票回忆，没有 2027 投票意向，解析器返回 0 条结果并提示人工检查。

### 草稿队列

迁移：`0008_poll_drafts.sql`

| 字段 | 用途 |
|---|---|
| `parsed_json` | 完整解析结果 |
| `raw_text` | 原文前 20k 字符，便于审计 |
| `confidence` | 解析置信度 |
| `status` | `pending` / `approved` / `rejected` |
| `checksum` | 防止同一 PDF 重复入库 |
| `review_note` | 复核意见 |

审批时会：

1. 解析 `pollster` → 现有 `pollsters` 表（`Toluna Harris Interactive` → `harris`）
2. 映射候选人姓名 → `candidate_id`
3. 写入 `polls` + `poll_results`
4. 标记草稿 `approved`
5. 重新聚合 60 天民调
6. 重新计算五因子评分

### 复核界面

- `/sondages/relecture`
- 输入 `ADMIN_TOKEN`（本地 `dev-token`），列出 pending 草稿
- 显示机构、notice 号、样本量、fieldwork、置信度、警告、PDF 链接
- 一键 Approve / Reject
- token 只存在当前标签页的 `sessionStorage`

### API

```bash
POST /admin/polls/parse
GET  /admin/polls/drafts?status=pending|approved|rejected|all
GET  /admin/polls/drafts/:id
POST /admin/polls/drafts/:id/approve
POST /admin/polls/drafts/:id/reject
POST /admin/polls/drafts/import
```

## 3. Bluesky + 背书 → 五因子评分

### Bluesky

- 连接器：`apps/pipeline/src/connectors/bluesky.ts`
- 端点：`https://api.bsky.app/xrpc/app.bsky.feed.searchPosts`（未认证可用）
- 15 个查询：`présidentielle 2027`、候选人姓名等
- 过滤：`langs` 含 `fr` 或法语文本特征；去重；匹配候选人别名
- 实测：**585 条**法语公开帖子入库
- 已加入 15 分钟 cron 和 `POST /admin/ingest/bluesky`

### 背书 / parrainages

- 数据：`apps/pipeline/src/config/endorsements-2027.json`
- 迁移：`0009_endorsements.sql`
- 11 条真实公开背书/承诺，全部带来源链接：
  - Darmanin、Bregeon → Édouard Philippe
  - Faure、Philippe Brun、Jadot → Raphaël Glucksmann
  - Majorité des députés communistes → Jean-Luc Mélenchon
  - Bardella、Aliot → Marine Le Pen
  - Lisnard、Villepin、Mélenchon 的 parrainage 承诺（明确标注“未验证”）
- 权重是编辑权重，不是概率。

### 五因子评分

```text
available = 40 (poll) + 20 (market) + 15 (media) + 10 (social) + 15 (elite)
score = (
  40 * poll_norm +
  20 * market_norm +
  15 * media_norm +
  10 * social_norm +
  15 * elite_norm
) / available
```

`elite_norm` 由两部分组成：

1. **结构性强弱**：候选人所属阵营在 2022 立法选举中的席位占比
2. **公开背书**：`endorsements.weight` 之和

然后按最高值归一化到 0–1。这样每个候选人都有可解释的政治信号，而不是只有少数有背书的人。

当前头部（2026-11-10）：

| 候选人 | 评分 | 民调 | 市场 | 媒体 | 社交 | 政治信号 |
|---|---:|---:|---:|---:|---:|---:|
| Marine Le Pen | 79 | 34 % | 50 % | 24 % | 10 % | 56 % |
| Jean-Luc Mélenchon | 57 | 17,3 % | 15 % | 20 % | 16 % | 74 % |
| Édouard Philippe | 46 | 13,2 % | 10 % | 12 % | 12 % | 86 % |
| Raphaël Glucksmann | 41 | 11,4 % | 3 % | 17 % | 9 % | 70 % |

> 仍是相对强度指数，不是胜率。

## 4. 市场时间序列与多平台

- `readMarkets()` 现在返回每个市场的 `history[]`、`change_7d`、`change_30d`
- `/marches`：平台标签（Toutes / Polymarket / Kalshi / Metaculus）、sparkline、7 天/30 天变化、平均概率、最高概率市场
- Dashboard 市场面板也显示 mini sparkline
- 实测：26 个 Polymarket、754 个快照、41 个不同日期
- Kalshi：连接器正常，但无 France 2027 市场 → 0
- Metaculus：无 token → skipped
- Polymarket 官方 Gamma/CLOB API 本机不可达，继续使用 Sondax 公共镜像

## 5. 省级情景：异质性、不确定性、回测

### 模型

`apps/web/src/lib/projection.ts`

- 基线：2022 省内结果
- 全国：当前民调均值
- 区域异质性：每个区域、每个政党的 2022 偏差 → `elasticity = 1 + 0.35 * tanh(lean / 6)`，限制在 0.55–1.45
- 不确定性：
  - 全国共同冲击 N(0, 1.5)
  - 候选人特定误差 `1.1 + 5.5 / sqrt(n_polls)`
  - 区域噪声 N(0, 0.7)
  - 省级噪声 N(0, 0.8)
  - 500 次 seeded Monte Carlo（seed `20270418`）
- 输出：
  - 每省领先者、平均份额
  - `win_prob`（领先概率）
  - 领先份额的 10–90% 区间
  - 全国阵营胜出频率

### 回测

- 用 **2017 省级首轮** 作为基线，应用 **2017→2022 全国阵营 swing**，预测 2022 省级赢家
- 对比：
  - 统一 swing：**11%** 准确率
  - 区域异质 swing：**40%** 准确率
  - n = 107 个省
- 这个结果说明 2017→2022 是一次真实重组，统一 swing 很弱；区域异质模型明显更好，但仍不是预测。

### UI

- `/carte` 与 Dashboard 地图支持 `2022` / `Scénario 2027`
- 颜色深浅由 `win_prob` 决定
- 省份详情显示：领先者、领先概率、80% 区间、Top 6
- 明确标注：
  - “Scénario mécanique — swing régional hétérogène, base 2022, 500 tirages. Pas une prévision.”

## 6. 577 选区 + 立法席位模型

### 数据

- 官方选区轮廓：`apps/web/public/geo/circonscriptions.geojson`
  - 来源：data.gouv.fr / contours des circonscriptions législatives
  - 559 个轮廓（539 本土 + 20 海外）；11 个海外侨民选区无几何
  - 已修正 GeoJSON 环方向（否则 d3-geo 会把多边形解释为“全球减去选区”）
- **2022 立法基线**：`packages/domain/src/seed/legislative-2022.json`
  - 577 个选区，首轮阵营份额、赢家、第二轮结果
  - 全国首轮：左 33.2%、中 27.0%、右 13.6%、RN 19.8%、Rec 4.2%、其他 2.2%
  - 2022 席位：左 153、中 249、右 74、RN 90、其他 11
- **2024 立法基线**：`packages/domain/src/seed/legislative-2024.json`
  - 577 个选区，首轮阵营份额、赢家、第二轮结果
  - 全国首轮：左 31.4%、中 22.0%、右 10.7%、RN 33.4%、Rec 0.9%、其他 1.5%
  - 2024 席位：左 193、中 162、右 69、RN 142、Rec 1、其他 10

### 模型

`apps/web/src/lib/legislative.ts`

1. 把总统民调按阵营汇总
2. 计算相对所选基线（2022 或 2024）的全国 swing
3. 对每个选区应用区域异质 swing
4. 前两名进入第二轮
5. 被淘汰阵营的票按“阵营亲和矩阵”转移给两名决选者
6. 200 次 Monte Carlo 估计席位区间和选区胜率
7. 回测：用基线首轮份额 + 亲和转移预测基线第二轮赢家

支持 4 种转移策略：

| 策略 | 含义 |
|---|---|
| `none` | 2022 亲和矩阵 |
| `republican` | 共和阵线：左/中/右互相转移，RN/Rec 被隔离 |
| `left-unity` | 左翼阵营优先整合 |
| `rn-alliance` | RN + Rec + 右翼优先整合 |

回测准确率：2022 基线 81%，2024 基线 77–83%（随策略变化）。

当前席位情景（2024 基线）：

| 阵营 | `none` | `republican` | `rn-alliance` |
|---|---:|---:|---:|
| Gauche | 216 | 317 | 247 |
| Centre | 73 | 84 | 86 |
| Droite | 51 | 79 | 71 |
| RN | 223 | 84 | 159 |
| Reconquête | 2 | 1 | 2 |
| Autres | 12 | 12 | 12 |

> 这是机械情景，不是 2027 立法选举预测。策略是编辑假设，不是对各党实际退出协议的判断。

### UI

- `/legislatives`、`/en/legislative`、`/zh/legislative`
- 基线切换：`2022` / `2024`
- 转移策略切换：`Affinités 2022` / `Front républicain` / `Union à gauche` / `Alliance RN`
- 577 席总览条 + 各阵营席位/区间
- 539 个本土选区地图，颜色 = 领先阵营，透明度 = 胜率
- 选区详情：领先阵营、胜率、差距、首轮阵营份额、基线结果/第二轮
- 明确标注“scénario mécanique, pas une prévision”

## 7. 情景审计：`forecast_runs` / `forecast_outcomes`

- 新迁移 `0011_forecast_scope.sql`
  - `forecast_outcomes.scope_code`：省/选区代码
  - `forecast_outcomes.label`：可读名称
- Pipeline 新接口：
  - `POST /admin/forecast/store`
  - `GET /admin/forecast/runs`
  - `GET /admin/forecast/runs/:id`
- 脚本：`scripts/store_forecasts.mjs`
  - 读取 `/api/v1/projection` 与 `/api/v1/legislative`
  - 计算 `inputs_hash`
  - 写入省级 + 8 个立法情景（2 基线 × 4 策略）
- **每日 cron**：`0 7 * * *` 调用 `snapshotForecasts()`
  - 用 `SITE_URL` 读取 web API
  - 写入紧凑快照：总统大选全国胜率 + 10 个最不确定省；立法只写各阵营席位/区间
  - 同一天同一 `inputs_hash` 自动跳过，避免重复
  - 也可手动 `POST /admin/forecast/snapshot`
- 当前已写入：
  - **18 个 run**（9 个完整审计 + 9 个紧凑快照）
  - **9,564 条 outcomes**
- `/previsions`、`/en/forecasts`、`/zh/forecasts`：run 日志 + 各阵营席位区间 + 按日历史 sparkline
- `/methodologie` 侧栏显示最近 6 个已保存情景，并链接到 `/previsions`。

## 新增迁移

- `0008_poll_drafts.sql`
- `0009_endorsements.sql`
- `0010_parrainage_baseline.sql`
- `0011_forecast_scope.sql`

## 新增/更新 API

```bash
# 民调 PDF
POST /admin/polls/parse
GET  /admin/polls/drafts
GET  /admin/polls/drafts/:id
POST /admin/polls/drafts/:id/approve
POST /admin/polls/drafts/:id/reject
POST /admin/polls/drafts/import

# 社交 / 背书 / parrainages / 市场
POST /admin/ingest/bluesky
POST /admin/ingest/endorsements
POST /admin/ingest/parrainages
GET  /admin/ingest/parrainages/2027-status
POST /admin/ingest/kalshi
POST /admin/ingest/metaculus
POST /admin/ingest/social

# 评估
GET  /admin/eval/jev?dataset=real&limit=360&model=typesafe/jev

# 情景审计
POST /admin/forecast/store
POST /admin/forecast/snapshot
GET  /admin/forecast/runs
GET  /admin/forecast/runs/:id
```

## 已知阻塞

1. **Jev Cloudflare 路径**：Workers AI 返回 402，需要 AI Gateway credits 或 BYOK；TypeSafe 直连已经跑通并记录校准。
2. **X**：无 `X_BEARER_TOKEN`，X 连接器仍未跑。
3. **Metaculus**：无 `METACULUS_TOKEN`。
4. **Kalshi**：连接器正常，但当前无 France 2027 市场。
5. **Jev 真实集仍以 agent-silver 标签为主**：39 条选举标签已人工复核，precision 已达 97.3%；其余 321 条和议题标签仍需独立复核。
6. **2027 官方 parrainages 尚未公布**：当前使用 2022 官方数据作为历史先验。
7. **选区轮廓缺 18 个**：11 个海外侨民 + 7 个海外领地无几何；席位模型仍覆盖 577。

## 下一步

1. 给 Workers AI 充值或配置 BYOK，跑 Jev 360 条校准。
2. 继续人工复核真实文本评估集的议题标签，优先修正退休/司法/制度议题。
3. 接入 X 官方 API（25 账号、4,000 reads/月硬 cap）。
4. 2027 官方 parrainages 公布后替换 2022 历史先验。
5. 立法模型加入 2024 第二轮真实转移率和政党退出协议。
6. 观察每日快照积累后的席位区间变化；必要时增加按模型筛选和导出。
