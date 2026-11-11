"""Build a real-text French silver evaluation set from collected articles/posts.

This replaces the template-generated items with real French text. Labels are
produced by an explicit rubric and spot-checked by the agent; they are not
independent human annotations. The file records `label_source` so reports can
separate it from the 12 human smoke samples.
"""
from __future__ import annotations

import json
import random
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ARTICLES = ROOT / 'data/jev-source-articles.json'
BLUESKY = ROOT / 'data/jev-source-bluesky.json'
OUT = ROOT / 'apps/pipeline/src/judge/jev-eval-real-fr.json'
OVERRIDES = ROOT / 'data/jev-label-overrides.json'
random.seed(20261110)

CANDIDATES = [
    'Marine Le Pen', 'Jordan Bardella', 'Jean-Luc Mélenchon', 'Gabriel Attal',
    'Édouard Philippe', 'Raphaël Glucksmann', 'Bruno Retailleau', 'Xavier Bertrand',
    'Éric Zemmour', 'Nicolas Dupont-Aignan', 'François Bayrou', 'Fabien Roussel',
    'Yannick Jadot', 'Laurent Wauquiez', 'David Lisnard', 'Marine Tondelier',
    'Nathalie Arthaud', 'Dominique de Villepin', 'François Hollande', 'François Ruffin',
    'Olivier Faure', 'Sarah Knafo', 'Teddy Riner',
]
PARTIES = [
    'Rassemblement national', 'La France insoumise', 'Renaissance', 'Les Républicains',
    'Parti socialiste', 'Europe Écologie Les Verts', 'Parti communiste', 'Reconquête',
    'Horizons', 'MoDem', 'Debout la France',
]
STRONG = [
    'présidentielle 2027', 'élection présidentielle', 'campagne présidentielle',
    'premier tour', 'second tour', 'sondage 2027', 'parrainage', 'investiture présidentielle',
]
CONTEXT = [
    'candidat', 'candidate', 'campagne', 'programme', 'sondage', 'meeting', 'investiture',
    'primaire', 'parrainage', 'élection', 'scrutin', 'débat', 'ralliement', 'soutien',
]
TOPIC_KEYWORDS = {
    'economy_purchasing_power': ['pouvoir d achat', 'pouvoir d’achat', 'inflation', 'smic', 'salaire', 'prix', 'budget', 'fiscal', 'impôt', 'impot', 'taxe', 'dette', 'croissance', 'chômage', 'chomage', 'emploi', 'superprofits', 'tva'],
    'immigration_security': ['immigration', 'immigré', 'immigre', 'sécurité', 'securite', 'insécurité', 'délinquance', 'delinquance', 'police', 'gendarmerie', 'terrorisme', 'asile', 'frontière', 'frontiere', 'prison', 'oqtf', 'trafi'],
    'pensions_social': ['retraite', 'pension', 'social', 'sécurité sociale', 'rsa', 'aide sociale', 'ehpad', 'assurance chômage', 'syndicat', 'grève', 'greve', 'manifestation'],
    'health': ['santé', 'sante', 'médecin', 'medecin', 'hôpital', 'hopital', 'soignant', 'médicament', 'medicament', 'mutuelle', 'urgences', 'vaccin'],
    'education': ['école', 'ecole', 'éducation', 'education', 'enseignant', 'université', 'universite', 'bac', 'élève', 'eleve', 'lycée', 'lycee', 'cantine'],
    'climate_energy': ['climat', 'écologie', 'ecologie', 'environnement', 'énergie', 'energie', 'nucléaire', 'nucleaire', 'éolien', 'eolien', 'solaire', 'carbone', 'biodiversité', 'sécheresse', 'secheresse', 'inondation', 'tempête', 'tempete', 'gaz'],
    'europe_foreign': ['europe', 'union européenne', 'bruxelles', 'international', 'étranger', 'etranger', 'diplomatie', 'ukraine', 'russie', 'otan', 'moyen orient', 'gaza', 'israël', 'israel', 'afrique', 'chine', 'trump'],
    'institutions_democracy': ['institutions', 'démocratie', 'democratie', 'constitution', 'assemblée', 'assemblee', 'sénat', 'senat', 'gouvernement', 'premier ministre', 'parlement', 'référendum', 'referendum', '49.3', 'censure', 'sondage', 'candidature', 'campagne', 'débat', 'investiture', 'parrainage'],
    'justice': ['justice', 'tribunal', 'procès', 'proces', 'juge', 'avocat', 'condamnation', 'garde à vue', 'garde a vue', 'plainte', 'enquête', 'enquete'],
    'culture_identity': ['culture', 'identité', 'identite', 'laïcité', 'laicite', 'religion', 'islam', 'racisme', 'antisémitisme', 'antisemitisme', 'mémoriel', 'memoriel', 'musée', 'musee', 'festival', 'patrimoine'],
    'local_overseas': ['outre mer', 'outre-mer', 'région', 'region', 'département', 'departement', 'commune', 'maire', 'territoires', 'corse', 'bretagne', 'normandie', 'mayotte', 'guadeloupe', 'martinique', 'réunion', 'reunion'],
}
HARD_NEGATIVE = ['miss france', 'campagne de vaccination', 'campagne de fouilles', 'élection du bureau', 'recrutement', 'ghosting', 'sport', 'judo', 'cyclisme', 'météo', 'meteo']


def norm(text: str) -> str:
    return re.sub(r'\s+', ' ', text.lower().replace('’', "'"))


def has(text: str, words: list[str]) -> bool:
    return any(word.lower() in text for word in words)


def election_label(text: str) -> tuple[bool, float]:
    lower = norm(text)
    if has(lower, HARD_NEGATIVE) and not has(lower, ['présidentielle 2027', 'élection présidentielle']):
        return False, 0.75
    if has(lower, STRONG):
        return True, 0.9
    candidate = has(lower, CANDIDATES)
    party = has(lower, PARTIES)
    context = has(lower, CONTEXT)
    if candidate and context:
        return True, 0.8
    if party and (has(lower, ['candidat', 'campagne', 'présidentielle', 'sondage'])):
        return True, 0.7
    return False, 0.65


def topic_label(text: str, election_related: bool) -> tuple[str, int]:
    lower = norm(text)
    scores = {}
    for topic, words in TOPIC_KEYWORDS.items():
        score = sum(1 for word in words if word in lower)
        if score:
            scores[topic] = score
    if not scores:
        return 'other', 0
    best = max(scores, key=lambda key: scores[key])
    return best, scores[best]


def main() -> None:
    overrides = json.loads(OVERRIDES.read_text())
    articles = json.loads(ARTICLES.read_text())
    bluesky = json.loads(BLUESKY.read_text())
    items = []
    for article in articles:
        title = article.get('title') or ''
        excerpt = article.get('excerpt') or ''
        election, confidence = election_label(f'{title} {excerpt}')
        topic, hits = topic_label(f'{title} {excerpt}', election)
        items.append({
            'id': f"art-{article['id']}",
            'title': title,
            'excerpt': excerpt[:400],
            'election_related': election,
            'topic': topic,
            'synthetic': False,
            'label_source': 'agent-silver-rubric',
            'label_confidence': confidence,
            'source': article.get('source_id'),
            'published_at': article.get('published_at'),
        })
    # Add enough Bluesky posts to reach 360 real items.
    for post in bluesky[: max(0, 360 - len(items))]:
        text = post.get('text') or ''
        title = text.split('\n')[0][:220]
        excerpt = text[:400]
        election, confidence = election_label(text)
        topic, hits = topic_label(text, election)
        items.append({
            'id': f"bsky-{post['id']}",
            'title': title,
            'excerpt': excerpt,
            'election_related': election,
            'topic': topic,
            'synthetic': False,
            'label_source': 'agent-silver-rubric',
            'label_confidence': confidence,
            'source': 'bluesky',
            'published_at': post.get('created_at'),
        })
    for item in items:
        override = overrides.get(item['id'])
        if override:
            item['election_related'] = override.get('election_related', item['election_related'])
            item['topic'] = override.get('topic', item['topic'])
            item['label_source'] = 'agent-human-review'
            item['reviewed'] = True
    random.shuffle(items)
    OUT.write_text(json.dumps(items, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    print(f'wrote {len(items)} real-text items to {OUT}')
    from collections import Counter
    print('election', Counter(x['election_related'] for x in items))
    print('topics', Counter(x['topic'] for x in items))
    print('sources', Counter(x['source'] for x in items).most_common(8))


if __name__ == '__main__':
    main()
