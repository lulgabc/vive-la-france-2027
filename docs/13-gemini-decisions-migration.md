# 从 TypeSafe Jev 迁移到 Gemini Decisions API

状态：可行，适配器已实现并默认关闭；未设置 `GEMINI_API_KEY` 前生产行为不变。

## 1. 先澄清服务名称

用户所说的 “Google Decision API” 实际是 **Gemini Decisions API**：

- 模型：`gemini-decision-1`
- 发布：2026-11-11（两天前）
- 入口：`POST https://generativelanguage.googleapis.com/v1beta/decisions`
- 认证：`x-goog-api-key`
- 文档：<https://aistudio.google.com/docs/decisions-api>
- 发布博客：<https://blog.google/innovation-and-ai/technology/developers-tools/gemini-decisions-api>

它和 Jev 属于同一类模型：输入一段共享上下文 + 一组带类型的封闭式问题，返回概率而不是生成文本。

## 2. 官方事实（2026-11-13 核对）

| 项目 | Gemini Decision 1 | 当前 TypeSafe Jev |
|---|---|---|
| 问题类型 | `noul` / `choice` / `score` | 相同 |
| 单次问题数 | 1–1,000 | 未在公开文档给出 |
| 共享输入上限 | 262,144 tokens | 64K |
| 输出 | 概率 + confidence，0 output tokens | 概率 + confidence，0 output tokens |
| 延迟 | 官方 150–250 ms | 厂商 70–500 ms |
| 价格 | $0.10 / 1M input，output 免费 | $0.042 / 1M input，output 免费 |
| 免费额度 | 200 RPM / 50k TPM / 10k RPD | 早期访问，额度未公开 |
| 付费额度（Tier 1） | 1,500 RPM / 1M TPM / 50k RPD | 未公开 |
| 批量 / 缓存 | 均不支持 | Jev 支持情况未在文档中承诺 |
| 部署形态 | 仅 Gemini Developer API `v1beta`；Vertex/Cloud “coming soon” | Hosted API + Cloudflare Workers AI |
| 发布阶段 | 文档未标 GA/preview，端点仍在 `v1beta` | 早期访问 |

### 免费层的代价

Google 定价页写明：Free 层 “Content used to improve our products”，Paid 层不用于改进产品。本站发送的是公开新闻标题/摘要，风险低，但如果要严格声明“不使用用户数据训练”，应使用付费层。

## 3. 与现有 Jev 集成的兼容性

现有代码只依赖 4 个东西：`state`、`questions`、`answers[key].noul/choice/confidence/probabilities`、`usage`。前三个几乎一一对应，差异集中在 4 处：

| 差异 | Jev | Gemini | 适配方式 |
|---|---|---|---|
| 请求字段 | `state`（任意 JSON） | `input`（字符串或 Content 块） | `JSON.stringify(state)` 塞进一个 text block |
| `noul` 判定标准 | `criteria: { true, false }` | `criteria: { true_description, false_description }` | 字段重命名 |
| 用量字段 | `usage.input_tokens` / `output_tokens` | `usage.total_input_tokens` / `total_output_tokens` | 归一化 |
| 返回模型名 | 响应自带 `model` | 响应无模型名 | 服务端固定写 `gemini-decision-1` |

其他行为差异需要注意：

- `noul` 概率被限制在 **0.01–0.99**，阈值必须落在这个区间；现有 `0.4` 不受影响。
- `choice` 的选项键会按 UTF-8 字节序排序，平票取字母序靠前的键；我们只读取 winner，无影响。
- `choice` 的 `criteria` 是必填；`TOPICS` 已提供全部选项描述，满足 2–255 个选项限制。
- 问题键必须匹配 `[A-Za-z0-9_-]+`；`election_related`、`topic` 都合法。
- 安全过滤命中时返回 HTTP 400（`error.code = safety` 等），不是 `answers`。政治新闻可能偶发误杀，需要保留规则回退。
- 不支持 Batch API 和上下文缓存，无法再压价；但当前量级不需要。
- 仅 `v1beta`，无 SLA；这是本次迁移最大的非技术风险。

## 4. 成本测算（用真实用量）

本地 604 条 Jev 判断的平均输入是 **777 tokens/篇**，输出 150 tokens（Gemini 不计输出）。

| 场景 | Gemini 成本 | Jev 成本 |
|---|---|---|
| 1,000 篇 | $0.078–0.10 | $0.033–0.042 |
| 10,000 篇/月 | $0.78–1.00 | $0.33–0.42 |
| 500 篇/天 | ≈ $1.2/月 | ≈ $0.5/月 |

结论：Gemini 单价约为 Jev 的 **2.4 倍**，但绝对金额仍是每月不到 2 美元，不构成决策因素。

## 5. 已实现的迁移代码

| 文件 | 作用 |
|---|---|
| `apps/pipeline/src/judge/gemini.ts` | Decisions API 适配器：问题转换、输入序列化、响应归一化、REST 调用 |
| `apps/pipeline/src/judge/provider.ts` | Provider 选择：`DECISION_PROVIDER` 或 auto（Gemini → TypeSafe → Workers AI） |
| `apps/pipeline/src/judge/jev.ts` | `judgeArticle` 支持显式 provider；无 key 时仍走规则回退 |
| `apps/pipeline/src/judge/eval.ts` | 同一 360 条标注集可用任一 provider 跑评测 |
| `apps/pipeline/src/index.ts` | `POST /admin/judge/:id?provider=gemini`、`GET /admin/eval/jev?provider=gemini` |
| `apps/pipeline/src/types.ts` | `GEMINI_API_KEY`、`GEMINI_DECISION_MODEL`、`DECISION_PROVIDER` |
| `scripts/check_gemini_adapter.mjs` | 离线契约检查；带 key 可跑真实请求 |
| `apps/pipeline/wrangler*.jsonc` | `DECISION_PROVIDER=auto`、`GEMINI_DECISION_MODEL=gemini-decision-1` |

设计要点：

- `GEMINI_API_KEY` 只作为 secret，不写入 `wrangler.jsonc`。
- 未设置 key 时 `auto` 继续使用 TypeSafe，生产行为零变化。
- 回滚只需 `wrangler secret delete GEMINI_API_KEY` 或把 `DECISION_PROVIDER` 改为 `typesafe`。
- 旧判断保留在 `judgments` 表；回填会以新 `created_at` 成为“最新判断”，Web 端按时间取最新一条，不会被旧数据覆盖。

## 6. 迁移步骤

### 第 0 步：拿 key，先不动生产

1. 在 <https://aistudio.google.com/api-keys> 创建 key。
2. 本地验证：

```bash
GEMINI_API_KEY=... node --experimental-strip-types scripts/check_gemini_adapter.mjs --live
```

3. 设置 secret（此时 `auto` 会优先 Gemini；若不想立即切换，先设置 `DECISION_PROVIDER=typesafe`）：

```bash
printf '%s' "$GEMINI_API_KEY" | npx wrangler secret put GEMINI_API_KEY --config apps/pipeline/wrangler.jsonc
npx wrangler deploy --config apps/pipeline/wrangler.jsonc
```

### 第 1 步：同集对比评测

```bash
TOKEN=$(cat /tmp/vlf-prod-admin-token)
# 基线（Jev）
curl -s "https://vlf-pipeline.ainet-netbook.workers.dev/admin/eval/jev?provider=typesafe&limit=360" \
  -H "x-admin-token: $TOKEN" > /tmp/eval-typesafe.json
# 候选（Gemini）
curl -s "https://vlf-pipeline.ainet-netbook.workers.dev/admin/eval/jev?provider=gemini&limit=360" \
  -H "x-admin-token: $TOKEN" > /tmp/eval-gemini.json
```

建议的验收线（相对当前 Jev 的 98.3/94.3/98.8 与 Brier 0.023 / ECE 0.050）：

| 指标 | 通过线 |
|---|---|
| election accuracy | ≥ 0.97 |
| election recall | ≥ 0.97 |
| election precision | ≥ 0.92 |
| topic accuracy | ≥ 0.68（不出现系统性迁移） |
| Brier | ≤ 0.05 |
| ECE | ≤ 0.08 |
| 法语/中文样例 | 人工抽查 20 条无语言性退化 |

任一不达标就保留 Jev，不切换。

### 第 2 步：灰度

```bash
# 单篇对比，不写入判断
curl -X POST ".../admin/judge/<articleId>?provider=gemini" -H "x-admin-token: $TOKEN"
```

建议先对 20–30 篇近期文章做人工对比，重点看：候选人表态、预算/外交类“是否属于竞选议题”、主题归类。

### 第 3 步：切换

```bash
npx wrangler secret put GEMINI_API_KEY --config apps/pipeline/wrangler.jsonc
# 确认 DECISION_PROVIDER 未固定为 typesafe，保持 auto 或显式设为 gemini
npx wrangler deploy --config apps/pipeline/wrangler.jsonc
```

新文章会以 `model = gemini-decision-1` 写入；`/fil` 无需改动。

### 第 4 步：回填（可选）

```bash
curl -X POST ".../admin/backfill-judgments?limit=1000&force=1" -H "x-admin-token: $TOKEN"
```

回填会产生 Gemini 版本判断，更新时间更晚，Web 端自然切换到新判断；旧 Jev 行保留可追溯。

### 第 5 步：回滚

```bash
npx wrangler secret delete GEMINI_API_KEY --config apps/pipeline/wrangler.jsonc
npx wrangler deploy --config apps/pipeline/wrangler.jsonc
```

或把 `DECISION_PROVIDER` 改成 `typesafe` 后重新部署。

## 7. 方案检查结果

已完成的验证：

| 检查 | 结果 |
|---|---|
| 端点是否真实存在 | `POST /v1beta/decisions` 无 key 返回结构化 `403 PERMISSION_DENIED`，说明路由存在且鉴权方式正确 |
| 请求/响应契约 | `scripts/check_gemini_adapter.mjs` 通过：`state` 序列化、`noul` criteria 重命名、choice 原样传递、usage 归一化 |
| TypeScript | `pnpm -r check` 全绿（pipeline + web） |
| 默认行为 | 无 `GEMINI_API_KEY` 时仍走 TypeSafe；生产未改动 |
| 成本 | 按真实 777 tokens/篇计算，10k 篇/月 ≈ $1 |
| 回滚路径 | secret 删除或 provider 改回，均无需改代码 |

尚未验证（需要 key）：

- 真实 API 返回在法语政治新闻上的准确率与校准；
- 安全过滤对政治内容的误杀率；
- 360 条评测集的完整对比数字；
- 免费层 10k RPD 是否足够覆盖突发 RSS 回填。

因此结论是：**技术上完全可以迁移，改动量小、成本可忽略、回滚简单；但是否值得切换取决于 360 条对比评测，尤其是 topic accuracy 和安全过滤误杀。** 在跑完第 1 步之前不应切换生产 provider。
