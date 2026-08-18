"""Minimal, cached MediaWiki client for AWOIAF character pages."""
from __future__ import annotations

import hashlib
import html
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Iterable, Mapping


API_URL = "https://awoiaf.westeros.org/api.php"
USER_AGENT = "WesterosChroniclesPortraitImporter/1.0 (offline project asset import)"


@dataclass(frozen=True)
class WikiImageInfo:
    filename: str
    url: str
    description_url: str
    width: int
    height: int
    mime: str
    author: str = ""
    license_name: str = ""
    license_url: str = ""


@dataclass(frozen=True)
class WikiCharacterPage:
    title: str
    page_url: str
    firstname: str
    lastname: str
    aliases: str
    allegiance: str
    father: str
    mother: str
    birth_year: int | None
    image_caption: str
    image: WikiImageInfo | None


def _template_body(wikitext: str, template_name: str) -> str | None:
    match = re.search(r"\{\{\s*" + re.escape(template_name) + r"\b", wikitext, flags=re.IGNORECASE)
    if not match:
        return None
    start = match.start()
    depth = 0
    index = start
    while index < len(wikitext) - 1:
        pair = wikitext[index:index + 2]
        if pair == "{{":
            depth += 1
            index += 2
            continue
        if pair == "}}":
            depth -= 1
            index += 2
            if depth == 0:
                return wikitext[start:index]
            continue
        index += 1
    return None


def _infobox_fields(wikitext: str) -> dict[str, str]:
    body = _template_body(wikitext, "Infobox character") or _template_body(wikitext, "Infobox monarch")
    if not body:
        return {}
    fields: dict[str, str] = {}
    current_key: str | None = None
    for line in body.splitlines()[1:]:
        field = re.match(r"^\s*\|\s*([^=]+?)\s*=\s*(.*)$", line)
        if field:
            current_key = field.group(1).strip().lower()
            fields[current_key] = field.group(2).strip()
        elif current_key and line.strip() and line.strip() != "}}":
            fields[current_key] = f"{fields[current_key]} {line.strip()}".strip()
    return fields


def _image_filename(value: str) -> str:
    file_link = re.search(r"\[\[(?:File|Image):([^]|]+)", value, flags=re.IGNORECASE)
    filename = file_link.group(1) if file_link else value
    filename = re.sub(r"<!--.*?-->", "", filename, flags=re.DOTALL).strip()
    return re.sub(r"^(?:File|Image):", "", filename, flags=re.IGNORECASE).strip()


def _clean_wiki(value: str) -> str:
    value = re.sub(r"<ref\b[^>]*>.*?</ref>|<ref\b[^>]*/>", " ", value, flags=re.IGNORECASE | re.DOTALL)
    value = re.sub(r"\[\[[^]|]+\|([^]]+)]]", r"\1", value)
    value = re.sub(r"\[\[([^]]+)]]", r"\1", value)
    value = re.sub(r"<[^>]+>", " ", value)
    value = value.replace("'''", "").replace("''", "")
    return re.sub(r"\s+", " ", html.unescape(value)).strip()


def _birth_year(value: str) -> int | None:
    match = re.search(r"\{\{\s*Date\s*\|\s*(-?\d{1,4})", value, flags=re.IGNORECASE)
    if not match:
        match = re.search(r"\b(\d{1,4})\s*(?:AC)?\b", _clean_wiki(value), flags=re.IGNORECASE)
    return int(match.group(1)) if match else None


def _metadata_value(metadata: Mapping[str, Any], key: str) -> str:
    value = metadata.get(key, {})
    if isinstance(value, Mapping):
        return _clean_wiki(str(value.get("value", "")))
    return ""


class AwoiafClient:
    def __init__(
        self,
        *,
        fetch_json: Callable[[Mapping[str, str]], Mapping[str, Any]] | None = None,
        request_delay: float = 0.2,
        cache_dir: Path | None = None,
        offline_cache_only: bool = False,
    ) -> None:
        self.request_delay = request_delay
        self.cache_dir = cache_dir
        self.offline_cache_only = offline_cache_only
        self.fetch_json = fetch_json or self._default_fetch

    def _default_fetch(self, params: Mapping[str, str]) -> Mapping[str, Any]:
        query = {"action": "query", "format": "json", "formatversion": "2", "maxlag": "5", **params}
        cache_path: Path | None = None
        if self.cache_dir:
            cache_key = hashlib.sha256(json.dumps(query, sort_keys=True).encode("utf-8")).hexdigest()
            cache_path = self.cache_dir / f"{cache_key}.json"
            if cache_path.exists():
                return json.loads(cache_path.read_text(encoding="utf-8"))
        if self.offline_cache_only:
            raise FileNotFoundError(f"Wiki API cache missing for request: {query}")
        url = f"{API_URL}?{urllib.parse.urlencode(query)}"
        request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        last_error: Exception | None = None
        for attempt in range(4):
            try:
                with urllib.request.urlopen(request, timeout=45) as response:
                    payload = json.load(response)
                if cache_path:
                    cache_path.parent.mkdir(parents=True, exist_ok=True)
                    cache_path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
                if self.request_delay:
                    time.sleep(self.request_delay)
                return payload
            except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError) as error:
                last_error = error
                if isinstance(error, urllib.error.HTTPError) and error.code not in {429, 500, 502, 503, 504}:
                    raise
                time.sleep(0.5 * (attempt + 1))
        assert last_error is not None
        raise last_error

    def list_character_titles(self) -> list[str]:
        titles: list[str] = []
        continuation: str | None = None
        while True:
            params = {
                "list": "categorymembers",
                "cmtitle": "Category:Character pages in alphabetical order",
                "cmnamespace": "0",
                "cmlimit": "max",
            }
            if continuation:
                params["cmcontinue"] = continuation
            payload = self.fetch_json(params)
            titles.extend(entry["title"] for entry in payload.get("query", {}).get("categorymembers", []))
            continuation = payload.get("continue", {}).get("cmcontinue")
            if not continuation:
                return sorted(set(titles))

    @staticmethod
    def _batches(values: list[str], size: int = 50) -> Iterable[list[str]]:
        for index in range(0, len(values), size):
            yield values[index:index + size]

    def build_catalog(self) -> list[WikiCharacterPage]:
        titles = self.list_character_titles()
        raw_pages: list[Mapping[str, Any]] = []
        for batch in self._batches(titles):
            payload = self.fetch_json({
                "prop": "revisions|info",
                "rvprop": "content",
                "inprop": "url",
                "titles": "|".join(batch),
            })
            raw_pages.extend(payload.get("query", {}).get("pages", []))

        parsed_pages: list[tuple[Mapping[str, Any], dict[str, str]]] = []
        image_names: list[str] = []
        for page in raw_pages:
            revisions = page.get("revisions") or []
            fields = _infobox_fields(str(revisions[0].get("content", ""))) if revisions else {}
            if not fields:
                continue
            parsed_pages.append((page, fields))
            image_name = _image_filename(fields.get("image", ""))
            if image_name:
                image_names.append(image_name)

        images: dict[str, WikiImageInfo] = {}
        for batch in self._batches(sorted(set(image_names))):
            payload = self.fetch_json({
                "prop": "imageinfo",
                "iiprop": "url|size|mime|extmetadata",
                "titles": "|".join(f"File:{name}" for name in batch),
            })
            for page in payload.get("query", {}).get("pages", []):
                info_rows = page.get("imageinfo") or []
                if not info_rows:
                    continue
                info = info_rows[0]
                filename = str(page.get("title", "")).removeprefix("File:")
                metadata = info.get("extmetadata") or {}
                images[filename] = WikiImageInfo(
                    filename=filename,
                    url=str(info.get("url", "")),
                    description_url=str(info.get("descriptionurl", "")),
                    width=int(info.get("width", 0)),
                    height=int(info.get("height", 0)),
                    mime=str(info.get("mime", "")),
                    author=_metadata_value(metadata, "Artist"),
                    license_name=_metadata_value(metadata, "LicenseShortName"),
                    license_url=_metadata_value(metadata, "LicenseUrl"),
                )

        catalog = []
        for page, fields in parsed_pages:
            image_name = _image_filename(fields.get("image", ""))
            catalog.append(WikiCharacterPage(
                title=str(page["title"]),
                page_url=str(page.get("fullurl", "")),
                firstname=_clean_wiki(fields.get("firstname", "")),
                lastname=_clean_wiki(fields.get("lastname", "")),
                aliases=_clean_wiki(fields.get("alias", "")),
                allegiance=_clean_wiki(fields.get("allegiance", "")),
                father=_clean_wiki(fields.get("father", "")),
                mother=_clean_wiki(fields.get("mother", "")),
                birth_year=_birth_year(fields.get("date_of_birth", "")),
                image_caption=_clean_wiki(fields.get("image_caption", "")),
                image=images.get(image_name),
            ))
        return sorted(catalog, key=lambda page: page.title)
