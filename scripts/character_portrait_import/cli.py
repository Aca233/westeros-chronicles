"""Command-line entry point for the offline AWOIAF portrait import."""
from __future__ import annotations

import argparse
import hashlib
import json
import time
import urllib.error
import urllib.request
from dataclasses import asdict
from pathlib import Path
from typing import Any, Callable, Mapping

from .matcher import match_characters
from .wiki import AwoiafClient, USER_AGENT
from .writer import PortraitImportReport, write_portrait_dataset


def _load_record_shards(root: Path) -> list[dict[str, Any]]:
    return [
        record
        for path in sorted((root / "shards").glob("*.json"))
        for record in json.loads(path.read_text(encoding="utf-8"))
    ]


def _load_mapping_shards(root: Path, directory: str) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for path in sorted((root / directory).glob("*.json")):
        result.update(json.loads(path.read_text(encoding="utf-8")))
    return result


class CachedImageFetcher:
    def __init__(self, cache_dir: Path, *, offline_cache_only: bool = False, request_delay: float = 0.1) -> None:
        self.cache_dir = cache_dir
        self.offline_cache_only = offline_cache_only
        self.request_delay = request_delay

    def __call__(self, url: str) -> bytes:
        cache_path = self.cache_dir / f"{hashlib.sha256(url.encode('utf-8')).hexdigest()}.bin"
        if cache_path.exists():
            return cache_path.read_bytes()
        if self.offline_cache_only:
            raise FileNotFoundError(f"Wiki image cache missing: {url}")
        request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        last_error: Exception | None = None
        for attempt in range(4):
            try:
                with urllib.request.urlopen(request, timeout=60) as response:
                    payload = response.read()
                cache_path.parent.mkdir(parents=True, exist_ok=True)
                cache_path.write_bytes(payload)
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


def run_import(
    *,
    character_root: Path,
    output_data_root: Path,
    output_asset_root: Path,
    client: AwoiafClient,
    fetch_bytes: Callable[[str], bytes],
    overrides: Mapping[str, Any],
    limit: int | None = None,
) -> PortraitImportReport:
    records = _load_record_shards(character_root)
    kinship = _load_mapping_shards(character_root, "kinship")
    extra_titles = [
        (entry.get("pageTitle") if isinstance(entry, dict) else entry).strip()
        for entry in overrides.values()
        if (entry.get("pageTitle") if isinstance(entry, dict) else entry)
    ]
    extra_images = [
        entry.get("imageTitle").strip()
        for entry in overrides.values()
        if isinstance(entry, dict) and entry.get("imageTitle")
    ]
    catalog = client.build_catalog(extra_titles=extra_titles, extra_images=extra_images)
    if limit is not None:
        catalog = catalog[:max(0, limit)]
    images_map = getattr(client, "images", {})
    matches = match_characters(records, kinship, catalog, overrides, images=images_map)
    return write_portrait_dataset(matches, output_data_root, output_asset_root, fetch_bytes)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--characters", type=Path, default=Path("public/data/agot-characters"))
    parser.add_argument("--output-data", type=Path, default=Path("public/data/agot-character-portraits"))
    parser.add_argument("--output-assets", type=Path, default=Path("public/assets/character-portraits"))
    parser.add_argument("--cache", type=Path, default=Path(".cache/character-portraits"))
    parser.add_argument("--overrides", type=Path, default=Path("scripts/character_portrait_import/overrides.json"))
    parser.add_argument("--offline-cache-only", action="store_true")
    parser.add_argument("--limit", type=int)
    args = parser.parse_args()
    overrides = json.loads(args.overrides.read_text(encoding="utf-8"))
    report = run_import(
        character_root=args.characters,
        output_data_root=args.output_data,
        output_asset_root=args.output_assets,
        client=AwoiafClient(
            cache_dir=args.cache / "api",
            offline_cache_only=args.offline_cache_only,
        ),
        fetch_bytes=CachedImageFetcher(
            args.cache / "images",
            offline_cache_only=args.offline_cache_only,
        ),
        overrides=overrides,
        limit=args.limit,
    )
    print(json.dumps(asdict(report), ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
