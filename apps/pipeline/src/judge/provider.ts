import type { Env } from '../types';

/**
 * Run Jev through TypeSafe direct when TYPESAFE_API_KEY is configured,
 * otherwise through the Workers AI binding.
 *
 * The Cloudflare path requires AI Gateway credits or BYOK for this
 * third-party model. The direct path is useful for local development and for
 * keeping the pipeline working when the account has no AI Gateway balance.
 */
export async function runJevModel(
  env: Env,
  state: unknown,
  questions: Record<string, unknown>,
): Promise<any> {
  if (env.TYPESAFE_API_KEY) {
    const response = await fetch('https://api.typesafe.ai/v1/systemone', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.TYPESAFE_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: env.TYPESAFE_MODEL ?? 'jev-latest',
        state,
        questions,
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) {
      throw new Error(`TypeSafe Jev HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
    }
    return response.json();
  }

  if (!env.AI) throw new Error('No Jev provider configured');
  const gateway = env.AI_GATEWAY_ID ? ({ gateway: { id: env.AI_GATEWAY_ID } } as any) : undefined;
  return env.AI.run('typesafe/jev' as any, { state, questions } as any, gateway);
}
