"""Generate a reproducible French evaluation set for the Jev judge.

The 12 seed items are the original hand-written smoke samples. The remaining
items are template-generated and explicitly marked synthetic. They are useful
for regression testing and error analysis, not for claiming human-level
accuracy.
"""
from __future__ import annotations

import json
import random
from pathlib import Path

random.seed(20261110)
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'apps/pipeline/src/judge/jev-eval-fr.json'

TOPICS = [
    'economy_purchasing_power', 'immigration_security', 'pensions_social',
    'health', 'education', 'climate_energy', 'europe_foreign',
    'institutions_democracy', 'justice', 'culture_identity',
    'local_overseas', 'other',
]

CANDIDATES = [
    ('Marine Le Pen', 'RN'), ('Jean-Luc Mélenchon', 'LFI'),
    ('Gabriel Attal', 'Renaissance'), ('Édouard Philippe', 'Horizons'),
    ('Raphaël Glucksmann', 'PS'), ('Bruno Retailleau', 'LR'),
    ('Éric Zemmour', 'Reconquête'), ('Marine Tondelier', 'EELV'),
    ('Fabien Roussel', 'PCF'), ('Nicolas Dupont-Aignan', 'DLF'),
    ('David Lisnard', 'LR'), ('Xavier Bertrand', 'LR'),
    ('François Hollande', 'PS'), ('François Ruffin', 'PS'),
]

TOPIC_TEMPLATES = {
    'economy_purchasing_power': [
        ('{who} promet une baisse de la TVA sur les produits de première nécessité', 'Le candidat veut agir sur le pouvoir d’achat et les prix du quotidien.'),
        ('Inflation : les salaires du privé ont progressé moins vite que les prix', 'Les ménages modestes subissent de plein fouet la hausse des prix alimentaires.'),
        ('{who} propose un impôt sur les superprofits pour financer le budget', 'La mesure vise les grandes entreprises et la dette publique.'),
        ('Le SMIC sera revalorisé plus tôt que prévu, annonce le gouvernement', 'L’exécutif veut répondre à la colère sur le pouvoir d’achat.'),
        ('{who} veut conditionner les aides publiques aux salaires', 'Le candidat défend un revenu minimum plus élevé et une réforme fiscale.'),
        ('Chômage : le nombre de demandeurs d’emploi repart à la hausse', 'Les économistes s’inquiètent de la croissance et de l’emploi industriel.'),
        ('{who} présente son plan pour les petites entreprises', 'Le programme prévoit des exonérations de cotisations et un crédit d’impôt.'),
    ],
    'immigration_security': [
        ('{who} veut durcir les conditions du droit d’asile', 'Le candidat propose de réduire l’immigration et de renforcer les frontières.'),
        ('Insécurité : les maires demandent davantage de police de proximité', 'La délinquance et les trafics inquiètent les élus locaux.'),
        ('{who} promet un référendum sur l’immigration', 'Le parti veut modifier la Constitution et les règles du droit du sol.'),
        ('Terrorisme : le gouvernement renforce le plan Vigipirate', 'Les forces de sécurité sont mobilisées après une attaque déjouée.'),
        ('{who} propose de construire 20 000 places de prison', 'Le candidat veut une politique pénale plus ferme contre la délinquance.'),
        ('Police : les syndicats réclament des effectifs et des moyens', 'Les agents dénoncent la charge de travail et le manque de matériel.'),
        ('{who} accuse son adversaire d’avoir favorisé l’immigration clandestine', 'Le débat sur les frontières et l’asile domine la campagne.'),
    ],
    'pensions_social': [
        ('{who} promet d’abroger la réforme des retraites', 'Le candidat veut revenir à 62 ans et ouvrir une concertation avec les syndicats.'),
        ('Retraites : les syndicats appellent à une nouvelle journée de mobilisation', 'La contestation sociale se poursuit contre le report de l’âge de départ.'),
        ('{who} propose une retraite à 60 ans pour les carrières longues', 'Le programme social prévoit aussi une revalorisation des petites pensions.'),
        ('Le RSA sera réformé pour inciter au retour à l’emploi', 'Le gouvernement veut expérimenter un accompagnement renforcé des bénéficiaires.'),
        ('{who} veut augmenter les pensions de 10 %', 'Le candidat cible les retraités modestes et les veuves.'),
        ('Assurance chômage : la réforme entre en vigueur', 'Les règles d’indemnisation changent pour les demandeurs d’emploi.'),
        ('{who} dénonce la baisse des budgets sociaux', 'Le candidat promet un plan contre la pauvreté et les inégalités.'),
    ],
    'health': [
        ('{who} promet 10 000 médecins supplémentaires dans les territoires', 'Le candidat veut lutter contre les déserts médicaux et les urgences saturées.'),
        ('Hôpital : les soignants dénoncent le manque de lits et de personnel', 'Les urgences de plusieurs villes sont en tension cet hiver.'),
        ('{who} propose la création d’un service public de la santé', 'Le programme prévoit de mieux rembourser les médicaments et les mutuelles.'),
        ('Déserts médicaux : les maires réclament des maisons de santé', 'Les habitants doivent parfois parcourir des dizaines de kilomètres pour consulter.'),
        ('{who} veut encadrer les prix des médicaments', 'Le candidat cible les pénuries et le coût des traitements.'),
        ('Santé mentale : un plan national présenté par le gouvernement', 'Les jeunes et les soignants sont les premières cibles du dispositif.'),
        ('{who} promet de revaloriser le salaire des infirmiers', 'Le candidat veut rendre les métiers du soin plus attractifs.'),
    ],
    'education': [
        ('{who} promet de recruter 20 000 enseignants', 'Le candidat veut réduire les classes et revaloriser le métier.'),
        ('École : les parents dénoncent le manque de remplaçants', 'Les absences d’enseignants perturbent la rentrée dans plusieurs académies.'),
        ('{who} propose de réformer le baccalauréat', 'Le programme prévoit davantage de contrôle continu et d’orientation.'),
        ('Université : les étudiants réclament une hausse des bourses', 'La précarité étudiante et le coût du logement sont au centre des débats.'),
        ('{who} veut interdire le téléphone portable au collège', 'Le candidat défend une école plus exigeante et plus protectrice.'),
        ('Éducation : le gouvernement présente son plan contre le harcèlement', 'Les établissements devront renforcer la prévention et l’accompagnement.'),
        ('{who} promet la gratuité des cantines scolaires', 'La mesure vise les familles modestes et les communes rurales.'),
    ],
    'climate_energy': [
        ('{who} présente un plan de 200 milliards d’euros pour le climat', 'Le candidat veut rénover les logements et accélérer les énergies renouvelables.'),
        ('Sécheresse : plusieurs départements limitent l’usage de l’eau', 'Les agriculteurs et les collectivités s’adaptent au manque de pluie.'),
        ('{who} défend la construction de nouveaux réacteurs nucléaires', 'Le programme mise sur l’énergie décarbonée et l’indépendance énergétique.'),
        ('Éolien : le Sénat adopte une loi pour accélérer les projets', 'Le texte doit réduire les délais et mieux associer les territoires.'),
        ('{who} propose une taxe carbone aux frontières', 'Le candidat veut protéger l’industrie européenne et financer la transition.'),
        ('Inondations : l’état de catastrophe naturelle reconnu dans le Sud', 'Les habitants et les exploitations agricoles évaluent les dégâts.'),
        ('{who} promet la rénovation thermique de 500 000 logements par an', 'Le programme cible les passoires énergétiques et la facture des ménages.'),
    ],
    'europe_foreign': [
        ('{who} veut renégocier les traités européens', 'Le candidat propose une Europe plus sociale et moins technocratique.'),
        ('Ukraine : les dirigeants européens discutent d’un nouveau paquet d’aide', 'La guerre et la sécurité du continent dominent le sommet de Bruxelles.'),
        ('{who} défend une défense européenne commune', 'Le programme prévoit d’augmenter les dépenses militaires et la coopération.'),
        ('Moyen-Orient : la France appelle à un cessez-le-feu', 'La diplomatie française tente de peser sur les négociations régionales.'),
        ('{who} propose de sortir du commandement intégré de l’OTAN', 'Le candidat veut une politique étrangère plus indépendante.'),
        ('Russie : de nouvelles sanctions européennes adoptées', 'Les Vingt-Sept ciblent les financements et les exportations stratégiques.'),
        ('{who} veut conditionner l’aide au développement au respect des droits', 'Le candidat défend une diplomatie plus ferme et plus transparente.'),
    ],
    'institutions_democracy': [
        ('{who} propose un référendum sur la réforme des institutions', 'Le candidat veut réduire le nombre de parlementaires et introduire la proportionnelle.'),
        ('Assemblée nationale : une motion de censure déposée', 'Le gouvernement est accusé de passer en force avec le 49.3.'),
        ('{who} promet de réformer le Conseil constitutionnel', 'Le programme prévoit plus de transparence et de contrôle démocratique.'),
        ('Sénat : le texte sur la décentralisation est adopté', 'Les élus locaux demandent davantage de compétences et de ressources.'),
        ('{who} veut instaurer le vote à 16 ans', 'Le candidat défend une démocratie plus participative et une citoyenneté précoce.'),
        ('Le Premier ministre engage sa responsabilité sur le budget', 'Les oppositions dénoncent un manque de débat parlementaire.'),
        ('{who} propose une assemblée citoyenne tirée au sort', 'Le candidat veut associer les Français aux grandes décisions.'),
    ],
    'justice': [
        ('{who} promet de réformer la justice des mineurs', 'Le candidat veut des peines plus rapides et un meilleur accompagnement éducatif.'),
        ('Procès : l’ancien ministre comparaît pour corruption', 'Le tribunal doit examiner des faits de détournement de fonds publics.'),
        ('{who} propose de supprimer la Cour de justice de la République', 'Le programme veut renforcer l’indépendance des magistrats.'),
        ('Justice : les avocats dénoncent la surcharge des tribunaux', 'Les délais de jugement s’allongent dans plusieurs juridictions.'),
        ('{who} veut instaurer une peine de prison automatique pour les récidivistes', 'Le candidat défend une justice plus ferme et plus lisible.'),
        ('Garde à vue : la réforme des droits de la défense entre en vigueur', 'Les associations saluent des avancées mais demandent plus de moyens.'),
        ('{who} accuse le gouvernement d’avoir affaibli l’État de droit', 'Le débat sur les libertés publiques s’invite dans la campagne.'),
    ],
    'culture_identity': [
        ('{who} promet un plan pour la langue française', 'Le candidat veut défendre la culture et l’identité dans les écoles.'),
        ('Laïcité : le gouvernement présente une charte aux associations', 'Le texte doit préciser les règles du financement public et du cultuel.'),
        ('{who} dénonce les « wokistes » et le communautarisme', 'Le candidat place la culture et l’identité au cœur de son programme.'),
        ('Musées : les tarifs augmentent pour les visiteurs étrangers', 'La mesure vise à financer l’entretien du patrimoine.'),
        ('{who} veut inscrire la défense du patrimoine dans la Constitution', 'Le programme prévoit un fonds pour les monuments locaux.'),
        ('Racisme : une enquête ouvre après des tags dans une école', 'Les associations demandent des actes et pas seulement des condamnations.'),
        ('{who} propose de supprimer les subventions aux associations militantes', 'Le candidat veut recentrer l’argent public sur la culture traditionnelle.'),
    ],
    'local_overseas': [
        ('{who} promet un plan pour les outre-mer', 'Le candidat veut rattraper les retards d’équipement et de logement.'),
        ('Corse : les élus demandent un statut autonome', 'Le gouvernement ouvre des discussions sur les compétences de l’île.'),
        ('{who} veut supprimer les départements', 'Le programme prévoit de renforcer les régions et les communes.'),
        ('Bretagne : la ligne à grande vitesse prend du retard', 'Les collectivités s’inquiètent du financement et de la desserte.'),
        ('{who} promet une loi pour les territoires ruraux', 'Le candidat veut garantir les services publics et la couverture mobile.'),
        ('Mayotte : la crise de l’eau s’aggrave', 'Les habitants dénoncent le manque d’infrastructures et l’immigration irrégulière.'),
        ('{who} propose de fusionner les intercommunalités', 'Le candidat veut simplifier l’organisation territoriale et réduire les coûts.'),
    ],
    'other': [
        ('{who} annonce une grande convention sur les institutions', 'Le candidat veut rassembler au-delà de son parti.'),
        ('Les Français plébiscitent le télétravail selon une étude', 'Les entreprises adaptent leurs organisations et leurs bureaux.'),
        ('{who} publie son livre programme', 'L’ouvrage détaille la stratégie du candidat pour 2027.'),
        ('Météo : un épisode de froid attendu sur la moitié nord', 'Les températures vont chuter de plusieurs degrés cette semaine.'),
        ('{who} rencontre les syndicats à Paris', 'Le candidat veut écouter les représentants des salariés.'),
        ('Le prix du timbre augmentera en janvier', 'La Poste justifie la hausse par l’inflation et la baisse du courrier.'),
        ('{who} dévoile son affiche de campagne', 'Le candidat mise sur une image sobre et présidentielle.'),
    ],
}

NON_ELECTION = [
    ('Éthiopie : un nouveau barrage pour renforcer l’indépendance énergétique', 'Le projet hydroélectrique doit exporter de l’électricité dans la région.', 'climate_energy'),
    ('Recrutement : avec l’essor de l’IA, le ghosting devient la norme', 'Les candidats disparaissent parfois sans prévenir d’un processus de recrutement.', 'economy_purchasing_power'),
    ('Judo : Teddy Riner change d’entraîneur avant les championnats', 'Le champion prépare sa saison sportive et les Jeux olympiques.', 'other'),
    ('Guerre en Ukraine : la Russie accuse l’Europe de prolonger le conflit', 'Les négociations diplomatiques patinent.', 'europe_foreign'),
    ('Retraites : le gouvernement ouvre une concertation avec les syndicats', 'Le dossier pourrait revenir dans le débat public.', 'pensions_social'),
    ('CNews, à la fois incontournable et infréquentable pour les invités', 'La chaîne ajuste sa stratégie face aux critiques.', 'other'),
    ('Météo : la sécheresse s’aggrave dans le Sud-Est', 'Les restrictions d’eau pourraient être renforcées.', 'climate_energy'),
    ('Hôpital : les urgences de nuit ferment dans plusieurs villes', 'Le manque de médecins oblige les établissements à réorganiser leurs services.', 'health'),
    ('École : une rentrée sous tension dans les académies', 'Les syndicats dénoncent le manque de professeurs remplaçants.', 'education'),
    ('Inflation : les prix alimentaires continuent de progresser', 'Les ménages modestes modifient leurs achats.', 'economy_purchasing_power'),
    ('Sécurité : un réseau de trafiquants démantelé à Marseille', 'Les enquêteurs ont saisi des armes et de la drogue.', 'immigration_security'),
    ('Justice : un procès pour fraude fiscale s’ouvre à Paris', 'Le prévenu conteste les faits qui lui sont reprochés.', 'justice'),
    ('Culture : le festival d’Avignon dévoile sa programmation', 'Les organisateurs promettent une édition tournée vers la jeunesse.', 'culture_identity'),
    ('Outre-mer : la crise de l’eau s’aggrave à Mayotte', 'Les habitants dénoncent le manque d’infrastructures.', 'local_overseas'),
    ('Institutions : le Sénat examine une réforme de la décentralisation', 'Les élus locaux demandent plus de compétences.', 'institutions_democracy'),
    ('Europe : les Vingt-Sept discutent d’un nouveau paquet d’aide à l’Ukraine', 'Le sommet de Bruxelles doit aussi aborder la défense commune.', 'europe_foreign'),
    ('Élection de Miss France : la cérémonie bat des records d’audience', 'Le concours attire un large public sur TF1.', 'culture_identity'),
    ('Campagne de vaccination contre la grippe : les pharmacies participent', 'Les autorités sanitaires encouragent les personnes fragiles à se faire vacciner.', 'health'),
    ('La campagne de fouilles archéologiques reprend en Bourgogne', 'Les chercheurs espèrent mettre au jour un village gallo-romain.', 'culture_identity'),
    ('Élection du bureau de l’association des maires de France', 'Les élus locaux se réunissent pour leur congrès annuel.', 'local_overseas'),
]

HARD_POSITIVE = [
    ('Marine Le Pen présente son programme économique à Lille', 'La candidate du Rassemblement national veut baisser la TVA et durcir les frontières.', 'economy_purchasing_power'),
    ('Jean-Luc Mélenchon rassemble ses soutiens à Marseille', 'Le leader de La France insoumise défend la retraite à 60 ans et le SMIC à 1 600 euros.', 'pensions_social'),
    ('Gabriel Attal cherche à incarner le renouveau', 'L’ancien Premier ministre veut rassembler la majorité présidentielle.', 'institutions_democracy'),
    ('Édouard Philippe dévoile ses propositions sur l’hôpital', 'Le maire du Havre prépare sa candidature et critique la gestion gouvernementale.', 'health'),
    ('Raphaël Glucksmann veut une Europe plus sociale', 'Le candidat socialiste plaide pour un salaire minimum européen.', 'europe_foreign'),
    ('Bruno Retailleau durcit son discours sur l’immigration', 'Le président des Républicains veut un référendum sur les frontières.', 'immigration_security'),
    ('Marine Tondelier défend la transition écologique', 'L’écologiste propose de rénover les logements et de sortir des énergies fossiles.', 'climate_energy'),
    ('Fabien Roussel réclame une hausse du SMIC', 'Le communiste dénonce la baisse du pouvoir d’achat.', 'economy_purchasing_power'),
    ('Éric Zemmour réunit ses partisans à Paris', 'Le candidat de Reconquête veut réduire l’immigration et la dette.', 'immigration_security'),
    ('Nicolas Dupont-Aignan critique l’Union européenne', 'Le souverainiste appelle à un référendum sur les traités.', 'europe_foreign'),
]

REAL = [
    ('Présidentielle 2027 : Marine Le Pen en tête du dernier sondage', 'La candidate du RN devance Jean-Luc Mélenchon au premier tour.', True, 'institutions_democracy'),
    ('Le RN obtient un pré-accord de deux banques européennes pour financer sa campagne', 'Le parti espère un prêt de plus de 10 millions d’euros.', True, 'economy_purchasing_power'),
    ('Teddy Riner annonce sa candidature à l’élection présidentielle 2027', 'Le judoka veut porter un projet autour du sport et de la jeunesse.', True, 'other'),
    ('Éthiopie : construction d’un nouveau barrage pour renforcer son indépendance énergétique', 'Le projet hydroélectrique doit exporter de l’électricité dans la région.', False, 'climate_energy'),
    ('Recrutement : avec l’essor de l’IA, le risque de voir le ghosting devenir la norme', 'Les candidats disparaissent parfois sans prévenir d’un processus de recrutement.', False, 'economy_purchasing_power'),
    ('Sondage Ifop : Gabriel Attal progresse chez les électeurs de droite', 'L’enquête teste plusieurs hypothèses de premier tour.', True, 'institutions_democracy'),
    ('Taxe sur les superprofits, chèque énergie : le plan écologique de Raphaël Glucksmann', 'Le candidat présente un programme de 200 milliards d’euros.', True, 'climate_energy'),
    ('Judo : Teddy Riner change d’entraîneur avant la campagne présidentielle', 'Le champion prépare sa candidature et sa saison sportive.', True, 'other'),
    ('Gabriel Attal prêt à voter pour Bruno Retailleau ou David Lisnard', 'Le candidat de Renaissance évoque ses préférences en cas de second tour.', True, 'institutions_democracy'),
    ('CNews, à la fois incontournable et infréquentable pour les candidats', 'Les prétendants ajustent leur stratégie face à la chaîne.', True, 'other'),
    ('Guerre en Ukraine : la Russie accuse l’Europe de prolonger le conflit', 'Les négociations diplomatiques patinent.', False, 'europe_foreign'),
    ('Retraites : le gouvernement ouvre une concertation avec les syndicats', 'Le dossier pourrait revenir dans la campagne présidentielle.', True, 'pensions_social'),
]

items = []
for title, excerpt, election, topic in REAL:
    items.append({
        'id': f'real-{len(items)+1:03d}', 'title': title, 'excerpt': excerpt,
        'election_related': election, 'topic': topic,
        'synthetic': False, 'label_source': 'human-smoke',
    })

# 29 synthetic items per topic = 348. Roughly half election-related.
for topic in TOPICS:
    templates = TOPIC_TEMPLATES[topic]
    for i in range(26):
        template = templates[i % len(templates)]
        who, party = CANDIDATES[(i * 5 + TOPICS.index(topic)) % len(CANDIDATES)]
        election = i % 2 == 0
        title = template[0].format(who=who)
        excerpt = template[1]
        if election:
            # Add campaign context without making every item a carbon copy.
            suffix = random.choice([
                f'La candidate ou le candidat {party} veut convaincre avant le premier tour.',
                'Cette annonce s’inscrit dans la campagne présidentielle.',
                'Les équipes de campagne préparent la présentation du programme.',
                'Le sujet devrait dominer le prochain débat entre les candidats.',
                'Les sondages montrent une attention croissante des électeurs.',
            ])
            excerpt = f'{excerpt} {suffix}'
        else:
            # Remove candidate names and campaign framing from non-election items.
            title = title.replace(who, random.choice(['Le gouvernement', 'La Cour des comptes', 'Les élus locaux', 'Une étude', 'Le Sénat']))
            excerpt = excerpt.replace('Le candidat', 'Le rapport').replace('Le programme', 'Le texte')
            if 'campagne' in excerpt.lower() and 'présidentielle' not in excerpt.lower():
                excerpt = excerpt.replace('campagne', 'opération')
        items.append({
            'id': f'syn-{len(items)+1:03d}', 'title': title, 'excerpt': excerpt,
            'election_related': election, 'topic': topic,
            'synthetic': True, 'label_source': 'template',
        })

# Add hard positives and negatives, then top up to 360.
for title, excerpt, topic in HARD_POSITIVE:
    items.append({
        'id': f'hard-pos-{len(items)+1:03d}', 'title': title, 'excerpt': excerpt,
        'election_related': True, 'topic': topic,
        'synthetic': True, 'label_source': 'template-hard-positive',
    })
for title, excerpt, topic in NON_ELECTION:
    items.append({
        'id': f'hard-neg-{len(items)+1:03d}', 'title': title, 'excerpt': excerpt,
        'election_related': False, 'topic': topic,
        'synthetic': True, 'label_source': 'template-hard-negative',
    })

# Top up to exactly 360 with additional 'other' items, then trim only if needed.
extra_other = [
    ('Le prix du timbre augmentera en janvier', 'La Poste justifie la hausse par l’inflation et la baisse du courrier.'),
    ('Météo : un épisode de froid attendu sur la moitié nord', 'Les températures vont chuter de plusieurs degrés cette semaine.'),
    ('Transports : la grève des conducteurs perturbe les lignes régionales', 'Les syndicats réclament une hausse des salaires.'),
    ('Numérique : les Français passent plus de temps sur les réseaux sociaux', 'Une étude mesure l’évolution des usages depuis cinq ans.'),
    ('Agriculture : les producteurs de fruits alertent sur les récoltes', 'Le gel et la sécheresse ont endommagé plusieurs exploitations.'),
    ('Sport : les clubs amateurs manquent de bénévoles', 'Les fédérations cherchent de nouvelles recrues.'),
]
for title, excerpt in extra_other:
    items.append({
        'id': f'syn-other-{len(items)+1:03d}', 'title': title, 'excerpt': excerpt,
        'election_related': False, 'topic': 'other',
        'synthetic': True, 'label_source': 'template',
    })
while len(items) > 360:
    for index in range(len(items) - 1, -1, -1):
        if items[index]['label_source'] == 'template':
            items.pop(index)
            break

# Shuffle synthetic block but keep real items first for readability.
real = [x for x in items if not x['synthetic']]
rest = [x for x in items if x['synthetic']]
random.shuffle(rest)
items = real + rest

OUT.write_text(json.dumps(items, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
print(f'wrote {len(items)} items to {OUT}')
from collections import Counter
print(Counter(x['topic'] for x in items))
print(Counter(x['election_related'] for x in items))
