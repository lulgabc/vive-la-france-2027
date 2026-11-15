import type { Env } from '../types';

/**
 * Gemini Decisions API adapter.
 *
 * Google's endpoint is `v1beta/decisions` and returns typed answers with
 * calibrated probabilities, zero output tokens. The request/response shape is
 * close to TypeSafe Jev, but not identical:
 *
 * - Jev sends `state` (any JSON); Gemini wants `input` (text or content blocks)
 * - Jev `noul` criteria are `{ true, false }`; Gemini wants
 *   `{ true_description, false_description }`
 * - Gemini usage is `total_input_tokens` / `total_output_tokens`
 *
 * Docs: https://aistudio.google.com/docs/decisions-api
 */
export const GEMINI_DECISIONS_ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/decisions';
export const GEMINI_DECISION_MODEL = 'gemini-decision-1';

export type DecisionQuestion = {
  type: 'noul' | 'choice' | 'score';
  instructions: string;
  criteria?: Record<string, string> | string[];
};

export type DecisionAnswer = {
  type: 'noul' | 'choice' | 'score';
  noul?: number;
  choice?: string;
  probabilities?: Record<string, number>;
  confidence?: number;
};

export type DecisionResponse = {
  model: string;
  answers: Record<string, DecisionAnswer>;
  usage: { input_tokens: number; output_tokens: number };
};

/** Convert Jev-style questions into the Decisions API schema. */
export function toDecisionQuestions(
  questions: Record<string, DecisionQuestion>,
): Record<string, unknown> {
  const converted: Record<string, unknown> = {};
  for (const [key, question] of Object.entries(questions)) {
    if (question.type === 'noul') {
      const criteria = question.criteria as { true?: string; false?: string } | undefined;
      converted[key] = {
        type: 'noul',
        instructions: question.instructions,
        ...(criteria?.true || criteria?.false
          ? {
              criteria: {
                ...(criteria.true ? { true_description: criteria.true } : {}),
                ...(criteria.false ? { false_description: criteria.false } : {}),
              },
            }
          : {}),
      };
      continue;
    }
    converted[key] = {
      type: question.type,
      instructions: question.instructions,
      criteria: question.criteria,
    };
  }
  return converted;
}

/**
 * Serialize arbitrary state as one text block. The API concatenates adjacent
 * text blocks without a separator, so a single JSON block is the least
 * surprising representation.
 */
export function toDecisionInput(state: unknown): Array<{ type: 'text'; text: string }> {
  const text = typeof state === 'string' ? state : JSON.stringify(state);
  return [{ type: 'text', text }];
}

export function normalizeDecisionResponse(
  raw: any,
  model = GEMINI_DECISION_MODEL,
): DecisionResponse {
  return {
    model,
    answers: raw?.answers ?? {},
    usage: {
      input_tokens: Number(raw?.usage?.total_input_tokens ?? 0),
      output_tokens: Number(raw?.usage?.total_output_tokens ?? 0),
    },
  };
}

export async function runGeminiDecision(
  env: Env,
  state: unknown,
  questions: Record<string, DecisionQuestion>,
): Promise<DecisionResponse> {
  if (!env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not configured');
  const model = env.GEMINI_DECISION_MODEL ?? GEMINI_DECISION_MODEL;
  const response = await fetch(GEMINI_DECISIONS_ENDPOINT, {
    method: 'POST',
    headers: {
      'x-goog-api-key': env.GEMINI_API_KEY,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      input: toDecisionInput(state),
      questions: toDecisionQuestions(questions),
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    throw new Error(
      `Gemini Decisions HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`,
    );
  }
  return normalizeDecisionResponse(await response.json(), model);
}
