# P2 实现状态（2026-11-10）

> 本文件记录 P2 阶段。P3 已继续完成 Bluesky、背书、五因子、PDF 复核、市场历史、情景回测和 577 选区；最新状态见 [10-p3-status.md](10-p3-status.md)。

## 本轮完成

| 模块 | 状态 |
|---|---|
| 候选人头像 | 22 张 Wikimedia Commons 真人照片；本地 512×512 JPEG；失败时回退字母 SVG |
| 头像落库 | `candidates.avatar`、`avatar_credit`、`avatar_source`；迁移 `0003` / `0005` |
| 真实民调采集 | Sondax / Wikipédia CSV（CC BY-SA 4.0）；48 个民调、535 行 |
| 民调聚合 | 60 天窗口、样本量加权、21 天半衰期；19 个民调、16 位候选人 |
| 首页真实民调 | 排名与详情显示真实 `poll_avg`、`n`、最后调查日期 |
| 民调页 | `/sondages` 从 D1 读取 48 条真实民调，链接官方 notice |
| 临时评分 v1 | `poll + market + media + social` 四因子；缺失分量显示 `—`，不伪造 0 |
| 候选人页/列表 | 头像 + 真实民调均值 |
| 管理接口 | 采集民调、重算均值、重算评分 |
| Jev smoke eval | 12 条法语样本；规则 baseline 相关性 91.7%、议题 50%；Jev 需 AI binding |
| 真实趋势 | 60 天历史回填（930 行，poll+market）；趋势线已显示 |
| 2027 省级情景 | 2022 基线 + 全国统一 swing；可切换 2022/2027；明确标注“机械情景，不是预测” |

## 数据

| 指标 | 数值 |
|---|---:|
| 候选人 | 22 |
| 真人照片 | 22 |
| 民调（Sondax） | 48 |
| 民调结果行 | 535 |
| 聚合候选人 | 16 |
| 60 天内民调 | 19 |
| 首页排名 | 16 个有真实评分的候选人 |
| 文章 | 302 |
| 媒体热度候选人 | 15 |
| 市场 | 26（Polymarket，经 Sondax JSON） |
| 社交帖子 | 82（Mastodon，公开标签时间线） |

## 评分 v1

当前是**临时评分**，不是完整五因子模型：

```text
available = 45 (poll) + 20 (market) + 15 (media) + 10 (social)
score = (45 * poll_norm + 20 * market_norm + 15 * media_norm + 10 * social_norm) / available
```

- `poll_norm`：民调均值 / 最高民调均值 × 100
- `market_norm`：Polymarket 去水胜率 × 100
- `media_norm`：7 天提及量 / 最高提及量 × 100
- 市场、社交已接入；政治信号暂无数据 → 显示 `—`，权重不计入
- 候选人没有民调 → 不进入真实排名（避免媒体噪声单独决定名次）
- 结果写入 `scores`，`components_json` 标记 `demo:false`、`mode:'poll+market+media+social'`

> 这是“相对强度指数”，不是胜率，也不是完整模型。完整模型仍需要社交、背书和贝叶斯模拟。

## 新增 API

```bash
GET  /api/v1/polls
GET  /api/v1/polls/averages
GET  /api/v1/scores
GET  /api/v1/scores/history

POST /admin/ingest/polls        # Sondax CSV → polls/poll_results → 聚合 → 评分
POST /admin/recompute-polls     # 重新聚合民调
POST /admin/recompute-scores    # 重新计算临时评分
GET  /admin/eval/jev            # Jev / 规则 smoke eval
```

## 新增迁移

- `0003_candidate_avatar.sql`：`candidates.avatar`
- `0004_poll_averages.sql`：`poll_averages`
- `0005_avatar_credit.sql`：`avatar_credit` / `avatar_source`
- `0006_score_history_unique.sql`：`score_history(entity_id, as_of)` 唯一索引
- `0007_market_candidate.sql`：`markets.candidate_id`

## 头像说明

头像现在是**真人照片**，来源为 Wikimedia Commons / Wikipedia：

- 文件：`apps/web/public/avatars/{candidate-id}.jpg`（512×512，居中偏上裁剪）
- 抓取脚本：`scripts/fetch_avatars.py`
- 元数据：`avatar_credit`（作者 + 许可）、`avatar_source`（Commons 文件页）
- 展示：候选人页和 Dashboard 详情底部显示“Photo : … · Wikimedia Commons”
- 失败回退：`scripts/build_avatars.py` 生成的字母 SVG
- 注意：部分欧洲议会照片许可是 “European Parliament” 法律声明，不是 CC；已保留来源链接和署名。

## 真实趋势

- `computeScores` 每次运行写一条 `score_history`
- `backfillScoreHistory` 用历史民调 + Polymarket 历史重建过去 60 天，共 930 行
- 唯一索引 `(entity_id, as_of)` 防止重复
- Dashboard 趋势线只取 `mode='poll+market-historical'` 的点，避免和当天四因子评分口径混用
- 趋势标签明确写“Tendance (sondages + marchés)”

## 已知问题

1. **Jev 只跑了 12 条 smoke eval**：本地无 AI binding，Jev 未实际运行；规则 baseline 相关性 91.7%、议题 50%。需扩到 300–500 条并接 AI binding。
2. **民调 PDF 解析未接**：目前直接使用 Sondax 的结构化 CSV；Commission notice 链接已保留。
3. **市场**：Polymarket 通过 Sondax JSON 已接入 26 个市场；Kalshi 暂无 France 2027；Metaculus 需 token。
4. **社交/政治信号**：Mastodon 已接入 82 条；Bluesky 被 403、X 无 token；政治信号（背书/parrainages）仍缺失。
5. **历史趋势口径不同**：趋势是 poll+market 重建，不含 media/social；当天评分是四因子，标签已区分。
6. **577 选区未入库**。
7. **评分权重默认仍是 45/20/15/10/10**：当只有 poll+media 时，滑块重算会按可用分量归一化，和临时评分不完全一致。

## 下一步

1. Jev 法语标注集（300–500 条）+ 评估；通过后替换规则分类器。
2. 民调 PDF 解析 + 人工复核队列；用 Commission notice 校验 Sondax 行。
3. 市场时间序列/多平台对比；Kalshi、Metaculus 补齐。
4. 社交关注度 + 背书/parrainages → 五因子评分。
5. 用历史趋势做模型回测，并统一历史/当天评分口径。
6. 577 选区 + 立法席位模型。
7. 省级情景加入地区异质性、不确定性和回测。
