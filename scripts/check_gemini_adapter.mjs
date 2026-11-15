#!/usr/bin/env node
/**
 * Offline check for the Gemini Decisions adapter.
 *
 * Verifies that Jev-style questions/state are mapped to the exact schema in
 * https://aistudio.google.com/docs/decisions-api and that responses normalize
 * back to the shape `judgeArticle` expects.
 *
 * Run: node --experimental-strip-types scripts/check_gemini_adapter.mjs
 * Optional live check: GEMINI_API_KEY=... node --experimental-strip-types scripts/check_gemini_adapter.mjs --live
 */
import assert from 'node:assert/strict';
import {
  GEMINI_DECISIONS_ENDPOINT,
  normalizeDecisionResponse,
  runGeminiDecision,
  toDecisionInput,
  toDecisionQuestions,
} from '../apps/pipeline/src/judge/gemini.ts';

const questions = {
  election_related: {
    type: 'noul',
    instructions: 'Does this item relate to the 2027 French presidential election?',
    criteria: {
      true: 'About the campaign, a candidacy, a poll or a candidate position.',
      false: 'Incidental mention, another election, entertainment.',
    },
  },
  topic: {
    type: 'choice',
    instructions: 'What is the single dominant policy topic of this item?',
    criteria: {
      economy_purchasing_power: 'Purchasing power, wages, prices, taxes.',
      immigration: 'Immigration, asylum, nationality.',
      other: 'Anything else.',
    },
  },
};

const converted = toDecisionQuestions(questions);

assert.deepEqual(converted.election_related, {
  type: 'noul',
  instructions: questions.election_related.instructions,
  criteria: {
    true_description: questions.election_related.criteria.true,
    false_description: questions.election_related.criteria.false,
  },
});
assert.equal(converted.election_related.criteria.true, undefined);
assert.deepEqual(converted.topic.criteria, questions.topic.criteria);

const input = toDecisionInput({
  title: 'Le Pen dévoile son programme',
  excerpt: 'Pouvoir d’achat et immigration au menu.',
});
assert.deepEqual(input, [
  {
    type: 'text',
    text: '{"title":"Le Pen dévoile son programme","excerpt":"Pouvoir d’achat et immigration au menu."}',
  },
]);

const normalized = normalizeDecisionResponse({
  answers: {
    election_related: { type: 'noul', noul: 0.93, confidence: 0.93 },
    topic: {
      type: 'choice',
      choice: 'economy_purchasing_power',
      probabilities: { economy_purchasing_power: 0.8, immigration: 0.15, other: 0.05 },
      confidence: 0.8,
    },
  },
  usage: { total_input_tokens: 812, total_output_tokens: 0, total_tokens: 812 },
});
assert.equal(normalized.model, 'gemini-decision-1');
assert.equal(normalized.usage.input_tokens, 812);
assert.equal(normalized.usage.output_tokens, 0);
assert.ok((normalized.answers.election_related.noul ?? 0) >= 0.4);
assert.equal(normalized.answers.topic.choice, 'economy_purchasing_power');

console.log('adapter contract check: ok');
console.log('endpoint:', GEMINI_DECISIONS_ENDPOINT);

if (process.argv.includes('--live')) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is required for --live');
  const result = await runGeminiDecision(
    { GEMINI_API_KEY: apiKey },
    {
      title: 'Jordan Bardella critique le budget 2027',
      excerpt: 'Le RN dénonce la trajectoire des finances publiques.',
    },
    questions,
  );
  console.log('live response:', JSON.stringify(result, null, 2));
  assert.ok((result.answers.election_related?.noul ?? 0) > 0.5, 'expected election-related');
}
