# 重新部署 Runbook（2026-11-24 存档）

本文件记录上一次生产部署的完整参数与步骤。所有资源已于 2026-11-24 删除；以下是重建方法。
机器可读快照见同目录 `state.json`，代码快照见 git tag `archive-2026-11-24`。

## 0. 前置

- Cloudflare 账号：`lulgabc@gmail.com` / `735697da615cf58f5c2afab87f844d90`
- workers.dev 子域：`ainet-netbook`（仍属于账号，可用 `GET /accounts/{id}/workers/subdomain` 确认）
- Node ≥ 22.23.4，pnpm 12.18.0
- 需要两个 secret：`ADMIN_TOKEN`（自建）、`TYPESAFE_API_KEY`
- 可选：`X_BEARER_TOKEN`、`METACULUS_TOKEN`、`GEMINI_API_KEY`

```bash
pnpm install
npx wrangler whoami   # 确认账号
```

## 1. 创建资源

```bash
cd "/Users/lulgabc/Documents/Default Project/vive-la-france-2027"

npx wrangler d1 create vlf-main
npx wrangler kv namespace create CACHE
npx wrangler kv namespace create SESSION
npx wrangler queues create vlf-ingest
npx wrangler queues create vlf-ingest-dlq
```

R2 不需要：生产未使用 `RAW`，配置里已移除。Astro 的 `ASSETS`、`IMAGES` 由适配器自动添加。

## 2. 填入资源 ID

把上一步返回的 ID 填进：

- `apps/pipeline/wrangler.jsonc`
  - `d1_databases[0].database_id`
  - `kv_namespaces[0].id`
- `apps/web/wrangler.jsonc`
  - `kv_namespaces[0].id`（SESSION）
  - `d1_databases[0].database_id`

然后设置两个 URL：

- `apps/pipeline/wrangler.jsonc` → `vars.SITE_URL = https://vlf-web.<subdomain>.workers.dev`
- `apps/web/astro.config.mjs` → `site = https://vlf-web.<subdomain>.workers.dev`

## 3. 应用数据库迁移

```bash
npx wrangler d1 migrations apply vlf-main --remote --config apps/pipeline/wrangler.jsonc
```

共 11 个 migration（0001–0011）。

## 4. 设置 secrets

```bash
# 生成并保存好管理员 token（不要只放 /tmp）
ADMIN_TOKEN=$(openssl rand -hex 24)
printf '%s' "$ADMIN_TOKEN" | npx wrangler secret put ADMIN_TOKEN --config apps/pipeline/wrangler.jsonc

# TypeSafe
printf '%s' "$TYPESAFE_API_KEY" | npx wrangler secret put TYPESAFE_API_KEY --config apps/pipeline/wrangler.jsonc
```

可选：

```bash
# 目前 DECISION_PROVIDER=typesafe；要试 Gemini 再取消注释
# printf '%s' "$GEMINI_API_KEY" | npx wrangler secret put GEMINI_API_KEY --config apps/pipeline/wrangler.jsonc
```

## 5. 恢复数据（可选）

空库可以直接从种子数据开始；要恢复 2026-11-24 的线上数据：

```bash
# 先在本地确认备份存在：backups/2026-11-24/vlf-main-data.sql（44 MB，47,317 行）
npx wrangler d1 execute vlf-main --remote --config apps/pipeline/wrangler.jsonc \
  --file backups/2026-11-24/vlf-main-data.sql

# 重建 FTS5 索引（备份不含虚拟表）
npx wrangler d1 execute vlf-main --remote --config apps/pipeline/wrangler.jsonc \
  --command "INSERT INTO articles_fts(articles_fts) VALUES('rebuild');"
```

注意：

- 备份按外键依赖排序，且**不含** `PRAGMA foreign_keys=OFF` / `BEGIN TRANSACTION`，可直接被 `wrangler d1 execute --file` 接受
- 备份不含 `d1_migrations`，迁移状态由第 3 步决定
- 备份在本地 `backups/`，已被 `.gitignore` 忽略；换机器要单独拷贝

只想要最小种子数据时，用 `packages/db/seed.sql`：

```bash
npx wrangler d1 execute vlf-main --remote --config apps/pipeline/wrangler.jsonc \
  --file packages/db/seed.sql
```

## 6. 构建并部署 Web

`PUBLIC_PIPELINE_URL` 是**构建时**变量，必须指向最终 pipeline URL：

```bash
export SUBDOMAIN=ainet-netbook
PUBLIC_PIPELINE_URL="https://vlf-pipeline.$SUBDOMAIN.workers.dev" \
  pnpm --filter @vlf/web build

npx wrangler deploy --config apps/web/dist/server/wrangler.json
```

`apps/web/dist/server/wrangler.json` 是 Astro 生成的部署配置，不要手改；它从 `apps/web/wrangler.jsonc` 读取 D1/KV。

## 7. 部署 Pipeline

顺序建议：先 web，后 pipeline（pipeline 的 `WEB` service binding 指向 `vlf-web`）。

```bash
npx wrangler deploy --config apps/pipeline/wrangler.jsonc
```

部署后会看到：

- Durable Object `LiveHub`（SQLite，migration tag `v1`）
- Queue producer/consumer `vlf-ingest` + DLQ
- Cron：`*/5`、`*/15`、`0 *`、`0 6`、`0 */2`
- `WEB` service binding

## 8. 验证

```bash
BASE=https://vlf-web.$SUBDOMAIN.workers.dev
for u in / /carte /legislatives /previsions /sondages /marches /candidats /fil /methodologie /api/v1/health /api/v1/version; do
  printf "%-20s " "$u"; curl -s -o /dev/null -w "%{http_code}\n" "$BASE$u"
done

curl -s https://vlf-pipeline.$SUBDOMAIN.workers.dev/health
TOKEN=$(cat ~/.config/vlf/admin-token)   # 自己保存的位置
curl -s https://vlf-pipeline.$SUBDOMAIN.workers.dev/admin/stats -H "x-admin-token: $TOKEN"
```

功能抽查：

```bash
# RSS 采集
curl -X POST https://vlf-pipeline.$SUBDOMAIN.workers.dev/admin/ingest/rss -H "x-admin-token: $TOKEN"

# Jev 判断（单篇）
curl -X POST https://vlf-pipeline.$SUBDOMAIN.workers.dev/admin/judge/<articleId> -H "x-admin-token: $TOKEN"

# 预测快照：一次最多 3 个情景，重复调用直到 remaining=0
curl -X POST https://vlf-pipeline.$SUBDOMAIN.workers.dev/admin/forecast/snapshot -H "x-admin-token: $TOKEN"

# SSE
curl -sN --max-time 5 https://vlf-pipeline.$SUBDOMAIN.workers.dev/live
```

浏览器检查首页、`/fil`、`/previsions` 无 console 错误。

## 9. 已知坑（下次务必先处理）

1. **采集器缺超时**：`rss.ts`、`gdelt.ts`、`kalshi.ts`、`x.ts` 的 `fetch` 没有 `AbortSignal.timeout`。上游挂起会拖死 cron，并让队列消费者停摆（2026-11-19 即因此停摆）。重新部署前建议先补 15–20s 超时。
2. **D1 免费层写入上限**：市场历史必须 `INSERT OR IGNORE`，只有当天价格 `INSERT OR REPLACE`；评分先比对再写，且每小时一次。否则约 90k 行/天，很快触顶。
3. **预测快照 CPU**：一个 invocation 最多 3 个情景；`/admin/forecast/snapshot` 分批调用直到 `remaining=0`，不要一次跑 9 个。
4. **D1 导出/导入**：`wrangler d1 export` 遇到 FTS5 会失败，必须按表 `--no-schema` 导出；导入文件不能含 `BEGIN TRANSACTION`，外键要按依赖排序。
5. **本地 dev**：web 绑定 IPv6，用 `http://localhost:4321`，不要 `127.0.0.1`。
6. **service binding**：pipeline 通过 `WEB` 取 `/api/v1/projection`，没有该 binding 会 404；不要改回公网 URL。
7. **admin token**：上次只存在 `/tmp`，被系统清理后无法再查。新 token 必须存到密码管理器或 `~/.config/vlf/`。
8. **Gemini**：适配器已在仓库，但 `DECISION_PROVIDER=typesafe`，默认不启用；切换前先跑 `docs/13` 的 360 条对比评测。
9. **R2**：未开通，`RAW` 未绑定；代码里 `Env.RAW` 只是类型残留，不要为此去开 R2。

## 10. 清理（再次下线时）

```bash
npx wrangler queues consumer remove vlf-ingest vlf-pipeline   # Worker 是消费者时先移除
npx wrangler delete vlf-pipeline --force
npx wrangler delete vlf-web --force
npx wrangler queues delete vlf-ingest
npx wrangler queues delete vlf-ingest-dlq
npx wrangler kv namespace delete --namespace-id <CACHE_ID> -y
npx wrangler kv namespace delete --namespace-id <SESSION_ID> -y
npx wrangler d1 delete vlf-main -y
```

删除前先按 `backups/2026-11-24/README.md` 的方法导出 D1。
