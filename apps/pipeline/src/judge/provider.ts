import type { Env } from '../types';
import { type DecisionQuestion, runGeminiDecision } from './gemini';

export type JudgeProvider = 'gemini' | 'typesafe' | 'workers-ai';

/**
 * Pick the configured decision provider. `DECISION_PROVIDER` wins when set,
 * otherwise the first configured provider is used:
 * Gemini Decisions API -> TypeSafe Jev -> Workers AI Jev.
 */
export function resolveJudgeProvider(env: Env, preferred?: JudgeProvider): JudgeProvider | null {
  if (preferred) return preferred;
  const configured = (env.DECISION_PROVIDER ?? 'auto').toLowerCase();
  if (configured === 'gemini' || configured === 'typesafe' || configured === 'workers-ai') {
    return configured as JudgeProvider;
  }
  if (env.GEMINI_API_KEY) return 'gemini';
  if (env.TYPESAFE_API_KEY) return 'typesafe';
  if (env.AI) return 'workers-ai';
  return null;
}

/**
 * Run the configured decision model and normalize both providers to the same
 * response shape: `{ model, answers, usage }`.
 */
export async function runJevModel(
  env: Env,
  state: unknown,
  questions: Record<string, unknown>,
  preferred?: JudgeProvider,
): Promise<any> {
  const provider = resolveJudgeProvider(env, preferred);
  if (!provider) throw new Error('No decision provider configured');

  if (provider === 'gemini') {
    return runGeminiDecision(env, state, questions as Record<string, DecisionQuestion>);
  }

  if (provider === 'typesafe') {
    if (!env.TYPESAFE_API_KEY) throw new Error('TYPESAFE_API_KEY is not configured');
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
      throw new Error(
        `TypeSafe Jev HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`,
      );
    }
    return response.json();
  }

  if (!env.AI) throw new Error('Workers AI binding is not configured');
  const gateway = env.AI_GATEWAY_ID ? ({ gateway: { id: env.AI_GATEWAY_ID } } as any) : undefined;
  return env.AI.run('typesafe/jev' as any, { state, questions } as any, gateway);
}
