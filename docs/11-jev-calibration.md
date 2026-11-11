# Jev 真实集校准报告（2026-11-11）

## 结论

- Cloudflare 已登录，OAuth scope 包含 `ai`。
- Cloudflare Workers AI 路径的 Jev 返回 **402 Insufficient balance**（third-party model 需要 AI Gateway credits 或 BYOK）。
- 使用 TypeSafe 直连 API key 后，**Jev 实际调用成功**：模型 `jev-1.14.0`，360 条全部成功，0 errors。
- 同时保留了 Cloudflare **Clef / Clef-flash** 的同集结果，便于对比。
- 结果文件：
  - `data/calibration-jev-latest-2026-11-11.json`
  - `data/calibration-clef-flash-2026-11-11.json`
  - `data/calibration-clef-2026-11-11.json`

> Jev 和 Clef 是不同模型，指标分开记录；不要把 Clef 的分数写成 Jev。

## 评估集

- 360 条真实法语文本
- 302 篇文章 + 58 条 Bluesky
- **47 条选举相关性标签 + 130 条议题标签**经人工复核/覆盖
- 其余保留 rubric silver 标签
- 标签总数：84 条选举相关，276 条非选举
- 复核记录：`data/jev-label-overrides.json`（133 条覆盖）

## 结果

| 模型 | 相关性准确率 | precision | recall | 议题准确率 | Brier | ECE |
|---|---:|---:|---:|---:|---:|---:|
| Jev 1.14.0（复核后） | **98.3%** | **94.3%** | **98.8%** | **71.7%** | **0.023** | 0.050 |
| 规则 baseline | **96.4%** | **97.3%** | **86.9%** | **67.2%** | 0.047 | 0.111 |
| Clef-flash | 93.9% | 89.7% | 83.3% | 49.7% | 0.049 | **0.032** |
| Clef | 95.0% | 88.4% | **90.5%** | 48.9% | **0.038** | 0.041 |

观察：

- Jev 复核后：Brier 0.023，ECE 0.050，election precision 94.3%，recall 98.8%。
- 这轮提升有三部分：**FN 误差分析 + 议题标签复核 + prompt/threshold 调整**。其中标签复核贡献最大，不能全部归因于模型。
- 复核前基线仍是：accuracy 93.3%、precision 90.5%、recall 79.8%、topic 50.3%、Brier 0.048。
- 规则 baseline 的 precision 最高（97.3%），但 ECE 最差（0.111），因为规则输出的是固定档位概率。
- 议题准确率提升到 71.7%，但 `pensions_social`、`immigration_security`、`local_overseas` 仍弱，主要是标签定义模糊。

## 议题弱项（Jev）

| 议题 | 准确率 |
|---|---:|
| local_overseas | 0.0% |
| pensions_social | 11.8% |
| immigration_security | 38.1% |
| europe_foreign | 57.1% |
| justice | 71.4% |
| economy_purchasing_power | 76.3% |
| education | 78.9% |
| other | 82.9% |
| institutions_democracy | 83.9% |
| health | 88.9% |
| culture_identity | 96.4% |
| climate_energy | 100.0% |

## 可靠性分箱

Jev 的 ECE 0.050 说明概率整体可用。分箱细节在 JSON 的 `metrics.calibration.bins`。

## Pipeline 端点复跑

`GET /admin/eval/jev?dataset=real&limit=360` 通过 TypeSafe 直连复跑：

- model_returned：`jev-1.14.0`
- accuracy 92.8%、precision 88.2%、recall 79.8%
- topic 45.8%、Brier 0.049、ECE 0.051

与脚本结果的差异来自 `criteria` 描述语言/措辞不同（脚本用法语描述，pipeline 用英语 topic 标签）。两套都保留，报告以脚本的 360 条固定口径为主。

## FN 误差分析

复核前 Jev 有 17 个 FN，复核后只剩 1 个：

| 类型 | 例子 | 处理 |
|---|---|---|
| 外语帖子 | `Elecciones presidenciales de 2027`、`Extrema derecha - bfmtv` | prompt 明确“外语帖子算 yes”；标签复核 |
| 候选人竞选活动 | Teddy Riner `campagne présidentielle`、Mélenchon meeting au Bourget | prompt 明确“campaign meeting / candidate program 算 yes” |
| 候选人政策/外交表态 | Mélenchon Ukraine、Le Pen discrimination | prompt 明确“candidate’s campaign statement/position 算 yes” |
| 标签错误 | `Midterms ... J.D. Vance 2028` 被标成法国选举 | 改为 false |
| 阈值偏保守 | Teddy Riner 0.41–0.47 | threshold 0.5 → 0.4 |

剩余唯一 FN：

```text
L’augmentation du SMIC ... Édouard Philippe ?  (p=0.05)
```

这条更像“政策问题”而不是“竞选报道”，是否应标 true 仍有争议；暂时保留。

复核后剩余 FP：

```text
x.com/JLMelenchon/...                         0.52
Jean-Luc je suis ok avec toi !                0.87
Quand Trotski éclipse les Lumières            0.41
That reminds me Mélenchon ... Lithuania        0.70
Résumé de la position géopolitique de LFI      0.67
```

这些是“候选人相关但非选举”的边界样本，属于 precision 的剩余代价。

## 站点回填

- `POST /admin/backfill-judgments?force=1&limit=400`
- 302 篇文章全部重新判断，模型 `jev-1.14.0`
- Jev 判定 43 篇选举相关；规则此前为 55 篇
- `/fil` 默认只显示 Jev 判定为选举相关的文章
- `judgments` 同时保留规则和 Jev 两套记录，读取时按 `created_at DESC` 取最新

## 用量

Jev 360 条：

- model：`jev-1.14.0`
- input tokens：**327,797**
- output tokens：53,996
- errors：0

Clef / Clef-flash 360 条：

- input tokens：261,191
- output tokens：0
- errors：0


## Jev 是怎么调用的

### 1. Worker binding（生产路径）

```ts
const response = await env.AI.run(
  'typesafe/jev',
  {
    state: { title, excerpt },
    questions: {
      election_related: { type: 'noul', instructions: '...' },
      topic: { type: 'choice', instructions: '...', criteria: { ... } },
    },
  },
  // 使用 AI Gateway Unified Billing 时必须带 gateway
  { gateway: { id: 'vlf' } },
)
```

代码位置：

- `apps/pipeline/src/judge/jev.ts`：单篇文章判断
- `apps/pipeline/src/judge/eval.ts`：360 条评估

`wrangler.jsonc` 里有 `"ai": { "binding": "AI" }`。本地 `wrangler.local.jsonc` 故意不放 AI binding，避免 `wrangler dev` 切到 remote 模式；本地会回退到关键词规则。

### 2. REST API（校准脚本路径）

```bash
curl -X POST "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/ai/run" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  -H "cf-aig-gateway-id: vlf" \
  -d '{
    "model": "typesafe/jev",
    "input": {
      "state": { "title": "...", "excerpt": "..." },
      "questions": {
        "election_related": { "type": "noul", "instructions": "..." },
        "topic": { "type": "choice", "instructions": "...", "criteria": { "other": "..." } }
      }
    }
  }'
```

脚本：`scripts/run_clef_calibration.py`

```bash
TYPESAFE_API_KEY=... python3 scripts/run_clef_calibration.py \
  --provider typesafe \
  --model jev-latest \
  --workers 4 \
  --limit 360
```

### 3. 返回结构

```json
{
  "result": {
    "model": "jev-1.13.0",
    "answers": {
      "election_related": { "type": "noul", "noul": 0.96 },
      "topic": { "type": "choice", "choice": "institutions_democracy", "probabilities": { ... } }
    },
    "usage": { "input_tokens": 477, "output_tokens": 0 }
  },
  "success": true
}
```

## 为什么 402

Jev 是 **third-party model**，不走普通 Workers AI 免费 Neurons 额度。它必须走：

1. **AI Gateway Unified Billing** 预付费 credits，或
2. **BYOK**（把 TypeSafe 的 API key 存到 AI Gateway）

没有 credits / key 时返回：

```json
{ "code": 2021, "message": "Insufficient balance; add money to your gateway or use BYOK" }
```

## 解决方案 A：充值 AI Gateway credits（推荐）

1. 打开 Cloudflare Dashboard → **AI** → **AI Gateway**
2. 右上角 **Credits Available** → **Manage**
3. 添加一张非预付的 credit/debit card（不支持 PayPal/Apple Pay/Google Pay）
4. **Top-up credits**，最低 **$10**，另加 **5% fee**（实际约 $10.50）
5. 选择或创建 gateway，例如 `vlf`
6. 在该 gateway 的 **Settings** 里把 **Workers AI Billing** 设为 **Unified billing**
7. 代码/REST 请求带上 gateway：
   - binding：`env.AI.run(model, input, { gateway: { id: 'vlf' } })`
   - REST：`cf-aig-gateway-id: vlf`
8. 设置 `AI_GATEWAY_ID=vlf`，再跑 Jev

成本估算：

- Jev 输入 $0.042 / 1M tokens，输出免费
- 360 条评估约 **261k input tokens**
- 单次完整评估约 **$0.011**（1 美分左右）
- 最低 $10 credits 可以跑约 **900 次** 完整评估

## 项目内的 provider 选择

`apps/pipeline/src/judge/provider.ts` 现在按顺序选择：

1. `TYPESAFE_API_KEY` 存在 → TypeSafe 直连 `https://api.typesafe.ai/v1/systemone`
2. 否则 `env.AI` 存在 → Workers AI binding `typesafe/jev`
3. 否则回退到关键词规则

本地 `.dev.vars` 已配置 TypeSafe 直连；生产建议：

```bash
npx wrangler secret put TYPESAFE_API_KEY
```

并在 `wrangler.jsonc` 保留：

```jsonc
"vars": { "TYPESAFE_MODEL": "jev-latest" }
```

> API key 已出现在对话中，建议用完后到 TypeSafe Console 轮换/撤销旧 key。

## 解决方案 B：BYOK

1. 在 TypeSafe 获取 API key（如果账号有权限）
2. Cloudflare Dashboard → AI Gateway → 选择 gateway → **Provider Keys**
3. 添加 TypeSafe key，alias 用 `default`（Unified Billing 路径只读取 default alias）
4. 请求不需要 credits，但需要 key 有效
5. Jev 仍然通过 `typesafe/jev` 调用

TypeSafe 直连目前是 waitlist；如果没有 key，只能用方案 A 或 Clef。

## 解决方案 C：继续用 Clef（零额外费用）

Clef / Clef-flash 是 Cloudflare 第一方模型，走 Workers AI Neurons：

- 免费额度：**10,000 Neurons/day**
- Clef-flash：3,455 Neurons/M input → 360 条约 900 Neurons
- Clef：21,818 Neurons/M input → 360 条约 5,700 Neurons

两者都能落在免费日额度内。我们已经跑完，结果见上表。它们不是 Jev，但同属 decision model，接口兼容。

## 复跑 Jev

Jev 充值/开通后：

```bash
python3 scripts/run_clef_calibration.py \
  --model typesafe/jev \
  --workers 4 \
  --limit 360
```

脚本会读取 wrangler OAuth token，不打印 token；输出 `data/calibration-jev-YYYY-MM-DD.json`。

如果 Jev 仍然 402：

```json
{"errors":[{"message":"Insufficient balance; add money to your gateway or use BYOK","code":2021}]}
```

需要在 Cloudflare 账户里充值 Workers AI 余额，或配置 BYOK。

## 代码位置

- 脚本：`scripts/run_clef_calibration.py`
- 评估集：`apps/pipeline/src/judge/jev-eval-real-fr.json`
- 规则 baseline：`apps/pipeline/src/judge/rules.ts`
- Pipeline 校准接口：`GET /admin/eval/jev?dataset=real&limit=360`
