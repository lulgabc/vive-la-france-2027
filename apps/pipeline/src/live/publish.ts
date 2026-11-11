import type { Env } from '../types';

/**
 * Best-effort publish to the LiveHub Durable Object. Ingestion must never fail
 * because the live feed is unavailable.
 */
export async function publishLive(
  env: Env,
  event: Record<string, unknown> & { type: string },
): Promise<void> {
  if (!env.LIVE_HUB) return;
  try {
    const id = env.LIVE_HUB.idFromName('global');
    await env.LIVE_HUB.get(id).fetch('https://live.internal/publish', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(event),
    });
  } catch (error) {
    console.error('live publish failed', error);
  }
}
