import { TOPICS } from '@vlf/domain';
import { storeJudgment } from '../lib/db';
import type { Env } from '../types';
import { classifyByRules } from './rules';
import { runJevModel } from './provider';
import { publishLive } from '../live/publish';

export const QUESTIONS = {
  election_related: {
    type: 'noul',
    instructions:
      'Does this item relate to the 2027 French presidential election, including a candidate’s campaign statements and positions? Foreign-language posts about the French election count as yes.',
    criteria: {
      true: 'About the 2027 French presidential election, a candidacy, a campaign meeting, a candidate’s program, a poll, a parrainage, or a candidate’s campaign statement/position on a policy or foreign-affairs issue.',
      false: 'Mentions a politician only incidentally, is about another election or country, or is personal/entertainment news.',
    },
  },
  topic: {
    type: 'choice',
    instructions: 'What is the single dominant policy topic of this item?',
    criteria: Object.fromEntries(TOPICS.map((topic) => [topic.id, topic.en])),
  },
} as const;

export interface JudgeResult {
  electionRelated: boolean;
  electionProbability: number;
  topic: string;
  topicConfidence: number;
  model: string;
}

function fallback(article: { title: string; excerpt?: string | null }): JudgeResult {
  const result = classifyByRules(article.title, article.excerpt ?? '');
  return { ...result, model: 'fallback-keywords' };
}

async function persistFallback(
  env: Env,
  article: { id: string },
  result: JudgeResult,
): Promise<void> {
  await storeJudgment(env, {
    subjectType: 'article',
    subjectId: article.id,
    model: result.model,
    question: 'election_related',
    answerType: 'noul',
    value: String(result.electionRelated),
    probability: result.electionProbability,
    confidence: result.electionProbability,
  });
  await storeJudgment(env, {
    subjectType: 'article',
    subjectId: article.id,
    model: result.model,
    question: 'topic',
    answerType: 'choice',
    value: result.topic,
    probability: result.topicConfidence,
    confidence: result.topicConfidence,
  });
}

export async function resetFallbackJudgments(env: Env): Promise<number> {
  const result = await env.DB.prepare(
    `DELETE FROM judgments WHERE model = 'fallback-keywords' AND subject_type = 'article'`,
  ).run();
  return result.meta.changes ?? 0;
}

export async function backfillJudgments(
  env: Env,
  limit = 200,
  force = false,
): Promise<number> {
  const query = force
    ? `SELECT a.id, a.title, a.excerpt, a.lang, a.source_id
       FROM articles a
       ORDER BY a.published_at DESC
       LIMIT ?`
    : `SELECT a.id, a.title, a.excerpt, a.lang, a.source_id
       FROM articles a
       LEFT JOIN judgments j
         ON j.subject_type = 'article' AND j.subject_id = a.id AND j.question = 'topic'
       WHERE j.id IS NULL
       ORDER BY a.published_at DESC
       LIMIT ?`;

  const { results } = await env.DB.prepare(query)
    .bind(limit)
    .all<{ id: string; title: string; excerpt: string | null; lang: string; source_id: string }>();

  let count = 0;
  for (const article of results) {
    try {
      await judgeArticle(env, article);
      count += 1;
    } catch (error) {
      console.error(`backfill failed for ${article.id}`, error);
    }
  }
  return count;
}

export async function judgeArticle(
  env: Env,
  article: { id: string; title: string; excerpt?: string | null; lang: string; source_id?: string },
): Promise<JudgeResult> {
  if (!env.AI && !env.TYPESAFE_API_KEY) {
    const result = fallback(article);
    await persistFallback(env, article, result);
    return result;
  }

  try {
    const response = await runJevModel(
      env,
      {
        title: article.title,
        excerpt: article.excerpt ?? '',
        lang: article.lang,
        source: article.source_id ?? 'unknown',
      },
      QUESTIONS,
    );

    const answers = response.answers ?? {};
    const election = answers.election_related;
    const topic = answers.topic;
    const model = response.model ?? 'typesafe/jev';

    const result: JudgeResult = {
      electionRelated: (election?.noul ?? 0) >= Number(env.JEV_ELECTION_THRESHOLD ?? 0.4),
      electionProbability: election?.noul ?? 0,
      topic: topic?.choice ?? 'other',
      topicConfidence: topic?.confidence ?? 0,
      model,
    };

    await storeJudgment(env, {
      subjectType: 'article',
      subjectId: article.id,
      model,
      question: 'election_related',
      answerType: 'noul',
      value: String(result.electionRelated),
      probability: result.electionProbability,
      confidence: election?.confidence,
      usage: response.usage,
    });

    await storeJudgment(env, {
      subjectType: 'article',
      subjectId: article.id,
      model,
      question: 'topic',
      answerType: 'choice',
      value: result.topic,
      probability: topic?.probabilities?.[result.topic],
      confidence: result.topicConfidence,
      usage: response.usage,
    });

    await publishLive(env, { type: 'judgment', articleId: article.id, topic: result.topic, election: result.electionRelated });
    return result;
  } catch (error) {
    console.error('jev judge failed, using rules', error);
    const result = fallback(article);
    await persistFallback(env, article, result);
    return result;
  }
}
