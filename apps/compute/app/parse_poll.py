from __future__ import annotations

import io
import re
from datetime import date
from typing import Any

import pdfplumber

MONTHS = {
    "janvier": 1, "février": 2, "fevrier": 2, "mars": 3, "avril": 4,
    "mai": 5, "juin": 6, "juillet": 7, "août": 8, "aout": 8,
    "septembre": 9, "octobre": 10, "novembre": 11, "décembre": 12, "decembre": 12,
}

KNOWN_POLLSTERS = [
    ("Toluna Harris Interactive", "Toluna Harris Interactive"),
    ("Harris Interactive", "Harris Interactive"),
    ("Ifop", "Ifop"),
    ("Ipsos", "Ipsos"),
    ("OpinionWay", "OpinionWay"),
    ("Elabe", "Elabe"),
    ("Odoxa", "Odoxa"),
    ("Cluster17", "Cluster17"),
    ("YouGov", "YouGov"),
    ("Verian", "Verian"),
    ("Kantar", "Kantar"),
    ("BVA", "BVA Xsight"),
]

# Canonical names used by the site. The parser keeps unknown names as free text.
CANDIDATE_NAMES = [
    "Nathalie Arthaud", "Jean-Luc Mélenchon", "Fabien Roussel", "Marine Tondelier",
    "Raphaël Glucksmann", "Gabriel Attal", "Édouard Philippe", "Dominique de Villepin",
    "David Lisnard", "Bruno Retailleau", "Nicolas Dupont-Aignan", "Marine Le Pen",
    "Éric Zemmour", "François Hollande", "François Ruffin", "Olivier Faure",
    "Xavier Bertrand", "François Bayrou", "Yannick Jadot", "Sarah Knafo",
]


def _text(pdf: pdfplumber.PDF) -> str:
    return "\n".join((page.extract_text() or "") for page in pdf.pages)


def _date_from_french(day: str, month: str, year: str) -> str | None:
    month_number = MONTHS.get(month.lower())
    if not month_number:
        return None
    try:
        return date(int(year), month_number, int(day)).isoformat()
    except ValueError:
        return None


def _metadata(text: str, source_url: str) -> dict[str, Any]:
    pollster = None
    for needle, canonical in KNOWN_POLLSTERS:
        if needle.lower() in text.lower():
            pollster = canonical
            break

    sponsor = None
    sponsor_match = re.search(r"(?:É|E)tude réalisée pour ([^\n]+)", text, re.IGNORECASE)
    if sponsor_match:
        sponsor = sponsor_match.group(1).strip(" .")

    fieldwork_start = fieldwork_end = None
    range_match = re.search(r"du\s+(\d{1,2})\s+au\s+(\d{1,2})", text, re.IGNORECASE)
    if range_match:
        start_day, end_day = range_match.groups()
        # PDF text order can interleave the sample-size paragraph between the
        # day range and the month, so search a window after the range.
        window = text[range_match.end(): range_match.end() + 400]
        month_year = re.search(r"([a-zéûôîàè]+)\s+(\d{4})", window, re.IGNORECASE)
        if month_year:
            month, year = month_year.groups()
            fieldwork_start = _date_from_french(start_day, month, year)
            fieldwork_end = _date_from_french(end_day, month, year)
    if not fieldwork_end:
        single = re.search(
            r"(\d{1,2})\s+([a-zéûôîàè]+)\s+(\d{4})",
            text,
            re.IGNORECASE,
        )
        if single:
            fieldwork_end = _date_from_french(*single.groups())

    sample_size = None
    sample_match = re.search(r"Échantillon de\s+([\d\s\xa0]+)\s+personnes", text, re.IGNORECASE)
    if sample_match:
        sample_size = int(re.sub(r"\D", "", sample_match.group(1)) or 0) or None

    population = None
    if "inscrites sur les listes électorales" in text:
        population = "Inscrits sur les listes électorales"
    elif "population française" in text:
        population = "Population française"

    methodology = None
    if "en ligne" in text.lower():
        methodology = "Enquête en ligne (panel)"

    notice_number = None
    url_match = re.search(r"/(\d{4,6})(?:-|/|$)", source_url)
    if url_match:
        notice_number = url_match.group(1)

    return {
        "pollster": pollster,
        "sponsor": sponsor,
        "fieldwork_start": fieldwork_start,
        "fieldwork_end": fieldwork_end,
        "sample_size": sample_size,
        "population": population,
        "methodology": methodology,
        "notice_number": notice_number,
    }


def _parse_results(text: str) -> list[dict[str, Any]]:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    results: list[dict[str, Any]] = []
    seen: set[str] = set()

    for index, line in enumerate(lines):
        name = next((candidate for candidate in CANDIDATE_NAMES if line.startswith(candidate)), None)
        if not name or name in seen:
            continue
        tail = line[len(name):].strip()
        numbers = [int(value) for value in re.findall(r"(?<!\d)(\d{1,2})(?!\d)", tail)]
        if not numbers and index + 1 < len(lines):
            numbers = [int(value) for value in re.findall(r"(?<!\d)(\d{1,2})(?!\d)", lines[index + 1])]
        if not numbers:
            continue
        pct = numbers[0]
        if pct > 100:
            continue
        seen.add(name)
        results.append({"name": name, "pct": float(pct)})

    return results


def _find_first_round_page(pdf: pdfplumber.PDF) -> tuple[int, str]:
    candidates: list[tuple[int, str]] = []
    for index, page in enumerate(pdf.pages):
        text = page.extract_text() or ""
        if "Intention de vote au 1er tour" in text and "Hypothèse" in text:
            candidates.append((index, text))
    if candidates:
        return candidates[0]
    # Fallback: the recap page.
    for index, page in enumerate(pdf.pages):
        text = page.extract_text() or ""
        if "Récapitulatif" in text and "Intentions de vote" in text:
            return index, text
    return -1, ""


def extract_notice(pdf_bytes: bytes, source_url: str = "") -> dict[str, Any]:
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        full_text = _text(pdf)
        page_index, results_text = _find_first_round_page(pdf)
        results = _parse_results(results_text)
        page_count = len(pdf.pages)

    metadata = _metadata(full_text, source_url)
    warnings: list[str] = []
    if not metadata["pollster"]:
        warnings.append("Pollster not detected; reviewer must set it.")
    if not metadata["fieldwork_end"]:
        warnings.append("Fieldwork end date not detected.")
    if not metadata["sample_size"]:
        warnings.append("Sample size not detected.")
    if len(results) < 5:
        warnings.append(f"Only {len(results)} candidate results detected; check the PDF manually.")

    confidence = 0.25
    confidence += 0.2 if metadata["pollster"] else 0
    confidence += 0.2 if metadata["fieldwork_end"] else 0
    confidence += 0.15 if metadata["sample_size"] else 0
    confidence += min(0.2, len(results) * 0.02)

    return {
        "ok": True,
        "mode": "pdf",
        "source_url": source_url,
        "page_count": page_count,
        "result_page": page_index + 1 if page_index >= 0 else None,
        "confidence": round(min(confidence, 0.95), 2),
        "warnings": warnings,
        **metadata,
        "results": results,
        "raw_text": full_text[:20000],
    }
