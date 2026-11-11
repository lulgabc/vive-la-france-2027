#!/usr/bin/env python3
"""Add missing candidates, avatar paths, and generate local monogram avatars."""

from __future__ import annotations

import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parents[1]
SEED = ROOT / "packages" / "domain" / "src" / "seed"
AVATARS = ROOT / "apps" / "web" / "public" / "avatars"

NEW_PARTIES = [
    {
        "id": "divers",
        "name": "Divers",
        "short_name": "DIV",
        "color": "#94a3b8",
        "spectrum": "other",
        "created_at": "2026-01-01",
    }
]

NEW_CANDIDATES = [
    {
        "id": "marine-tondelier",
        "slug": "marine-tondelier",
        "full_name": "Marine Tondelier",
        "party_id": "eelv",
        "status": "likely",
        "declared_at": None,
        "birth_year": 1986,
        "color": "#2E8B57",
        "name_fr": "Marine Tondelier",
        "name_en": "Marine Tondelier",
        "name_zh": "玛丽娜·通德利耶",
        "bio_fr": "Secrétaire nationale des Écologistes, conseillère municipale d’Hénin-Beaumont.",
        "bio_en": "National secretary of the Greens and municipal councillor in Hénin-Beaumont.",
        "bio_zh": "法国绿党全国书记、埃南-博蒙市议员。",
    },
    {
        "id": "nathalie-arthaud",
        "slug": "nathalie-arthaud",
        "full_name": "Nathalie Arthaud",
        "party_id": "lo",
        "status": "likely",
        "declared_at": None,
        "birth_year": 1970,
        "color": "#8B0000",
        "name_fr": "Nathalie Arthaud",
        "name_en": "Nathalie Arthaud",
        "name_zh": "娜塔莉·阿尔托",
        "bio_fr": "Porte-parole de Lutte ouvrière, candidate en 2012, 2017 et 2022.",
        "bio_en": "Spokesperson for Lutte ouvrière and candidate in 2012, 2017 and 2022.",
        "bio_zh": "“工人斗争”发言人，2012、2017、2022 年总统候选人。",
    },
    {
        "id": "dominique-de-villepin",
        "slug": "dominique-de-villepin",
        "full_name": "Dominique de Villepin",
        "party_id": "divers",
        "status": "potential",
        "declared_at": None,
        "birth_year": 1953,
        "color": "#94a3b8",
        "name_fr": "Dominique de Villepin",
        "name_en": "Dominique de Villepin",
        "name_zh": "多米尼克·德维尔潘",
        "bio_fr": "Ancien Premier ministre et ancien ministre des Affaires étrangères.",
        "bio_en": "Former Prime Minister and former Foreign Minister.",
        "bio_zh": "前总理、前外交部长。",
    },
    {
        "id": "francois-hollande",
        "slug": "francois-hollande",
        "full_name": "François Hollande",
        "party_id": "ps",
        "status": "potential",
        "declared_at": None,
        "birth_year": 1954,
        "color": "#E75480",
        "name_fr": "François Hollande",
        "name_en": "François Hollande",
        "name_zh": "弗朗索瓦·奥朗德",
        "bio_fr": "Ancien président de la République, testé dans plusieurs hypothèses de sondages.",
        "bio_en": "Former President of the Republic, tested in several polling scenarios.",
        "bio_zh": "法国前总统，多项民调假设中出现。",
    },
    {
        "id": "francois-ruffin",
        "slug": "francois-ruffin",
        "full_name": "François Ruffin",
        "party_id": "ps",
        "status": "potential",
        "declared_at": None,
        "birth_year": 1975,
        "color": "#E75480",
        "name_fr": "François Ruffin",
        "name_en": "François Ruffin",
        "name_zh": "弗朗索瓦·吕芬",
        "bio_fr": "Député de la Somme, figure de la gauche sociale.",
        "bio_en": "MP for the Somme and a leading figure of the social left.",
        "bio_zh": "索姆省议员、社会左翼代表人物。",
    },
    {
        "id": "olivier-faure",
        "slug": "olivier-faure",
        "full_name": "Olivier Faure",
        "party_id": "ps",
        "status": "potential",
        "declared_at": None,
        "birth_year": 1968,
        "color": "#E75480",
        "name_fr": "Olivier Faure",
        "name_en": "Olivier Faure",
        "name_zh": "奥利维耶·福尔",
        "bio_fr": "Premier secrétaire du Parti socialiste.",
        "bio_en": "First secretary of the Socialist Party.",
        "bio_zh": "社会党第一书记。",
    },
    {
        "id": "sarah-knafo",
        "slug": "sarah-knafo",
        "full_name": "Sarah Knafo",
        "party_id": "reconquete",
        "status": "potential",
        "declared_at": None,
        "birth_year": 1993,
        "color": "#1B1B1B",
        "name_fr": "Sarah Knafo",
        "name_en": "Sarah Knafo",
        "name_zh": "萨拉·克纳福",
        "bio_fr": "Eurodéputée Reconquête.",
        "bio_en": "Reconquête MEP.",
        "bio_zh": "“光复”党欧洲议会议员。",
    },
]

NEW_SCORES = [
    ("marine-tondelier", 4.0, 0.01, 0.02, 0.02, 0.2, 18, "low"),
    ("nathalie-arthaud", 1.0, 0.0, 0.01, 0.01, 0.1, 6, "low"),
    ("dominique-de-villepin", 2.0, 0.01, 0.02, 0.01, 0.2, 12, "low"),
    ("francois-hollande", 3.0, 0.01, 0.02, 0.02, 0.3, 16, "low"),
    ("francois-ruffin", 3.0, 0.01, 0.02, 0.02, 0.25, 15, "low"),
    ("olivier-faure", 2.0, 0.0, 0.01, 0.01, 0.2, 10, "low"),
    ("sarah-knafo", 1.5, 0.0, 0.01, 0.01, 0.15, 8, "low"),
]


def initials(name: str) -> str:
    parts = [part for part in re.split(r"[\s-]+", name) if part and part.lower() not in {"de", "du", "des", "le", "la"}]
    if not parts:
        return "?"
    if len(parts) == 1:
        return parts[0][:2].upper()
    return (parts[0][0] + parts[1][0]).upper()


def main() -> None:
    parties = json.loads((SEED / "parties.json").read_text())
    existing_party_ids = {party["id"] for party in parties}
    for party in NEW_PARTIES:
        if party["id"] not in existing_party_ids:
            parties.append(party)
    (SEED / "parties.json").write_text(json.dumps(parties, ensure_ascii=False, indent=2) + "\n")

    candidates = json.loads((SEED / "candidates.json").read_text())
    existing_ids = {candidate["id"] for candidate in candidates}
    for candidate in NEW_CANDIDATES:
        if candidate["id"] not in existing_ids:
            candidates.append(candidate)

    parties_by_id = {party["id"]: party for party in parties}
    AVATARS.mkdir(parents=True, exist_ok=True)
    for candidate in candidates:
        candidate["avatar"] = f"/avatars/{candidate['id']}.svg"
        party = parties_by_id.get(candidate["party_id"], {"color": "#64748b", "short_name": "DIV"})
        color = party["color"]
        text = initials(candidate["full_name"])
        short = party["short_name"]
        svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img" aria-label="{candidate['full_name']}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="{color}" stop-opacity="0.95"/>
      <stop offset="1" stop-color="#060a11" stop-opacity="0.98"/>
    </linearGradient>
    <pattern id="p" width="12" height="12" patternUnits="userSpaceOnUse">
      <path d="M12 0H0V12" fill="none" stroke="#ffffff" stroke-opacity="0.06"/>
    </pattern>
  </defs>
  <circle cx="64" cy="64" r="62" fill="url(#g)" stroke="{color}" stroke-opacity="0.55" stroke-width="2"/>
  <circle cx="64" cy="64" r="56" fill="url(#p)"/>
  <text x="64" y="72" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="40" font-weight="700" fill="#ffffff" fill-opacity="0.96">{text}</text>
  <text x="64" y="102" text-anchor="middle" font-family="ui-monospace, monospace" font-size="10" letter-spacing="3" fill="#ffffff" fill-opacity="0.62">{short}</text>
</svg>
'''
        (AVATARS / f"{candidate['id']}.svg").write_text(svg)

    (SEED / "candidates.json").write_text(json.dumps(candidates, ensure_ascii=False, indent=2) + "\n")

    demo = json.loads((SEED / "demo-scores.json").read_text())
    existing_score_ids = {score["candidate_id"] for score in demo["candidates"]}
    for candidate_id, poll, market, media, social, elite, composite, confidence in NEW_SCORES:
        if candidate_id in existing_score_ids:
            continue
        demo["candidates"].append(
            {
                "candidate_id": candidate_id,
                "poll_avg": poll,
                "market_prob": market,
                "share_of_voice": media,
                "social_attention": social,
                "elite": elite,
                "composite": composite,
                "confidence": confidence,
                "trend": [composite] * 12,
            }
        )
    (SEED / "demo-scores.json").write_text(json.dumps(demo, ensure_ascii=False, indent=2) + "\n")
    print(f"candidates={len(candidates)} avatars={len(list(AVATARS.glob('*.svg')))}")


if __name__ == "__main__":
    main()
