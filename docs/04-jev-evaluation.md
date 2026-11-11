# TypeSafe Jev 评估：能不能用、怎么用

- 日期：2026-11-10
- 结论：**能用，而且很适合；但它是“判断/特征提取器”，不是选举预测模型。**
- 2026-11-10 更新：主评估集已换成 **360 条真实法语文本**（302 篇文章 + 58 条 Bluesky，rubric 标签，明确标注 agent-silver）；真实集规则相关性 96.4%、precision 97.3%、recall 86.9%、议题 67.2%；39 条选举标签经人工复核。360 条合成集保留为回归集。Workers AI 运行仍待 Cloudflare 登录。详见 [10-p3-status.md](10-p3-status.md)。

---

## 1. Jev 是什么

Jev 是 TypeSafe 的 **System One 决策模型**，不是聊天 LLM：

```text
输入：state（文本/JSON/图片）+ 一组 typed questions
输出：每个问题的 typed answer + 概率 + confidence
不生成文本，不解析自由格式
```

三种题型：

| 类型 | 用途 | 输出 |
|---|---|---|
| `noul` | 是/否判断 | `noul` 概率 0–1 |
| `choice` | 从固定选项里选一个 | `choice` + 各选项概率 |
| `score` | 有序 rubric 打分 | `score` + 各档概率 |

关键能力：

- 多个问题在**一次请求**里并行评估，互不干扰（不会 context-rot）。
- 概率被训练为“校准过的”，可以用阈值决定“自动处理 / 转人工 / 丢弃”。
- 通过 **Cloudflare Workers AI** 可直接调用：模型 ID `typesafe/jev`，无需单独 API key。
- 价格（2026-11）：**$0.042 / 1M input tokens，output 免费**；32k context；Zero Data Retention。
- 限制：不擅长算术、计数、日期比较；不能生成文本；单题最多 255 个选项、rubric 最多 10 档。

---

## 2. 它和这个项目的关系

我们的数据链路需要大量**小而固定的判断**：

```text
RSS/社交/PDF
   │
   ├─ 这条内容跟 2027 大选有关吗？          → noul
   ├─ 主要议题是什么？                      → choice（12 个议题）
   ├─ 对某候选人/政党是什么立场？            → choice（support/oppose/neutral/unclear）
   ├─ 摘要里的这句话有原文支持吗？            → noul
   ├─ 这个市场问题对应哪个候选人/结果？        → choice
   └─ 这份 PDF 像民调表吗？                  → noul/choice
```

这些正是 Jev 的主场：**高频、固定标签、需要概率与置信度、不需要生成文本**。

反过来，以下事情**不要**交给 Jev：

| 任务 | 为什么不用 Jev | 用什么 |
|---|---|---|
| 从 PDF 抽数字/表格 | 不做精确抽取，计数/算术弱 | `pdfplumber` + 规则 + 人工复核 |
| 发现新实体/人名 | 只能从给定选项里选 | 词典 + 别名表 + NER |
| 文章去重/相似度 | 不是相似度模型 | SimHash + embeddings |
| 预测得票率/胜率 | 不是时间序列/贝叶斯模型 | PyMC + 蒙特卡洛 |
| 写摘要/翻译 | 不生成文本 | Workers AI / Grok |
| 日期比较/算术 | 明确不擅长 | 代码 |

> 一句话：**Jev 判断文本，PyMC 预测选举。** 两者是上下游，不是替代关系。

---

## 3. 推荐落地的 5 个场景

### 3.1 相关性过滤（P1，低风险）

- 题型：`noul`
- 问题：`Is this item about the 2027 French presidential election, a declared/likely candidate, or a relevant party?`
- 用法：
  - `p > 0.8` → 自动入库
  - `p < 0.2` → 自动丢弃
  - 中间 → Workers AI 3B 复核或人工
- 收益：把 RSS/GDELT 的噪声挡在评分之外，省 D1 和 AI 成本。

### 3.2 议题分类（P1，低风险）

- 题型：`choice`
- 选项（v1，12 个）：经济/购买力、移民/安全、退休/社保、医疗、教育、气候/能源、欧洲/外交、制度/民主、司法、文化/身份、地方/海外、其他。
- 用法：`confidence > 0.8` 自动；否则 LLM/人工。
- 产出：`article_topics`、`topic_salience`。

### 3.3 立场判断（P2，中风险）

- 前置：先用词典/别名表匹配出文章中出现的候选人/政党，**只对匹配到的实体**提问。
- 题型：每个实体一个 `choice`：`support / oppose / neutral / unclear`。
- 注意：
  - 一次请求可带多个实体的问题，Jev 并行评估。
  - 问题要原子化：不要问“这篇文章对 A 是支持还是反对？”，而是“Does the article express support for A?” 和 “Does the article express opposition to A?” 两个 `noul`，再在代码里合成。
  - 讽刺、否定、引述要特别小心；Jev 按字面读。
- 用法：
  - `confidence > 0.85` 自动
  - `0.6–0.85` LLM/人工
  - `< 0.6` 归入 `unclear`
- 公开页面只展示**聚合分布 + 样本量 + 示例引文**，不把单条标签当事实。

### 3.4 摘要/翻译的 groundedness 检查（P2，低风险）

- 题型：`noul`
- 问题：`Is claim C supported by the provided article text?`
- 用法：Workers AI 生成摘要后，逐条 claim 让 Jev 判断；`p < 0.9` 不自动发布，转人工。
- 收益：防止 AI 摘要幻觉，尤其是民调和候选人数字。

### 3.5 市场问题/民调文档分流（P2，低风险）

- 市场：`choice` 把 Polymarket/Kalshi 的问题映射到 `candidate_id / party_id / outcome_type`；`confidence > 0.9` 自动，否则 admin。
- 民调 PDF：`noul` 判断“这是否是民调表”；`choice` 判断机构/轮次；数字仍由 pdfplumber 抽取并人工复核。
- 收益：减少人工分拣，但不替代数字复核。

---

## 4. 架构与代码

### 4.1 位置

```text
pipeline Worker
  normalize → dedupe → entity match → Jev judge → aggregate → D1/AE
                                      │
                                      ├─ confidence 高 → 自动
                                      ├─ 中 → Workers AI / 人工队列
                                      └─ 低 → unclear / 丢弃
```

### 4.2 Provider 接口（避免锁定）

```ts
// packages/judge/src/types.ts
export type JudgeAnswer =
  | { type: 'noul'; noul: number; confidence?: number }
  | { type: 'choice'; choice: string; probabilities: Record<string, number>; confidence: number }
  | { type: 'score'; score: number; probabilities: Record<string, number>; confidence: number };

export interface JudgeProvider {
  judge(state: unknown, questions: Record<string, unknown>): Promise<{
    model: string;
    answers: Record<string, JudgeAnswer>;
    usage?: { input_tokens: number; output_tokens: number };
  }>;
}
```

实现：

- `JevProvider` → `env.AI.run('typesafe/jev', { state, questions })`
- `WorkersAIProvider` → Llama 3.2 3B + JSON schema（fallback）
- `RuleProvider` → 关键词/正则（最后兜底）

### 4.3 调用示例

```ts
const TOPICS = [
  'economy_purchasing_power', 'immigration_security', 'pensions_social',
  'health', 'education', 'climate_energy', 'europe_foreign',
  'institutions_democracy', 'justice', 'culture_identity',
  'local_overseas', 'other',
] as const;

const STANCES = ['support', 'oppose', 'neutral', 'unclear'] as const;

const res = await env.AI.run('typesafe/jev', {
  state: {
    title: article.title,
    source: article.source,
    published_at: article.published_at,
    text: article.excerpt,          // 不要塞全文；标题 + 前 1–2k tokens
    matched_entities: ['Marine Le Pen', 'Rassemblement national'],
  },
  questions: {
    election_related: {
      type: 'noul',
      instructions: 'Is this item about the 2027 French presidential election, a declared or likely candidate, or a relevant party?',
    },
    topic: {
      type: 'choice',
      instructions: 'What is the single dominant policy topic of this item?',
      options: TOPICS,
    },
    stance_lepen: {
      type: 'choice',
      instructions: 'Does this item express support for, opposition to, or a neutral stance toward Marine Le Pen? Treat quoted criticism as opposition only if the article endorses it.',
      options: STANCES,
    },
  },
});
```

> 实际字段名以 TypeSafe/Cloudflare 当前文档为准；上线前用一条真实数据跑通。

### 4.4 存储

```sql
judgments(
  id, subject_type, subject_id, content_hash,
  model, question, answer_type, value,
  probability, confidence, usage_json, created_at
);
```

- `subject_type`: `article` / `social_post` / `market` / `poll_pdf`
- `content_hash`: 避免同一内容重复判断
- `model`: 记录实际模型版本（`typesafe/jev` 或 `jev-1.13`）
- 索引：`(subject_type, subject_id)`、`(question, created_at)`

### 4.5 阈值策略

| 场景 | 自动接受 | 复核 | 丢弃/abstain |
|---|---|---|---|
| 相关性 | p > 0.8 | 0.2–0.8 | p < 0.2 |
| 议题 | conf > 0.8 | 0.6–0.8 | < 0.6 → other |
| 立场 | conf > 0.85 | 0.6–0.85 | < 0.6 → unclear |
| groundedness | p > 0.9 | 0.7–0.9 | < 0.7 → 不发布 |
| 市场映射 | conf > 0.9 | 0.7–0.9 | < 0.7 → admin |

阈值必须在**法语标注集**上校准，不能照搬英文 benchmark。

---

## 5. 成本

Jev 只收 input token，output 免费；多个问题共享同一份 state。

| 文章量/天 | 假设 tokens/篇 | tokens/月 | 月成本 |
|---:|---:|---:|---:|
| 1,000 | 1,200 | 36M | **$1.51** |
| 3,000 | 1,200 | 108M | **$4.54** |
| 5,000 | 1,200 | 180M | **$7.56** |
| 10,000 | 1,200 | 360M | **$15.12** |

- 建议先按 **3,000 篇/天 + $5/月 cap** 设计；超过就降级到规则/3B。
- 社交帖子更短（200–400 tokens），成本更低。
- 相比 Workers AI 3B 分类，Jev 的价格同量级，但输出是 typed + calibrated，省了解析和校验。

---

## 6. 准确率与校准：必须先验证

Jev 的公开 benchmark 主要在英文任务（IMDB、SST-2、HellaSwag、ARC 等），**没有法语政治立场 benchmark**。第三方评测的结论是：分类准确率与前沿 LLM 相当，不是碾压；真正的差异是**校准和结构化输出**。

上线前做一次离线评估：

1. 标注 **300–500 条法语样本**：新闻、社媒、电视转录，覆盖各党派、各媒体类型。
2. 标注内容：相关性、主议题、对 2–3 个实体的立场、摘要 groundedness。
3. 指标：
   - Accuracy / macro-F1
   - ECE（期望校准误差）
   - 在 `confidence >= 0.8` 时的 coverage 和 precision
   - 各党派/各来源的分组误差（防止系统性偏差）
   - 成本/1k 条
4. 对比基线：关键词规则、Workers AI 3B/8B、Jev。
5. 在验证集上选阈值，在留出集上测；上线后每月抽检漂移。

**通过标准（建议）**：

- 相关性：macro-F1 ≥ 0.90，auto coverage ≥ 70%
- 议题：macro-F1 ≥ 0.75
- 立场：macro-F1 ≥ 0.65，且各党派差距 < 10 个百分点
- groundedness：precision ≥ 0.90
- 不达标 → 只用于内部排序，不进入公开评分。

---

## 7. 风险与对策

| 风险 | 对策 |
|---|---|
| Jev 很新（2026-09 发布），早期访问 | Provider 接口隔离；pin 版本；保留 Workers AI fallback |
| 法语政治语料表现未知 | 先做 300–500 条标注评估；不达标不自动发布 |
| 校准漂移 | 每月抽检；记录 model 版本；阈值随评估更新 |
| 讽刺/否定/引述误判 | 原子化问题；要求 evidence span；低置信度转人工 |
| 党派偏差 | 分党派评估；公开方法论；发现偏差就降级为人工 |
| 无解释 | 公开页面配示例引文；内部用 evidence span；不展示裸标签 |
| 长文超 32k | 只送标题 + 导语 + 匹配段落；长文分段判断后聚合 |
| 成本失控 | $5–10/月 cap；按 content_hash 缓存；低价值内容先用规则 |
| 供应商锁定 | 同一接口可切 Workers AI/其他 decision model |

---

## 8. 结论

**建议用，但分阶段：**

| 阶段 | 用法 | 是否自动发布 |
|---|---|---|
| P1 | 相关性过滤、议题分类 | 是（阈值 + 抽检） |
| P1 | 摘要 groundedness 检查 | 是（不通过则不发布） |
| P2 | 立场判断 | 先人工复核，验证后逐步自动 |
| P2 | 市场问题映射、民调 PDF 分流 | 是（低风险） |
| 不做 | 预测得票率/胜率 | 用 PyMC |
| 不做 | PDF 数字抽取、实体发现、去重、写摘要 | 用专用工具 |

**预期成本**：$2–8/月（1k–5k 篇/天），在 $50 预算内。

**下一步**：P0 先搭 `packages/judge` 接口和 `judgments` 表；P1 用 300 条法语样本做离线评估；通过后再接入自动链路。
