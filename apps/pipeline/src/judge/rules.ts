import { TOPICS } from '@vlf/domain';

const TOPIC_KEYWORDS: Record<string, string[]> = {
  economy_purchasing_power: [
    'pouvoir d achat',
    'pouvoir d’achat',
    'inflation',
    'smic',
    'salaire',
    'salaires',
    'prix',
    'budget',
    'fiscal',
    'impot',
    'impots',
    'taxe',
    'dette',
    'croissance',
    'chomage',
    'emploi',
    'retraite',
  ],
  immigration_security: [
    'immigration',
    'immigre',
    'immigres',
    'securite',
    'insecurite',
    'delinquance',
    'police',
    'gendarmerie',
    'terrorisme',
    'asile',
    'frontiere',
    'frontieres',
    'prison',
  ],
  pensions_social: [
    'retraite',
    'retraites',
    'pension',
    'pensions',
    'social',
    'securite sociale',
    'assurance chomage',
    'rsa',
    'aide sociale',
    'hopital',
    'ehpad',
  ],
  health: ['sante', 'medecin', 'medecins', 'hopital', 'hôpital', 'soignant', 'soignants', 'medicament', 'mutuelle', 'urgences'],
  education: ['ecole', 'école', 'education', 'éducation', 'enseignant', 'enseignants', 'universite', 'université', 'bac', 'eleve', 'eleves'],
  climate_energy: [
    'climat',
    'ecologie',
    'écologie',
    'environnement',
    'energie',
    'énergie',
    'nucléaire',
    'nucleaire',
    'eolien',
    'solaire',
    'carbone',
    'biodiversite',
    'secheresse',
    'inondation',
  ],
  europe_foreign: [
    'europe',
    'union europeenne',
    'bruxelles',
    'international',
    'etranger',
    'diplomatie',
    'ukraine',
    'russie',
    'otan',
    'moyen orient',
    'gaza',
    'israel',
  ],
  institutions_democracy: [
    'institutions',
    'democratie',
    'démocratie',
    'constitution',
    'assemblee',
    'assemblée',
    'senat',
    'sénat',
    'gouvernement',
    'premier ministre',
    'parlement',
    'referendum',
    'référendum',
    '49.3',
    'censure',
  ],
  justice: ['justice', 'tribunal', 'procès', 'proces', 'juge', 'juges', 'avocat', 'condamnation', 'garde a vue', 'garde à vue'],
  culture_identity: ['culture', 'identite', 'identité', 'laicite', 'laïcité', 'religion', 'islam', 'racisme', 'antisemitisme', 'antisémitisme', 'memoriel', 'mémoriel'],
  local_overseas: ['outre mer', 'outre-mer', 'region', 'région', 'departement', 'département', 'commune', 'maire', 'territoires', 'corse', 'bretagne', 'normandie'],
};

// A candidate or party name alone is not enough: it must co-occur with
// election context. This is the main precision guard for real news text.
const ELECTION_STRONG = [
  'presidentielle',
  'election presidentielle',
  'campagne presidentielle',
  'premier tour',
  'second tour',
  'sondage presidentielle',
  'sondages presidentielle',
  'parrainage presidentielle',
  'investiture presidentielle',
  'presidential election',
  'presidential campaign',
  'elecciones presidenciales',
  'campana presidencial',
  'prasidentschaftswahl',
];

const ELECTION_ENTITIES = [
  'marine le pen',
  'le pen',
  'bardella',
  'melenchon',
  'attal',
  'philippe',
  'glucksmann',
  'retailleau',
  'zemmour',
  'dupont aignan',
  'rassemblement national',
  'parti renaissance',
  'la france insoumise',
  'parti socialiste',
  'les republicains',
  'eelv',
  'pcf',
  'parti horizons',
  'teddy riner',
];

const ELECTION_CONTEXT = [
  'campagne',
  'candidat',
  'candidate',
  'candidature',
  'candidacy',
  'programme',
  'sondage',
  'sondages',
  'meeting',
  'investiture',
  'primaire',
  'parrainage',
  'election',
  'elecciones',
  'scrutin',
  'debat',
  'ralliement',
  'soutien',
  'elysee',
  'second tour',
  'premier tour',
  'presidentielle',
  'presidential',
  'campaign',
  'elected president',
  'candidatura',
  'campana',
];

const URL_ONLY = /^(https?:\/\/|www\.|x\.com\/|m\.youtube\.com\/|youtube\.com\/)/i;

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, ' ')
    .replace(/\s+/g, ' ');
}

function matchesKeyword(text: string, keyword: string): boolean {
  const normalized = normalize(keyword);
  if (normalized.length <= 3) {
    return new RegExp(`\\b${normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(text);
  }
  return text.includes(normalized);
}

export function classifyByRules(
  title: string,
  excerpt = '',
): { electionRelated: boolean; electionProbability: number; topic: string; topicConfidence: number } {
  const text = normalize(`${title} ${excerpt}`);
  const compact = text.trim();
  const strongHits = ELECTION_STRONG.filter((keyword) => matchesKeyword(text, keyword)).length;
  const entityHits = ELECTION_ENTITIES.filter((keyword) => matchesKeyword(text, keyword)).length;
  const contextHits = ELECTION_CONTEXT.filter((keyword) => matchesKeyword(text, keyword)).length;
  const isUrlOnly = compact.length < 80 && URL_ONLY.test(compact.replace(/\s+/g, ''));
  const electionRelated = !isUrlOnly && (strongHits > 0 || (entityHits > 0 && contextHits > 0));
  const electionHits = strongHits * 2 + Math.min(entityHits, 1) + Math.min(contextHits, 2);

  let bestTopic = 'other';
  let bestHits = 0;
  for (const topic of TOPICS) {
    if (topic.id === 'other') continue;
    const keywords = TOPIC_KEYWORDS[topic.id] ?? [];
    const hits = keywords.reduce((total, keyword) => total + (matchesKeyword(text, keyword) ? 1 : 0), 0);
    if (hits > bestHits) {
      bestHits = hits;
      bestTopic = topic.id;
    }
  }

  const topicConfidence = bestHits === 0 ? 0.25 : Math.min(0.85, 0.4 + bestHits * 0.12);
  const electionProbability = electionRelated ? Math.min(0.9, 0.55 + electionHits * 0.08) : 0.15;

  return {
    electionRelated,
    electionProbability,
    topic: bestTopic,
    topicConfidence,
  };
}
