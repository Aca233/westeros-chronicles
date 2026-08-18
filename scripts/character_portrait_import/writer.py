"""Validate, convert, and write the local character portrait dataset."""
from __future__ import annotations

import hashlib
import json
import re
import shutil
import tempfile
from dataclasses import asdict, dataclass
from io import BytesIO
from pathlib import Path
from typing import Callable

from PIL import Image, ImageOps, UnidentifiedImageError

from .matcher import PortraitMatchResult


ALLOWED_MIME = frozenset({"image/png", "image/jpeg", "image/webp"})
FORBIDDEN_IMAGE_TERMS = (
    "coat of arms", "house sigil", "map of", "weapon illustration", "sword illustration",
    "hbo", "played by", "portrayed by", "television series", "tv series", "season screenshot",
)


@dataclass(frozen=True)
class PortraitImportReport:
    accepted: int
    automatic: int
    overrides: int
    ambiguous: int
    unmatched: int
    no_image: int
    rejected: int
    failed: int
    dataset_hash: str


def _json_bytes(value: object, *, pretty: bool = False) -> bytes:
    text = json.dumps(
        value, ensure_ascii=False, sort_keys=True,
        indent=2 if pretty else None, separators=None if pretty else (",", ":"),
    )
    text = text.replace("©", "\\u00a9")
    return f"{text}\n".encode("utf-8")


def _slug(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")


def _attribution_id(page_title: str) -> str:
    return f"awoiaf:{re.sub(r'[^A-Za-z0-9._-]+', '_', page_title).strip('_')}"


def _is_rejected_image(filename: str, caption: str, mime: str, width: int, height: int) -> str | None:
    source = f"{filename} {caption}".lower()
    if mime not in ALLOWED_MIME:
        return "unsupported_mime"
    if width < 160 or height < 160:
        return "too_small"
    for term in FORBIDDEN_IMAGE_TERMS:
        if term in source:
            return f"forbidden:{term}"
    return None


def _convert_to_webp(data: bytes) -> bytes:
    try:
        with Image.open(BytesIO(data)) as source:
            source.load()
            image = ImageOps.exif_transpose(source).convert("RGB")
            if image.width < 160 or image.height < 160:
                raise ValueError("image dimensions are too small")
            image.thumbnail((640, 800), Image.Resampling.LANCZOS)
            output = BytesIO()
            image.save(output, format="WEBP", quality=88, method=6)
            return output.getvalue()
    except (UnidentifiedImageError, OSError) as error:
        raise ValueError("invalid image bytes") from error


def write_portrait_dataset(
    matches: PortraitMatchResult,
    output_data_root: Path,
    output_asset_root: Path,
    fetch_bytes: Callable[[str], bytes],
) -> PortraitImportReport:
    output_data_root = output_data_root.resolve()
    output_asset_root = output_asset_root.resolve()
    output_data_root.parent.mkdir(parents=True, exist_ok=True)
    output_asset_root.parent.mkdir(parents=True, exist_ok=True)
    temporary_data = Path(tempfile.mkdtemp(prefix=f".{output_data_root.name}-", dir=output_data_root.parent))
    temporary_assets = Path(tempfile.mkdtemp(prefix=f".{output_asset_root.name}-", dir=output_asset_root.parent))
    refs: dict[str, dict[str, str]] = {}
    attribution: dict[str, dict[str, str]] = {}
    rejected: dict[str, str] = {}
    no_image: list[str] = []
    failed: dict[str, str] = {}

    try:
        for character_id, match in sorted(matches.accepted.items()):
            page = match.page
            image = page.image
            if image is None or not image.url:
                no_image.append(character_id)
                continue
            rejection = _is_rejected_image(
                image.filename, page.image_caption, image.mime, image.width, image.height,
            )
            if rejection:
                rejected[character_id] = rejection
                continue
            try:
                webp = _convert_to_webp(fetch_bytes(image.url))
            except Exception as error:
                failed[character_id] = str(error)
                continue
            digest = hashlib.sha256(webp).hexdigest()[:12]
            filename = f"{_slug(character_id)}-{digest}.webp"
            (temporary_assets / filename).write_bytes(webp)
            attribution_id = _attribution_id(page.title)
            ref = {
                "characterId": character_id,
                "assetPath": f"/assets/character-portraits/{filename}",
                "attributionId": attribution_id,
            }
            if match.focal_point:
                ref["focalPoint"] = match.focal_point
            refs[character_id] = ref
            attribution[attribution_id] = {
                "id": attribution_id,
                "pageTitle": page.title,
                "pageUrl": page.page_url,
                "originalUrl": image.url,
                "descriptionUrl": image.description_url,
                "author": image.author,
                "caption": page.image_caption,
                "licenseName": image.license_name,
                "licenseUrl": image.license_url,
            }

        shards: dict[str, dict[str, dict[str, str]]] = {f"{value:02x}": {} for value in range(256)}
        for character_id, ref in sorted(refs.items()):
            shard = hashlib.sha256(character_id.encode("utf-8")).hexdigest()[:2]
            shards[shard][character_id] = ref
        (temporary_data / "shards").mkdir()
        for shard, values in sorted(shards.items()):
            (temporary_data / "shards" / f"{shard}.json").write_bytes(_json_bytes(values))

        fingerprint = {"refs": refs, "attribution": attribution}
        dataset_hash = hashlib.sha256(_json_bytes(fingerprint)).hexdigest()
        report = PortraitImportReport(
            accepted=len(refs),
            automatic=sum(match.source == "automatic" and character_id in refs for character_id, match in matches.accepted.items()),
            overrides=sum(match.source == "override" and character_id in refs for character_id, match in matches.accepted.items()),
            ambiguous=len(matches.ambiguous),
            unmatched=len(matches.unmatched),
            no_image=len(no_image),
            rejected=len(rejected),
            failed=len(failed),
            dataset_hash=dataset_hash,
        )
        (temporary_data / "manifest.json").write_bytes(_json_bytes({
            "schemaVersion": 1,
            "datasetHash": dataset_hash,
            "counts": {key: value for key, value in asdict(report).items() if key != "dataset_hash"},
        }, pretty=True))
        (temporary_data / "attribution.json").write_bytes(_json_bytes(attribution, pretty=True))
        reports = temporary_data / "reports"
        reports.mkdir()
        (reports / "import-report.json").write_bytes(_json_bytes(asdict(report), pretty=True))
        (reports / "accepted.json").write_bytes(_json_bytes({
            character_id: {"pageTitle": match.page.title, "score": match.score, "source": match.source}
            for character_id, match in sorted(matches.accepted.items()) if character_id in refs
        }, pretty=True))
        (reports / "ambiguous.json").write_bytes(_json_bytes(matches.ambiguous, pretty=True))
        (reports / "unmatched.json").write_bytes(_json_bytes(sorted(matches.unmatched), pretty=True))
        (reports / "rejected.json").write_bytes(_json_bytes(rejected, pretty=True))
        (reports / "no-image.json").write_bytes(_json_bytes(sorted(no_image), pretty=True))
        (reports / "failed.json").write_bytes(_json_bytes(failed, pretty=True))

        if output_data_root.exists():
            shutil.rmtree(output_data_root)
        if output_asset_root.exists():
            shutil.rmtree(output_asset_root)
        shutil.move(str(temporary_data), str(output_data_root))
        shutil.move(str(temporary_assets), str(output_asset_root))
        return report
    except Exception:
        shutil.rmtree(temporary_data, ignore_errors=True)
        shutil.rmtree(temporary_assets, ignore_errors=True)
        raise
