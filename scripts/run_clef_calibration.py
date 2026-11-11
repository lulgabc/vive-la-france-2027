#!/usr/bin/env python3
"""Run a binary/choice decision model over the real-text Jev evaluation set.

Default model is Cloudflare's Clef-flash, a Jev-compatible decision model.
Jev itself can be used with `--model typesafe/jev` once the account has balance.
The script never prints the OAuth token.
"""
from __future__ import annotations

import argparse
import concurrent.futures
import json
import math
import re
import urllib.error
import urllib.request
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EVAL = ROOT / 'apps/pipeline/src/judge/jev-eval-real-fr.json'
TOKEN_FILE = Path.home() / 'Library/Preferences/.wrangler/config/default.toml'
ACCOUNT = '735697da615cf58f5c2afab87f844d90'
TOPICS = [
    'economy_purchasing_power', 'immigration_security', 'pensions_social', 'health',
    'education', 'climate_energy', 'europe_foreign', 'institutions_democracy',
    'justice', 'culture_identity', 'local_overseas', 'other',
]
TOPIC_LABELS = {
    'economy_purchasing_power': 'Économie, pouvoir d’achat, salaires, impôts, budget, emploi',
    'immigration_security': 'Immigration, sécurité, police, délinquance, frontières, asile',
    'pensions_social': 'Retraites, protection sociale, RSA, assurance chômage, syndicats',
    'health': 'Santé, hôpitaux, médecins, médicaments, urgences, vaccination',
    'education': 'École, enseignants, université, bac, élèves, cantines',
    'climate_energy': 'Climat, écologie, énergie, nucléaire, éolien, sécheresse, inondations',
    'europe_foreign': 'Europe, diplomatie, Ukraine, Russie, OTAN, Moyen-Orient, Afrique',
    'institutions_democracy': 'Institutions, élections, campagne, candidats, sondages, parlement, constitution',
    'justice': 'Justice, tribunaux, procès, juges, condamnations, enquêtes',
    'culture_identity': 'Culture, identité, laïcité, religion, racisme, patrimoine, médias',
    'local_overseas': 'Collectivités, régions, départements, communes, outre-mer, Corse',
    'other': 'Autre sujet non couvert par les catégories précédentes',
}


def read_token() -> str:
    text = TOKEN_FILE.read_text()
    match = re.search(r'oauth_token\s*=\s*"([^"]+)"', text)
    if not match:
        raise SystemExit('No wrangler OAuth token found. Run `npx wrangler login`.')
    return match.group(1)


def call_model(
    token: str,
    model: str,
    item: dict,
    gateway: str | None = None,
    provider: str = 'cloudflare',
    retries: int = 3,
) -> dict:
    questions = {
                'election_related': {
                    'type': 'noul',
                    'instructions': (
                        'Does this item relate to the 2027 French presidential election, including a '
                        'candidate’s campaign statements and positions? Foreign-language posts about the '
                        'French election count as yes.'
                    ),
                    'criteria': {
                        'true': 'About the 2027 French presidential election, a candidacy, a campaign meeting, a candidate’s program, a poll, a parrainage, or a candidate’s campaign statement/position on a policy or foreign-affairs issue.',
                        'false': 'Mentions a politician only incidentally, is about another election or country, or is personal/entertainment news.',
                    },
                },
                'topic': {
                    'type': 'choice',
                    'instructions': 'What is the single dominant policy topic of this item?',
                    'criteria': TOPIC_LABELS,
                },
    }
    if provider == 'typesafe':
        payload = {
            'model': model,
            'state': {'title': item['title'], 'excerpt': item['excerpt']},
            'questions': questions,
        }
        url = 'https://api.typesafe.ai/v1/systemone'
        headers = {'Authorization': f'Bearer {token}', 'content-type': 'application/json'}
    else:
        payload = {'model': model, 'input': {'state': {'title': item['title'], 'excerpt': item['excerpt']}, 'questions': questions}}
        url = f'https://api.cloudflare.com/client/v4/accounts/{ACCOUNT}/ai/run'
        headers = {'Authorization': f'Bearer {token}', 'content-type': 'application/json'}
        if gateway:
            headers['cf-aig-gateway-id'] = gateway
    body = json.dumps(payload).encode()
    for attempt in range(retries):
        req = urllib.request.Request(url, data=body, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=60) as response:
                data = json.loads(response.read().decode())
            result = data.get('result') or data
            answers = result.get('answers') or {}
            return {
                'ok': True,
                'model': result.get('model') or model,
                'election_probability': float(answers.get('election_related', {}).get('noul', 0)),
                'topic': answers.get('topic', {}).get('choice', 'other'),
                'topic_confidence': float(answers.get('topic', {}).get('confidence', 0)),
                'usage': result.get('usage') or {},
            }
        except urllib.error.HTTPError as error:
            text = error.read().decode()
            if error.code in (429, 500, 502, 503, 504) and attempt + 1 < retries:
                continue
            return {'ok': False, 'error': f'HTTP {error.code}: {text[:500]}'}
        except Exception as error:  # noqa: BLE001 - network errors are data here
            if attempt + 1 < retries:
                continue
            return {'ok': False, 'error': f'{type(error).__name__}: {error}'}
    return {'ok': False, 'error': 'retries exhausted'}


def pct(value: float) -> float:
    return round(value, 3)


def calibration(predictions: list[dict], samples: list[dict]) -> dict:
    rows = [
        (max(0.0, min(1.0, p['election_probability'])), 1 if s['election_related'] else 0)
        for p, s in zip(predictions, samples)
    ]
    if not rows:
        return {}
    brier = sum((p - y) ** 2 for p, y in rows) / len(rows)
    bins = [{'bin': f'{i/10:.1f}-{(i+1)/10:.1f}', 'count': 0, 'sum_p': 0.0, 'pos': 0} for i in range(10)]
    for p, y in rows:
        b = min(9, int(p * 10))
        bins[b]['count'] += 1
        bins[b]['sum_p'] += p
        bins[b]['pos'] += y
    ece = 0.0
    for b in bins:
        if b['count']:
            ece += (b['count'] / len(rows)) * abs(b['sum_p'] / b['count'] - b['pos'] / b['count'])
    return {
        'samples': len(rows),
        'brier': pct(brier),
        'ece': pct(ece),
        'bins': [
            {
                'bin': b['bin'],
                'count': b['count'],
                'avg_probability': pct(b['sum_p'] / b['count']) if b['count'] else None,
                'accuracy': pct(b['pos'] / b['count']) if b['count'] else None,
            }
            for b in bins
        ],
    }


def metrics(samples: list[dict], predictions: list[dict]) -> dict:
    n = len(samples)
    election_correct = sum(p['election_related'] == s['election_related'] for p, s in zip(predictions, samples))
    topic_correct = sum(p['topic'] == s['topic'] for p, s in zip(predictions, samples))
    tp = sum(p['election_related'] and s['election_related'] for p, s in zip(predictions, samples))
    fp = sum(p['election_related'] and not s['election_related'] for p, s in zip(predictions, samples))
    fn = sum(not p['election_related'] and s['election_related'] for p, s in zip(predictions, samples))
    per_topic = []
    for topic in TOPICS:
        idx = [i for i, s in enumerate(samples) if s['topic'] == topic]
        if not idx:
            continue
        correct = sum(predictions[i]['topic'] == topic for i in idx)
        per_topic.append({'topic': topic, 'samples': len(idx), 'accuracy': pct(correct / len(idx))})
    confusion = {}
    for s, p in zip(samples, predictions):
        confusion.setdefault(s['topic'], {})
        confusion[s['topic']][p['topic']] = confusion[s['topic']].get(p['topic'], 0) + 1
    mismatches = [
        {
            'id': s['id'],
            'title': s['title'][:220],
            'expected_election': s['election_related'],
            'predicted_election': p['election_related'],
            'expected_topic': s['topic'],
            'predicted_topic': p['topic'],
        }
        for s, p in zip(samples, predictions)
        if p['election_related'] != s['election_related'] or p['topic'] != s['topic']
    ]
    return {
        'samples': n,
        'election_accuracy': pct(election_correct / n),
        'election_precision': pct(tp / max(1, tp + fp)),
        'election_recall': pct(tp / max(1, tp + fn)),
        'topic_accuracy': pct(topic_correct / n),
        'topic_macro_accuracy': pct(sum(t['accuracy'] for t in per_topic) / max(1, len(per_topic))),
        'per_topic': per_topic,
        'confusion': confusion,
        'calibration': calibration(predictions, samples),
        'mismatches': mismatches[:100],
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--model', default='@cf/cloudflare/clef-flash')
    parser.add_argument('--workers', type=int, default=6)
    parser.add_argument('--gateway', default=None, help='AI Gateway ID for Unified Billing')
    parser.add_argument('--provider', choices=['cloudflare', 'typesafe'], default='cloudflare')
    parser.add_argument('--limit', type=int, default=360)
    parser.add_argument('--threshold', type=float, default=0.4)
    args = parser.parse_args()

    samples = json.loads(EVAL.read_text())[: args.limit]
    token = read_token() if args.provider == 'cloudflare' else __import__('os').environ.get('TYPESAFE_API_KEY', '')
    if not token:
        raise SystemExit('Set TYPESAFE_API_KEY for --provider typesafe, or run `npx wrangler login` for Cloudflare.')
    print(f'provider={args.provider} model={args.model} samples={len(samples)} workers={args.workers} gateway={args.gateway or "none"}')

    results: list[dict | None] = [None] * len(samples)
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        future_map = {pool.submit(call_model, token, args.model, item, args.gateway, args.provider): i for i, item in enumerate(samples)}
        done = 0
        for future in concurrent.futures.as_completed(future_map):
            idx = future_map[future]
            results[idx] = future.result()
            done += 1
            if done % 40 == 0:
                print(f'  {done}/{len(samples)}')

    errors = [r for r in results if not r or not r.get('ok')]
    good = [r for r in results if r and r.get('ok')]
    if errors:
        print(f'errors={len(errors)} first={errors[0]}')
    predictions = [
        {
            'election_related': (r['election_probability'] >= args.threshold) if r and r.get('ok') else False,
            'topic': r['topic'] if r and r.get('ok') else 'other',
            'election_probability': r['election_probability'] if r and r.get('ok') else 0.0,
            'topic_confidence': r['topic_confidence'] if r and r.get('ok') else 0.0,
        }
        for r in results
    ]
    report = {
        'generated_at': datetime.now(timezone.utc).isoformat(),
        'model_requested': args.model,
        'model_returned': Counter(r['model'] for r in good).most_common(1)[0][0] if good else None,
        'samples': len(samples),
        'errors': len(errors),
        'error_examples': errors[:3],
        'metrics': metrics(samples, predictions),
        'usage': {
            'input_tokens': sum(int((r.get('usage') or {}).get('input_tokens', 0)) for r in good),
            'output_tokens': sum(int((r.get('usage') or {}).get('output_tokens', 0)) for r in good),
        },
        'predictions': [
            {
                'id': s['id'],
                'title': s['title'][:220],
                'expected_election': s['election_related'],
                'expected_topic': s['topic'],
                'election_probability': p['election_probability'],
                'predicted_election': p['election_related'],
                'predicted_topic': p['topic'],
                'topic_confidence': p['topic_confidence'],
            }
            for s, p in zip(samples, predictions)
        ],
    }
    safe_model = args.model.replace('@cf/cloudflare/', '').replace('/', '-').replace(':', '-')
    out = ROOT / 'data' / f"calibration-{safe_model}-{datetime.now().strftime('%Y-%m-%d')}.json"
    out.write_text(json.dumps(report, ensure_ascii=False, indent=1))
    m = report['metrics']
    print(f"election accuracy={m['election_accuracy']} precision={m['election_precision']} recall={m['election_recall']}")
    print(f"topic accuracy={m['topic_accuracy']} macro={m['topic_macro_accuracy']}")
    print(f"brier={m['calibration']['brier']} ece={m['calibration']['ece']}")
    print(f'wrote {out}')


if __name__ == '__main__':
    main()
