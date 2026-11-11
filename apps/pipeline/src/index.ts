import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { runGdelt } from './connectors/gdelt';
import { runMarkets } from './connectors/markets';
import { runMastodon } from './connectors/mastodon';
import { runBluesky } from './connectors/bluesky';
import { runEndorsements } from './connectors/endorsements';
import { checkParrainages2027, runParrainages } from './connectors/parrainages';
import { runKalshi } from './connectors/kalshi';
import { runMetaculus } from './connectors/metaculus';
import { runSondax } from './connectors/sondax';
import { runRss } from './connectors/rss';
import { runX } from './connectors/x';
import { backfillJudgments, judgeArticle, resetFallbackJudgments } from './judge/jev';
import { evaluateJev } from './judge/eval';
import { getArticleById } from './lib/db';
import { cleanArticles } from './maintenance/clean';
import { recomputeMomentum } from './scores/momentum';
import { aggregatePolls } from './scores/polls';
import { computeScores } from './scores/compute';
import { backfillScoreHistory } from './scores/history';
import { getForecastRun, listForecastRuns, storeForecast } from './forecast/store';
import { snapshotForecasts } from './forecast/snapshot';
import { approvePollDraft, getPollDraft, listPollDrafts, parsePollDraft, rejectPollDraft, storePollDraft } from './polls/drafts';
import type { Env } from './types';
import { publishLive } from './live/publish';

const app = new Hono<{ Bindings: Env }>();

// The admin token is still required for every admin route; CORS only lets the
// review UI call the local pipeline from the Astro dev server.
app.use('*', cors({ origin: '*', allowHeaders: ['content-type', 'x-admin-token'], allowMethods: ['GET', 'POST', 'OPTIONS'] }));

app.get('/live', async (c) => {
  if (!c.env.LIVE_HUB) return c.text('live hub not configured', 503);
  const id = c.env.LIVE_HUB.idFromName('global');
  return c.env.LIVE_HUB.get(id).fetch('https://live.internal/subscribe', {
    headers: { accept: 'text/event-stream' },
  });
});

app.get('/live/recent', async (c) => {
  if (!c.env.LIVE_HUB) return c.json({ ok: false, error: 'live hub not configured' }, 503);
  const id = c.env.LIVE_HUB.idFromName('global');
  const response = await c.env.LIVE_HUB.get(id).fetch('https://live.internal/recent');
  return new Response(response.body, {
    status: response.status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', 'access-control-allow-origin': '*' },
  });
});

app.get('/health', (c) =>
  c.json({
    ok: true,
    service: 'vlf-pipeline',
    version: '0.1.0',
    now: new Date().toISOString(),
  }),
);

const adminAuth = async (c: any, next: any) => {
  const token = c.env.ADMIN_TOKEN;
  if (!token) return c.json({ error: 'ADMIN_TOKEN not configured' }, 503);
  if (c.req.header('x-admin-token') !== token) return c.json({ error: 'unauthorized' }, 401);
  await next();
};

app.post('/admin/ingest/rss', adminAuth, async (c) => {
  const result = await runRss(c.env);
  return c.json({ ok: true, ...result });
});

app.post('/admin/ingest/gdelt', adminAuth, async (c) => {
  const result = await runGdelt(c.env);
  return c.json({ ok: true, ...result });
});

app.post('/admin/ingest/x', adminAuth, async (c) => {
  const result = await runX(c.env);
  return c.json({ ok: true, ...result });
});

app.post('/admin/ingest/markets', adminAuth, async (c) => {
  const result = await runMarkets(c.env);
  const scores = await computeScores(c.env);
  return c.json({ ok: true, ...result, scores });
});

app.post('/admin/ingest/social', adminAuth, async (c) => {
  const [mastodon, bluesky] = await Promise.all([runMastodon(c.env), runBluesky(c.env)]);
  const scores = await computeScores(c.env);
  return c.json({ ok: true, mastodon, bluesky, scores });
});

app.post('/admin/ingest/bluesky', adminAuth, async (c) => {
  const result = await runBluesky(c.env);
  const scores = await computeScores(c.env);
  return c.json({ ok: true, ...result, scores });
});

app.post('/admin/ingest/kalshi', adminAuth, async (c) => {
  const result = await runKalshi(c.env);
  return c.json({ ok: true, ...result });
});

app.post('/admin/ingest/metaculus', adminAuth, async (c) => {
  const result = await runMetaculus(c.env);
  return c.json({ ok: true, ...result });
});

app.post('/admin/ingest/endorsements', adminAuth, async (c) => {
  const result = await runEndorsements(c.env);
  return c.json({ ok: true, ...result });
});

app.post('/admin/ingest/parrainages', adminAuth, async (c) => {
  const result = await runParrainages(c.env);
  return c.json({ ok: true, ...result });
});

app.get('/admin/ingest/parrainages/2027-status', adminAuth, async (c) => {
  const status = await checkParrainages2027();
  return c.json({ ok: true, ...status });
});

app.post('/admin/ingest/polls', adminAuth, async (c) => {
  const ingested = await runSondax(c.env);
  const aggregated = await aggregatePolls(c.env, 60);
  const scores = await computeScores(c.env);
  return c.json({ ok: true, ingested, aggregated, scores });
});

app.get('/admin/polls/drafts', adminAuth, async (c) => {
  const status = c.req.query('status') ?? 'pending';
  const drafts = await listPollDrafts(c.env, status);
  return c.json({ ok: true, status, data: drafts });
});

app.get('/admin/polls/drafts/:id', adminAuth, async (c) => {
  const draft = await getPollDraft(c.env, c.req.param('id'));
  if (!draft) return c.json({ error: 'draft not found' }, 404);
  return c.json({ ok: true, data: draft });
});

app.post('/admin/polls/parse', adminAuth, async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { url?: string };
  if (!body.url) return c.json({ error: 'url is required' }, 400);
  try {
    const parsed = await parsePollDraft(c.env, body.url);
    const stored = await storePollDraft(c.env, parsed);
    return c.json({ ok: true, ...stored, parsed });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : String(error) }, 502);
  }
});

app.post('/admin/polls/drafts/import', adminAuth, async (c) => {
  const body = (await c.req.json().catch(() => null)) as any;
  if (!body?.source_url || !Array.isArray(body?.results)) {
    return c.json({ error: 'source_url and results[] are required' }, 400);
  }
  const stored = await storePollDraft(c.env, {
    ...body,
    commission_notice_url: body.commission_notice_url ?? body.source_url,
    confidence: Number(body.confidence ?? 0.3),
    warnings: body.warnings ?? ['Imported manually; review required.'],
  });
  return c.json({ ok: true, ...stored });
});

app.post('/admin/polls/drafts/:id/approve', adminAuth, async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as any;
  const result = await approvePollDraft(c.env, c.req.param('id'), body);
  if (!result.ok) return c.json(result, 400);
  const aggregated = await aggregatePolls(c.env, 60);
  const scores = await computeScores(c.env);
  return c.json({ ...result, ok: true, aggregated, scores });
});

app.post('/admin/polls/drafts/:id/reject', adminAuth, async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { note?: string };
  const rejected = await rejectPollDraft(c.env, c.req.param('id'), body.note ?? null);
  return c.json({ ok: rejected });
});

app.post('/admin/recompute-polls', adminAuth, async (c) => {
  const result = await aggregatePolls(c.env, 60);
  return c.json({ ok: true, ...result });
});

app.post('/admin/recompute-scores', adminAuth, async (c) => {
  const result = await computeScores(c.env);
  return c.json({ ok: true, ...result });
});

app.post('/admin/backfill-score-history', adminAuth, async (c) => {
  const days = Number(c.req.query('days') ?? '60');
  const result = await backfillScoreHistory(c.env, days);
  return c.json({ ok: true, ...result });
});

app.post('/admin/backfill-judgments', adminAuth, async (c) => {
  const limit = Math.min(Math.max(Number(c.req.query('limit') ?? '1000'), 1), 1000);
  const count = await backfillJudgments(c.env, limit, c.req.query('force') === '1');
  return c.json({ ok: true, count });
});

app.post('/admin/reset-fallback-judgments', adminAuth, async (c) => {
  const deleted = await resetFallbackJudgments(c.env);
  return c.json({ ok: true, deleted });
});

app.get('/admin/eval/jev', adminAuth, async (c) => {
  const result = await evaluateJev(c.env, {
    limit: Number(c.req.query('limit') ?? '360'),
    model: c.req.query('model') ?? 'typesafe/jev',
    dataset: (c.req.query('dataset') as 'real' | 'synthetic' | 'all' | undefined) ?? 'real',
  });
  return c.json({ ok: true, ...result });
});

app.post('/admin/recompute-momentum', adminAuth, async (c) => {
  const result = await recomputeMomentum(c.env, 7);
  return c.json({ ok: true, ...result });
});

app.post('/admin/clean-articles', adminAuth, async (c) => {
  const updated = await cleanArticles(c.env, 1000);
  return c.json({ ok: true, updated });
});

app.post('/admin/judge/:articleId', adminAuth, async (c) => {
  const article = await getArticleById(c.env, c.req.param('articleId'));
  if (!article) return c.json({ error: 'article not found' }, 404);
  const result = await judgeArticle(c.env, article);
  return c.json({ ok: true, result });
});

app.post('/admin/forecast/store', adminAuth, async (c) => {
  const body = (await c.req.json().catch(() => null)) as any;
  if (!body) return c.json({ error: 'JSON body required' }, 400);
  try {
    const result = await storeForecast(c.env, body);
    return c.json({ ok: true, ...result });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : String(error) }, 400);
  }
});

app.post('/admin/forecast/snapshot', adminAuth, async (c) => {
  try {
    const result = await snapshotForecasts(c.env);
    return c.json({ ok: true, ...result });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});

app.get('/admin/forecast/runs', adminAuth, async (c) => {
  const runs = await listForecastRuns(c.env, Number(c.req.query('limit') ?? '20'));
  return c.json({ ok: true, data: runs });
});

app.get('/admin/forecast/runs/:id', adminAuth, async (c) => {
  const run = await getForecastRun(c.env, c.req.param('id'));
  if (!run) return c.json({ error: 'run not found' }, 404);
  return c.json({ ok: true, data: run });
});

app.get('/admin/connectors', adminAuth, async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT connector, MAX(finished_at) AS last_finished,
            (SELECT status FROM ingestion_runs r2 WHERE r2.connector = r1.connector ORDER BY started_at DESC LIMIT 1) AS last_status,
            (SELECT items FROM ingestion_runs r2 WHERE r2.connector = r1.connector ORDER BY started_at DESC LIMIT 1) AS last_items,
            (SELECT errors FROM ingestion_runs r2 WHERE r2.connector = r1.connector ORDER BY started_at DESC LIMIT 1) AS last_errors,
            (SELECT detail FROM ingestion_runs r2 WHERE r2.connector = r1.connector ORDER BY started_at DESC LIMIT 1) AS last_detail
     FROM ingestion_runs r1
     GROUP BY connector
     ORDER BY last_finished DESC`,
  ).all();
  return c.json({ ok: true, data: results });
});

app.get('/admin/stats', adminAuth, async (c) => {
  const [articles, posts, bluesky, judgments, markets, momentum, endorsements, parrainages, drafts] = await Promise.all([
    c.env.DB.prepare('SELECT COUNT(*) AS n FROM articles').first<{ n: number }>(),
    c.env.DB.prepare('SELECT COUNT(*) AS n FROM social_posts').first<{ n: number }>(),
    c.env.DB.prepare("SELECT COUNT(*) AS n FROM social_posts WHERE platform = 'bluesky'").first<{ n: number }>(),
    c.env.DB.prepare('SELECT COUNT(*) AS n FROM judgments').first<{ n: number }>(),
    c.env.DB.prepare('SELECT COUNT(*) AS n FROM markets').first<{ n: number }>(),
    c.env.DB.prepare('SELECT COUNT(*) AS n FROM media_momentum').first<{ n: number }>(),
    c.env.DB.prepare('SELECT COUNT(*) AS n FROM endorsements').first<{ n: number }>(),
    c.env.DB.prepare('SELECT COUNT(*) AS n FROM parrainage_baseline').first<{ n: number }>(),
    c.env.DB.prepare("SELECT COUNT(*) AS n FROM poll_drafts WHERE status = 'pending'").first<{ n: number }>(),
  ]);
  return c.json({
    articles: articles?.n ?? 0,
    social_posts: posts?.n ?? 0,
    bluesky_posts: bluesky?.n ?? 0,
    judgments: judgments?.n ?? 0,
    markets: markets?.n ?? 0,
    media_momentum: momentum?.n ?? 0,
    endorsements: endorsements?.n ?? 0,
    parrainage_rows: parrainages?.n ?? 0,
    pending_poll_drafts: drafts?.n ?? 0,
  });
});

async function scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
  const cron = controller.cron;
  if (cron === '*/15 * * * *') {
    ctx.waitUntil(
      Promise.all([
        runGdelt(env),
        runMastodon(env),
        (async () => {
          await runMarkets(env);
          await computeScores(env);
        })(),
      ]),
    );
    return;
  }
  if (cron === '0 * * * *') {
    ctx.waitUntil(
      (async () => {
        await Promise.all([runX(env), runBluesky(env)]);
        await computeScores(env);
      })(),
    );
    return;
  }
  if (cron === '0 7 * * *') {
    ctx.waitUntil(snapshotForecasts(env));
    return;
  }
  if (cron === '0 6 * * *') {
    ctx.waitUntil(
      Promise.all([
        runRss(env),
        runGdelt(env),
        runMarkets(env),
        runMastodon(env),
        runBluesky(env),
        (async () => {
          await runSondax(env);
          await runEndorsements(env);
          await runParrainages(env);
          await checkParrainages2027();
          await aggregatePolls(env, 60);
          await recomputeMomentum(env, 7);
          await computeScores(env);
        })(),
      ]),
    );
    return;
  }
  ctx.waitUntil(runRss(env));
}

async function queue(batch: MessageBatch<any>, env: Env, _ctx: ExecutionContext) {
  for (const message of batch.messages) {
    try {
      const body = message.body;
      if (body?.kind === 'article' && body.articleId) {
        const article = await getArticleById(env, body.articleId);
        if (article) await judgeArticle(env, article);
      }
      message.ack();
    } catch (error) {
      console.error('queue message failed', error);
      message.retry();
    }
  }
}

export default {
  fetch: app.fetch,
  scheduled,
  queue,
};

export { LiveHub } from './live/hub';
