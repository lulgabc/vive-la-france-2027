import { TOPICS } from '@vlf/domain';
import { classifyByRules } from './rules';
import { runJevModel } from './provider';
import type { Env } from '../types';
import syntheticData from './jev-eval-fr.json';
import realData from './jev-eval-real-fr.json';

export interface EvalSample {
  id: string;
  title: string;
  excerpt: string;
  election_related: boolean;
  topic: string;
  synthetic: boolean;
  label_source: string;
  label_confidence?: number;
  source?: string | null;
  published_at?: string | null;
}

const SYNTHETIC = syntheticData as EvalSample[];
const REAL = realData as EvalSample[];
const TOPIC_IDS = TOPICS.map((topic) => topic.id);

type Prediction = {
  election_related: boolean;
  topic: string;
  election_probability?: number;
  topic_confidence?: number;
};
type EvalDataset = 'real' | 'synthetic' | 'all';

function pct(value: number): number {
  return Number(value.toFixed(3));
}

function metrics(samples: EvalSample[], predictions: Prediction[], latencyMs?: number) {
  const electionCorrect = predictions.filter(
    (prediction, index) => prediction.election_related === samples[index].election_related,
  ).length;
  const topicCorrect = predictions.filter(
    (prediction, index) => prediction.topic === samples[index].topic,
  ).length;

  const perTopic = TOPIC_IDS.map((topic) => {
    const indexes = samples
      .map((sample, index) => (sample.topic === topic ? index : -1))
      .filter((index) => index >= 0);
    const correct = indexes.filter((index) => predictions[index].topic === topic).length;
    return {
      topic,
      samples: indexes.length,
      accuracy: indexes.length > 0 ? pct(correct / indexes.length) : null,
    };
  }).filter((row) => row.samples > 0);

  const macroTopic =
    perTopic.reduce((sum, row) => sum + (row.accuracy ?? 0), 0) / Math.max(1, perTopic.length);

  const confusion: Record<string, Record<string, number>> = {};
  for (const sample of samples) confusion[sample.topic] ??= {};
  predictions.forEach((prediction, index) => {
    const expected = samples[index].topic;
    confusion[expected][prediction.topic] = (confusion[expected][prediction.topic] ?? 0) + 1;
  });

  const calibrationRows = predictions
    .map((prediction, index) => ({
      p: Math.max(0, Math.min(1, prediction.election_probability ?? 0)),
      y: samples[index].election_related ? 1 : 0,
    }))
    .filter((row) => Number.isFinite(row.p));
  const calibration =
    calibrationRows.length > 0
      ? (() => {
          const bins = Array.from({ length: 10 }, (_, index) => ({
            bin: `${index / 10}-${(index + 1) / 10}`,
            count: 0,
            sum_prob: 0,
            positives: 0,
          }));
          for (const row of calibrationRows) {
            const index = Math.min(9, Math.floor(row.p * 10));
            bins[index].count += 1;
            bins[index].sum_prob += row.p;
            bins[index].positives += row.y;
          }
          const brier =
            calibrationRows.reduce((sum, row) => sum + (row.p - row.y) ** 2, 0) /
            calibrationRows.length;
          const ece =
            bins.reduce((sum, bin) => {
              if (bin.count === 0) return sum;
              return sum + (bin.count / calibrationRows.length) * Math.abs(bin.sum_prob / bin.count - bin.positives / bin.count);
            }, 0);
          return {
            samples: calibrationRows.length,
            brier: pct(brier),
            ece: pct(ece),
            bins: bins.map((bin) => ({
              bin: bin.bin,
              count: bin.count,
              avg_probability: bin.count ? pct(bin.sum_prob / bin.count) : null,
              accuracy: bin.count ? pct(bin.positives / bin.count) : null,
            })),
          };
        })()
      : null;

  const tp = predictions.filter(
    (prediction, index) => prediction.election_related && samples[index].election_related,
  ).length;
  const fp = predictions.filter(
    (prediction, index) => prediction.election_related && !samples[index].election_related,
  ).length;
  const fn = predictions.filter(
    (prediction, index) => !prediction.election_related && samples[index].election_related,
  ).length;

  const mismatches = samples
    .map((sample, index) => ({
      id: sample.id,
      title: sample.title,
      excerpt: sample.excerpt,
      expected_election: sample.election_related,
      predicted_election: predictions[index].election_related,
      expected_topic: sample.topic,
      predicted_topic: predictions[index].topic,
      label_source: sample.label_source,
    }))
    .filter(
      (row) =>
        row.expected_election !== row.predicted_election ||
        row.expected_topic !== row.predicted_topic,
    )
    .slice(0, 200);

  return {
    samples: predictions.length,
    election_accuracy: pct(electionCorrect / Math.max(1, predictions.length)),
    election_precision: pct(tp / Math.max(1, tp + fp)),
    election_recall: pct(tp / Math.max(1, tp + fn)),
    topic_accuracy: pct(topicCorrect / Math.max(1, predictions.length)),
    topic_macro_accuracy: pct(macroTopic),
    per_topic: perTopic,
    confusion,
    calibration,
    mismatches,
    items: samples.map((sample, index) => ({
      id: sample.id,
      title: sample.title,
      excerpt: sample.excerpt,
      expected_election: sample.election_related,
      predicted_election: predictions[index].election_related,
      expected_topic: sample.topic,
      predicted_topic: predictions[index].topic,
      label_source: sample.label_source,
    })),
    latency_ms: latencyMs ?? null,
  };
}

function runRules(samples: EvalSample[]): Prediction[] {
  return samples.map((sample) => {
    const result = classifyByRules(sample.title, sample.excerpt);
    return {
      election_related: result.electionRelated,
      topic: result.topic,
      election_probability: result.electionProbability,
      topic_confidence: result.topicConfidence,
    };
  });
}

async function runJev(env: Env, samples: EvalSample[], model: string, concurrency = 4) {
  const predictions: Prediction[] = [];
  const threshold = Number(env.JEV_ELECTION_THRESHOLD ?? 0.4);
  const models = new Set<string>();
  const started = Date.now();
  for (let offset = 0; offset < samples.length; offset += concurrency) {
    const batch = samples.slice(offset, offset + concurrency);
    const results = await Promise.all(
      batch.map(async (sample) => {
        const response = await runJevModel(
          env,
          { title: sample.title, excerpt: sample.excerpt },
          {
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
          },
        );
        if (response.model) models.add(response.model);
        const answers = response.answers ?? {};
        return {
          election_related: (answers.election_related?.noul ?? 0) >= threshold,
          topic: answers.topic?.choice ?? 'other',
          election_probability: answers.election_related?.noul ?? 0,
          topic_confidence: answers.topic?.confidence ?? 0,
        };
      }),
    );
    predictions.push(...results);
  }
  return { predictions, latencyMs: Date.now() - started, models: [...models] };
}

export async function evaluateJev(
  env: Env,
  options: { limit?: number; model?: string; dataset?: EvalDataset } = {},
) {
  const dataset = options.dataset ?? 'real';
  const source = dataset === 'synthetic' ? SYNTHETIC : dataset === 'all' ? [...REAL, ...SYNTHETIC] : REAL;
  const limit = Math.min(Math.max(options.limit ?? 360, 1), source.length);
  const samples = source.slice(0, limit);

  const datasetInfo = {
    selected: dataset,
    evaluated: samples.length,
    real: REAL.length,
    synthetic: SYNTHETIC.length,
    real_label_source: 'real text; rubric labels plus 39 agent-human-review overrides',
    human_reviewed: REAL.filter((sample) => sample.label_source === 'agent-human-review').length,
    human_smoke: SYNTHETIC.filter((sample) => !sample.synthetic).length,
    note: 'The primary set is now real French text. The 348 template items are retained only as a synthetic regression set.',
  };

  const rules = metrics(samples, runRules(samples));
  const rulesSynthetic = metrics(SYNTHETIC, runRules(SYNTHETIC));

  if (!env.AI && !env.TYPESAFE_API_KEY) {
    return {
      model: 'fallback-keywords',
      dataset: datasetInfo,
      rules,
      rules_synthetic: rulesSynthetic,
      jev: null,
      blocked: 'No Jev provider configured. Set TYPESAFE_API_KEY or deploy with the Workers AI binding.',
    };
  }

  const model = options.model ?? 'typesafe/jev';
  try {
    const { predictions, latencyMs, models } = await runJev(env, samples, model);
    return {
      model,
      model_returned: models,
      dataset: datasetInfo,
      rules,
      rules_synthetic: rulesSynthetic,
      jev: metrics(samples, predictions, latencyMs),
      blocked: null,
    };
  } catch (error) {
    return {
      model,
      dataset: datasetInfo,
      rules,
      rules_synthetic: rulesSynthetic,
      jev: null,
      blocked: error instanceof Error ? error.message : String(error),
    };
  }
}
