# P0 实现状态（2026-11-10）

## 已完成

| 模块 | 状态 |
|---|---|
| pnpm workspace | `apps/web`、`apps/pipeline`、`apps/compute`、`packages/domain`、`packages/db` |
| Astro 7 三语站点 | `/`、`/en/`、`/zh/`；首页、候选人、地图、民调、市场、方法论、关于、信息流 |
| 设计系统 | Tailwind 4 + 纸张/墨色/蓝红编辑风格；响应式；无横向溢出 |
| 地图 | 96 个本土省 SVG；真实 2022 首轮结果；hover 详情；图例 |
| D1 | 37 条 schema 语句；15 政党、15 候选人、107 省、1,284 条 2022 结果、demo 评分 |
| 只读 API | `/api/v1/health`、`/candidates`、`/scores`、`/map/departments`；D1 不可用回退 seed |
| RSS 采集 | 23 个法媒源；实测 302 条；11 个源失败（404/超时） |
| GDELT | 连接器已写；本地触发遇 429（限流），可重试 |
| X | 25 个核心账号；预算计数器；无 token 时跳过 |
| Jev | `typesafe/jev` 调用封装；无 AI binding 时回退关键词 |
| 队列 | `vlf-ingest` 本地可消费 |
| Python 容器 | FastAPI `/health`、`/parse-poll`、`/forecast`；Dockerfile |
| 权重模拟器 | 5 个滑块、4 个预设、URL `?w=` 同步、localStorage 持久化 |
| 检查 | `pnpm check` 0 errors；`pnpm build` 成功；13 个路由 200；无 console error |

## 本地运行

```bash
pnpm install
pnpm --filter @vlf/web dev -- --port 4321
# 另一个终端
cp apps/pipeline/.dev.vars.example apps/pipeline/.dev.vars
pnpm --filter @vlf/pipeline dev -- --port 8787
```

- Web: http://127.0.0.1:4321
- Pipeline: http://127.0.0.1:8787/health
- RSS: `curl -X POST http://127.0.0.1:8787/admin/ingest/rss -H "x-admin-token: dev-token"`

## 已知缺口

1. **D1 远程 ID 未填**：`apps/web/wrangler.jsonc`、`apps/pipeline/wrangler.jsonc` 里是 `REPLACE_WITH_D1_DATABASE_ID`。
2. **R2/KV/Queue 远程 ID 未填**：生产部署前创建并替换。
3. **Workers AI binding 只在生产配置**：本地 `wrangler.local.jsonc` 去掉 AI，Jev 走 fallback。
4. **GDELT 429**：需要退避/重试和更窄的 query。
5. **X token 未配置**：`X_BEARER_TOKEN` 为空时安全跳过。
6. **民调/市场为 demo 占位**：真实 PDF 解析、Commission notice、市场快照在 P1/P2。
7. **577 选区未入库**：当前只到省级；立法选举前补。
8. **中文只覆盖 UI + 关键页面**：新闻流保留法语原文（按约定）。
10. **Biome 格式未统一**：`pnpm lint` 目前会报大量格式差异，未阻塞构建。

## 下一步

1. 远程 D1/R2/KV/Queue 创建 + 替换 ID；跑 migrations/seed。
2. Jev 法语标注集（300–500 条）+ 阈值校准。
3. `/fil` 接真实文章 + 来源/议题/实体筛选。
4. 民调 PDF 解析 + 人工复核。
5. 市场快照 + 去水。
6. 评分 v1 从 demo 切到真实聚合。
