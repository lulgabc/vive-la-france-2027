# X 核心账号清单（25 个）

- 用途：官方 X API pay-per-use，按账号拉 timeline，去重后入库
- 预算：25 个账号 × 约 4 posts/天 ≈ 100 posts/天 ≈ 3,000 posts/月 ≈ **$15/月**
- 频率：每 60 分钟一次；同一 post 同一 UTC 日重复读取只计一次
- 维护：每月复核一次；候选人退选/新候选人宣布时更新

> Handle 请在 X 后台或 `GET /2/users/by/username/:username` 再核实一遍再写入配置。政治账号会改名。

## 1. 政党/阵营（8）

| # | 账号 | Handle | 说明 |
|---:|---|---|---|
| 1 | Rassemblement national | `@RNational_off` | RN 官方 |
| 2 | Renaissance | `@Renaissance` | 执政阵营/Attal 所在党 |
| 3 | La France insoumise | `@FranceInsoumise` | LFI 官方 |
| 4 | Parti socialiste | `@partisocialiste` | PS 官方 |
| 5 | Les Républicains | `@lesRepublicains` | LR 官方 |
| 6 | Europe Écologie Les Verts | `@EELV` | EELV 官方 |
| 7 | Parti communiste français | `@PCF` | PCF 官方 |
| 8 | Horizons | `@HorizonsLeParti` | Philippe 的党 |

## 2. 候选人/核心政治人物（10）

| # | 账号 | Handle | 说明 |
|---:|---|---|---|
| 9 | Marine Le Pen | `@MLP_officiel` | RN；资格问题需持续跟踪 |
| 10 | Jordan Bardella | `@J_Bardella` | RN；若 Le Pen 不可选，他是最可能人选 |
| 11 | Jean-Luc Mélenchon | `@JLMelenchon` | LFI 候选人 |
| 12 | Gabriel Attal | `@GabrielAttal` | Renaissance 候选人 |
| 13 | Édouard Philippe | `@EPhilippe_LH` | Horizons 候选人 |
| 14 | Raphaël Glucksmann | `@RGlucksmann` | PS/Place publique 阵营 |
| 15 | Bruno Retailleau | `@BrunoRetailleau` | LR 候选人 |
| 16 | Xavier Bertrand | `@xavierbertrand` | Nous France 候选人 |
| 17 | Éric Zemmour | `@ZemmourEric` | Reconquête |
| 18 | Nicolas Dupont-Aignan | `@dupontaignan` | Debout la France |

## 3. 民调机构（5）

| # | 账号 | Handle | 说明 |
|---:|---|---|---|
| 19 | Ifop | `@IfopOpinion` | 主要机构 |
| 20 | Ipsos | `@IpsosFrance` | 主要机构 |
| 21 | Elabe | `@Elabe_` | 主要机构 |
| 22 | Odoxa | `@OdoxaSondages` | 主要机构 |
| 23 | Cluster17 | `@Cluster_17` | 新兴机构，2027 周期活跃 |

## 4. 官方机构（2）

| # | 账号 | Handle | 说明 |
|---:|---|---|---|
| 24 | Ministère de l'Intérieur | `@Interieur_Gouv` | 选举组织、结果、官方数据 |
| 25 | Conseil constitutionnel | `@Conseil_constit` | 候选人名单、parrainages、结果确认 |

## 5. 备选池（按需替换）

| 账号 | Handle | 场景 |
|---|---|---|
| François Bayrou | `@FrancoisBayrou` | 若 MoDem 独立参选/关键背书 |
| Fabien Roussel | `@FabienRoussel` | PCF 候选人 |
| Yannick Jadot | `@YannickJadot` | EELV 候选人 |
| Olivier Faure | `@olivierfaure` | PS 内部动态 |
| Laurent Wauquiez | `@laurentwauquiez` | LR 内部动态 |
| David Lisnard | `@DavidLisnard` | 右翼候选人/备选 |
| Jean Lassalle | `@JeanLassalle` | 地方主义/农村议题 |
| franceinfo | `@franceinfo` | 媒体快讯 |
| BFMTV | `@BFMTV` | 媒体快讯 |
| Le Monde | `@lemondefr` | 媒体深度 |

## 6. 采集规则

```text
每 60 分钟：
  for account in accounts:
    GET /2/users/:id/tweets?max_results=10&exclude=retweets,replies
    只保留 created_at > last_seen_at 的 posts
    按 post_id 去重（D1 unique）
    写入 social_posts，更新 last_seen_at
```

- 不拉 replies/retweets，避免成本翻倍。
- 不拉 followers/following。
- 同一 UTC 日重复读取不计费，但仍按 `post_id` 去重，避免重复入库。
- 预算 cap：X Console 设 $20/月；D1 计数器达到 4,000 reads 停止。
- 若某账号长期无更新，降频到 6 小时，把预算留给活跃账号。

## 7. 预算核算

| 项 | 数值 |
|---|---:|
| 账号数 | 25 |
| 平均 posts/天/账号 | 4 |
| posts/天 | 100 |
| posts/月 | 3,000 |
| 单价 | $0.005/post |
| **月成本** | **$15** |

若实际 posts 更多（选举期），上限 4,000 reads = **$20/月**。
