from __future__ import annotations

import json
import math
import re
from pathlib import Path, PurePosixPath
from typing import Any, Iterable

from .models import (
    EXPECTED_SOURCE_ID,
    Correction,
    LandmarkCatalog,
    LandmarkCatalogEntry,
    ModelImportError,
)

_ID_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
_LOCATION_RE = re.compile(r"^b_[a-z0-9_]+$")
_ASSET_ROOT = PurePosixPath("gfx/models/buildings/special")


def _number_tuple(value: Any, size: int, label: str, default: tuple[float, ...]) -> tuple[float, ...]:
    if value is None:
        return default
    if not isinstance(value, list) or len(value) != size:
        raise ModelImportError(f"{label} 必须包含 {size} 个数字")
    try:
        result = tuple(float(item) for item in value)
    except (TypeError, ValueError) as error:
        raise ModelImportError(f"{label} 必须包含数字") from error
    if not all(math.isfinite(item) for item in result):
        raise ModelImportError(f"{label} 包含非有限值")
    return result


def _parse_correction(value: Any) -> Correction | None:
    if value is None:
        return None
    if not isinstance(value, dict):
        raise ModelImportError("corrections 必须是对象")
    reason = value.get("reason")
    if not isinstance(reason, str) or not reason.strip():
        raise ModelImportError("地标修正必须提供非空 reason")
    position = _number_tuple(value.get("positionOffset"), 3, "positionOffset", (0.0, 0.0, 0.0))
    rotation = _number_tuple(value.get("rotationOffset"), 4, "rotationOffset", (0.0, 0.0, 0.0, 1.0))
    scale = _number_tuple(value.get("scaleMultiplier"), 3, "scaleMultiplier", (1.0, 1.0, 1.0))
    if abs(math.sqrt(sum(item * item for item in rotation)) - 1.0) > 1e-4:
        raise ModelImportError("rotationOffset 必须是单位四元数")
    if any(item <= 0 for item in scale):
        raise ModelImportError("scaleMultiplier 必须为正数")
    return Correction(position, rotation, scale, reason.strip())


def _safe_asset(value: Any) -> PurePosixPath:
    if not isinstance(value, str) or not value:
        raise ModelImportError("asset 必须是相对路径")
    path = PurePosixPath(value.replace("\\", "/"))
    if path.is_absolute() or ".." in path.parts:
        raise ModelImportError("asset 必须是安全的相对路径")
    if path.suffix.lower() != ".asset" or path.parts[: len(_ASSET_ROOT.parts)] != _ASSET_ROOT.parts:
        raise ModelImportError("asset 必须是 gfx/models/buildings/special 下的相对路径")
    return path


def _parse_entry(value: Any) -> LandmarkCatalogEntry:
    if not isinstance(value, dict):
        raise ModelImportError("地标记录必须是对象")
    landmark_id = value.get("id")
    name = value.get("name")
    location_id = value.get("locationId")
    province_id = value.get("provinceId")
    variant = value.get("variant")
    if not isinstance(landmark_id, str) or not _ID_RE.fullmatch(landmark_id):
        raise ModelImportError("地标 id 无效")
    if not isinstance(name, str) or not name.strip():
        raise ModelImportError("地标 name 不能为空")
    if not isinstance(location_id, str) or not _LOCATION_RE.fullmatch(location_id):
        raise ModelImportError("locationId 无效")
    if not isinstance(province_id, int) or isinstance(province_id, bool) or province_id <= 0:
        raise ModelImportError("provinceId 必须为正整数")
    if variant is not None and (not isinstance(variant, str) or not variant.strip()):
        raise ModelImportError("variant 必须是非空字符串")
    return LandmarkCatalogEntry(
        landmark_id,
        name.strip(),
        location_id,
        province_id,
        _safe_asset(value.get("asset")),
        variant.strip() if isinstance(variant, str) else None,
        _parse_correction(value.get("corrections")),
    )


def _require_unique(entries: Iterable[LandmarkCatalogEntry], attribute: str) -> None:
    seen: set[object] = set()
    for entry in entries:
        value = getattr(entry, attribute)
        if value in seen:
            raise ModelImportError(f"地标 {attribute} 重复：{value}")
        seen.add(value)


def load_catalog(path: Path) -> LandmarkCatalog:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise ModelImportError(f"无法读取地标白名单：{path}") from error
    if not isinstance(payload, dict) or payload.get("schemaVersion") != 1:
        raise ModelImportError("地标白名单 schemaVersion 必须为 1")
    if payload.get("sourceId") != EXPECTED_SOURCE_ID:
        raise ModelImportError(f"地标白名单 sourceId 必须为 {EXPECTED_SOURCE_ID}")
    raw_entries = payload.get("landmarks")
    if not isinstance(raw_entries, list):
        raise ModelImportError("landmarks 必须是数组")
    entries = tuple(_parse_entry(item) for item in raw_entries)
    if len(entries) != 12:
        raise ModelImportError("首批地标白名单必须恰好包含 12 项")
    for attribute in ("id", "location_id", "province_id"):
        _require_unique(entries, attribute)
    return LandmarkCatalog(1, EXPECTED_SOURCE_ID, entries)


def validate_source_root(root: Path) -> None:
    if not root.is_dir():
        raise ModelImportError(f"AGOT 源目录不存在：{root}")
    descriptor = root / "descriptor.mod"
    try:
        text = descriptor.read_text(encoding="utf-8-sig")
    except OSError as error:
        raise ModelImportError("AGOT 源目录缺少 descriptor.mod") from error
    if not re.search(r'remote_file_id\s*=\s*["\']2962333032["\']', text):
        raise ModelImportError(f"AGOT 源身份必须为 {EXPECTED_SOURCE_ID}")
