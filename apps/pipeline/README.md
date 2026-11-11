# VLF pipeline

Cloudflare Worker for ingestion, judging, momentum and scheduling.

## Local

```bash
cp .dev.vars.example .dev.vars
pnpm --filter @vlf/pipeline dev -- --port 8787
```

`wrangler.local.jsonc` omits the Workers AI binding so local dev works without a Cloudflare API token. The Jev judge falls back to keyword rules when `env.AI` is absent.

Local D1/KV/R2/Queue state is shared with the web app at the repo root: `.wrangler/state`.

## Endpoints

```bash
curl http://127.0.0.1:8787/health

# ingestion
curl -X POST http://127.0.0.1:8787/admin/ingest/rss -H "x-admin-token: dev-token"
curl -X POST http://127.0.0.1:8787/admin/ingest/gdelt -H "x-admin-token: dev-token"
curl -X POST http://127.0.0.1:8787/admin/ingest/x -H "x-admin-token: dev-token"
curl -X POST http://127.0.0.1:8787/admin/ingest/markets -H "x-admin-token: dev-token"
curl -X POST http://127.0.0.1:8787/admin/ingest/social -H "x-admin-token: dev-token"
curl -X POST http://127.0.0.1:8787/admin/ingest/bluesky -H "x-admin-token: dev-token"
curl -X POST http://127.0.0.1:8787/admin/ingest/endorsements -H "x-admin-token: dev-token"
curl -X POST http://127.0.0.1:8787/admin/ingest/parrainages -H "x-admin-token: dev-token"
curl -X POST http://127.0.0.1:8787/admin/ingest/kalshi -H "x-admin-token: dev-token"
curl -X POST http://127.0.0.1:8787/admin/ingest/metaculus -H "x-admin-token: dev-token"
curl -X POST http://127.0.0.1:8787/admin/ingest/polls -H "x-admin-token: dev-token"

# poll PDF review queue
curl -X POST http://127.0.0.1:8787/admin/polls/parse -H "x-admin-token: dev-token" -H 'content-type: application/json' -d '{"url":"https://www.commission-des-sondages.fr/notices/medias/fichiers/add/2381"}'
curl "http://127.0.0.1:8787/admin/polls/drafts?status=pending" -H "x-admin-token: dev-token"
curl -X POST http://127.0.0.1:8787/admin/polls/drafts/<id>/approve -H "x-admin-token: dev-token" -H 'content-type: application/json' -d '{}'
curl -X POST http://127.0.0.1:8787/admin/polls/drafts/<id>/reject -H "x-admin-token: dev-token" -H 'content-type: application/json' -d '{"note":"..."}'

# maintenance
curl -X POST "http://127.0.0.1:8787/admin/backfill-judgments?force=1" -H "x-admin-token: dev-token"
curl -X POST http://127.0.0.1:8787/admin/reset-fallback-judgments -H "x-admin-token: dev-token"
curl -X POST http://127.0.0.1:8787/admin/recompute-momentum -H "x-admin-token: dev-token"
curl -X POST http://127.0.0.1:8787/admin/recompute-polls -H "x-admin-token: dev-token"
curl -X POST http://127.0.0.1:8787/admin/recompute-scores -H "x-admin-token: dev-token"
curl -X POST "http://127.0.0.1:8787/admin/backfill-score-history?days=60" -H "x-admin-token: dev-token"
curl "http://127.0.0.1:8787/admin/eval/jev?dataset=real&limit=360" -H "x-admin-token: dev-token"
curl -X POST http://127.0.0.1:8787/admin/clean-articles -H "x-admin-token: dev-token"

# live SSE
curl -N http://127.0.0.1:8787/live
curl http://127.0.0.1:8787/live/recent

# connectors
curl http://127.0.0.1:8787/admin/connectors -H "x-admin-token: dev-token"

# forecast audit
curl -X POST http://127.0.0.1:8787/admin/forecast/snapshot -H "x-admin-token: dev-token"
curl -X POST http://127.0.0.1:8787/admin/forecast/store -H "x-admin-token: dev-token" -H 'content-type: application/json' -d @forecast.json
curl "http://127.0.0.1:8787/admin/forecast/runs?limit=5" -H "x-admin-token: dev-token"

# stats
curl http://127.0.0.1:8787/admin/stats -H "x-admin-token: dev-token"
```

## Production bindings

`wrangler.jsonc` expects:

- D1 `vlf-main`
- R2 `vlf-raw`
- KV namespace
- Queue `vlf-ingest` + DLQ `vlf-ingest-dlq`
- Workers AI binding `AI`
- Durable Object `LIVE_HUB` (class `LiveHub`) for SSE
- vars `COMPUTE_URL` (Python parser base URL)
- secrets `ADMIN_TOKEN`, `X_BEARER_TOKEN`, optional `METACULUS_TOKEN`, optional `TYPESAFE_API_KEY`
- TypeSafe direct is preferred when `TYPESAFE_API_KEY` is set; otherwise the Worker uses the `AI` binding

Set secrets with `wrangler secret put` after replacing the placeholder IDs.
