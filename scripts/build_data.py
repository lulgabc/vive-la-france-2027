#!/usr/bin/env python3
"""Build seed data from public sources.

- 2022 presidential first-round results by department (data.gouv.fr / Ministry of Interior)
- Department list from the simplified GeoJSON
"""

from __future__ import annotations

import csv
import io
import json
import pathlib
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
SEED = ROOT / "packages" / "domain" / "src" / "seed"

RESULTS_URL = (
    "https://static.data.gouv.fr/resources/"
    "resultats-du-premier-tour-de-lelection-presidentielle-2022-par-commune-et-par-departement/"
    "20220413-153225/03-resultats-par-departement.csv"
)

CANDIDATES = {
    "ARTHAUD": ("Nathalie Arthaud", "Lutte ouvrière", "lo"),
    "ROUSSEL": ("Fabien Roussel", "Parti communiste français", "pcf"),
    "MACRON": ("Emmanuel Macron", "Renaissance", "renaissance"),
    "LASSALLE": ("Jean Lassalle", "Résistons !", "resistons"),
    "LE PEN": ("Marine Le Pen", "Rassemblement national", "rn"),
    "ZEMMOUR": ("Éric Zemmour", "Reconquête", "reconquete"),
    "MÉLENCHON": ("Jean-Luc Mélenchon", "La France insoumise", "lfi"),
    "HIDALGO": ("Anne Hidalgo", "Parti socialiste", "ps"),
    "JADOT": ("Yannick Jadot", "Europe Écologie Les Verts", "eelv"),
    "PÉCRESSE": ("Valérie Pécresse", "Les Républicains", "lr"),
    "POUTOU": ("Philippe Poutou", "Nouveau Parti anticapitaliste", "npa"),
    "DUPONT-AIGNAN": ("Nicolas Dupont-Aignan", "Debout la France", "dlf"),
}


def download(url: str) -> str:
    with urllib.request.urlopen(url, timeout=60) as response:
        return response.read().decode("utf-8-sig")


def build_results() -> dict:
    text = download(RESULTS_URL)
    rows = list(csv.DictReader(io.StringIO(text)))
    departments: dict[str, dict] = {}

    for row in rows:
        code = row["dep_code"]
        if code not in departments:
            departments[code] = {
                "code": code,
                "name": row["dep_name"],
                "region": row["reg_name"],
                "turnout": round(100 - float(row["abstention_pourc"]), 2),
                "exprimes": int(row["exprimes_nb"]),
                "results": [],
            }

        raw_name = row["cand_nom"]
        candidate, party, party_id = CANDIDATES[raw_name]
        departments[code]["results"].append(
            {
                "candidate": candidate,
                "party": party,
                "party_id": party_id,
                "pct": round(float(row["cand_rapport_exprim"]), 2),
                "votes": int(row["cand_nb_voix"]),
            }
        )

    for department in departments.values():
        department["results"].sort(key=lambda item: item["pct"], reverse=True)
        winner = department["results"][0]
        department["winner_party"] = winner["party_id"]
        department["winner_candidate"] = winner["candidate"]
        department["winner_pct"] = winner["pct"]

    return {
        "source": "Ministère de l'Intérieur / data.gouv.fr",
        "source_url": RESULTS_URL,
        "election": "presidentielle-2022-t1",
        "as_of": "2022-04-10",
        "departments": dict(sorted(departments.items())),
    }


def build_departments(results: dict) -> list[dict]:
    geo_path = ROOT / "apps" / "web" / "public" / "geo" / "departements.geojson"
    geo = json.loads(geo_path.read_text())
    output = []
    for feature in geo["features"]:
        props = feature["properties"]
        code = props["code"]
        result = results["departments"].get(code, {})
        output.append(
            {
                "code": code,
                "name": props["nom"],
                "region": result.get("region", ""),
                "winner_party": result.get("winner_party"),
                "winner_candidate": result.get("winner_candidate"),
                "winner_pct": result.get("winner_pct"),
            }
        )
    return sorted(output, key=lambda item: item["code"])


def main() -> None:
    SEED.mkdir(parents=True, exist_ok=True)
    results = build_results()
    (SEED / "results-2022-departments.json").write_text(
        json.dumps(results, ensure_ascii=False, indent=2) + "\n"
    )
    departments = build_departments(results)
    (SEED / "departments.json").write_text(
        json.dumps(departments, ensure_ascii=False, indent=2) + "\n"
    )
    print(f"wrote {len(results['departments'])} departments, {len(departments)} map features")


if __name__ == "__main__":
    main()
