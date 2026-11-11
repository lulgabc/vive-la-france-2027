#!/usr/bin/env python3
"""Fetch real candidate portraits from Wikipedia / Wikimedia Commons.

Stores local 512x512 JPEGs and attribution metadata in the candidate seed.
Falls back to the existing monogram SVG when no portrait is available.
"""

from __future__ import annotations

import io
import json
import pathlib
import re
import time
import urllib.parse
import urllib.request

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parents[1]
SEED = ROOT / "packages" / "domain" / "src" / "seed"
AVATARS = ROOT / "apps" / "web" / "public" / "avatars"
UA = "ViveLaFrance2027Bot/0.1 (https://vive-la-france-2027.workers.dev; contact@vivelafrance2027.example)"


def get_json(url: str, attempts: int = 4) -> dict:
    for attempt in range(attempts):
        try:
            request = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
            with urllib.request.urlopen(request, timeout=30) as response:
                return json.load(response)
        except Exception:
            if attempt == attempts - 1:
                raise
            time.sleep(2 * (attempt + 1))
    return {}


def get_bytes(url: str, attempts: int = 4) -> bytes:
    for attempt in range(attempts):
        try:
            request = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(request, timeout=30) as response:
                return response.read()
        except Exception:
            if attempt == attempts - 1:
                raise
            time.sleep(2 * (attempt + 1))
    return b""


def page_image(lang: str, title: str) -> tuple[str, str] | None:
    url = (
        f"https://{lang}.wikipedia.org/w/api.php?action=query&format=json&prop=pageimages"
        f"&piprop=thumbnail%7Cname&pithumbsize=600&redirects=1&titles={urllib.parse.quote(title)}"
    )
    data = get_json(url)
    pages = data.get("query", {}).get("pages", {})
    for page in pages.values():
        thumb = page.get("thumbnail", {}).get("source")
        name = page.get("pageimage")
        if thumb and name:
            return thumb.split("?")[0], name
    return None


def commons_meta(file_name: str) -> dict:
    url = (
        "https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo"
        "&iiprop=url%7Cextmetadata&titles=" + urllib.parse.quote(f"File:{file_name}")
    )
    data = get_json(url)
    pages = data.get("query", {}).get("pages", {})
    for page in pages.values():
        info = (page.get("imageinfo") or [{}])[0]
        meta = info.get("extmetadata", {})
        artist = re.sub(r"<[^>]+>", "", meta.get("Artist", {}).get("value", "")).strip()
        license_name = re.sub(r"<[^>]+>", "", meta.get("LicenseShortName", {}).get("value", "")).strip()
        return {
            "credit": f"{artist} · {license_name}".strip(" ·"),
            "source": info.get("descriptionurl") or f"https://commons.wikimedia.org/wiki/File:{file_name}",
        }
    return {"credit": "Wikimedia Commons", "source": f"https://commons.wikimedia.org/wiki/File:{file_name}"}


def square_crop(raw: bytes, output: pathlib.Path) -> None:
    image = Image.open(io.BytesIO(raw)).convert("RGB")
    width, height = image.size
    side = min(width, height)
    left = max(0, (width - side) // 2)
    top = max(0, int((height - side) * 0.12)) if height > width else max(0, (height - side) // 2)
    image = image.crop((left, top, left + side, top + side)).resize((512, 512), Image.LANCZOS)
    output.parent.mkdir(parents=True, exist_ok=True)
    image.save(output, "JPEG", quality=86, optimize=True)


def main() -> None:
    candidates = json.loads((SEED / "candidates.json").read_text())
    AVATARS.mkdir(parents=True, exist_ok=True)
    ok = 0
    for candidate in candidates:
        name = candidate["full_name"]
        target = AVATARS / f"{candidate['id']}.jpg"
        try:
            found = page_image("fr", name) or page_image("en", name)
            if not found:
                print(f"no portrait: {name}")
                candidate["avatar_credit"] = "Avatar généré"
                candidate["avatar_source"] = None
                continue
            thumb, file_name = found
            raw = get_bytes(thumb)
            square_crop(raw, target)
            meta = commons_meta(file_name)
            candidate["avatar"] = f"/avatars/{candidate['id']}.jpg"
            candidate["avatar_credit"] = meta["credit"]
            candidate["avatar_source"] = meta["source"]
            ok += 1
            print(f"ok: {name} -> {meta['credit']}")
            time.sleep(1.2)
        except Exception as error:
            print(f"failed: {name}: {error}")
            candidate["avatar_credit"] = "Avatar généré"
            candidate["avatar_source"] = None
        time.sleep(0.4)

    (SEED / "candidates.json").write_text(json.dumps(candidates, ensure_ascii=False, indent=2) + "\n")
    print(f"portraits={ok}/{len(candidates)}")


if __name__ == "__main__":
    main()
