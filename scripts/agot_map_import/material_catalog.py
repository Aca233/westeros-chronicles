from __future__ import annotations

import math
from dataclasses import dataclass
from pathlib import Path, PurePosixPath

from scripts.agot_character_import.paradox import Token, tokenize

from .models import MapImportError


@dataclass(frozen=True, slots=True)
class TerrainMaterial:
    index: int
    id: str
    diffuse: str
    tile_factor: float


@dataclass(frozen=True, slots=True)
class TerrainMaterialInputs:
    index_map: Path
    intensity_map: Path
    settings: Path


def _live_tokens(path: Path) -> list[Token]:
    try:
        text = path.read_text(encoding="utf-8-sig", errors="strict")
    except (OSError, UnicodeError) as error:
        raise MapImportError(f"无法读取地形材质目录 {path.name}：{error}") from error
    return [token for token in tokenize(text) if token.kind != "COMMENT"]


def _material_blocks(tokens: list[Token], filename: str) -> list[dict[str, str]]:
    if not tokens:
        raise MapImportError(f"{filename} 没有材质分组")
    blocks: list[dict[str, str]] = []
    index = 0
    while index < len(tokens):
        group_opening = tokens[index]
        if group_opening.kind != "LBRACE":
            raise MapImportError(f"{filename} 第 {group_opening.line} 行不是材质分组")
        index += 1
        while index < len(tokens) and tokens[index].kind != "RBRACE":
            opening = tokens[index]
            if opening.kind != "LBRACE":
                raise MapImportError(f"{filename} 第 {opening.line} 行不是材质块")
            index += 1
            record: dict[str, str] = {}
            while index < len(tokens) and tokens[index].kind != "RBRACE":
                key = tokens[index]
                if key.kind != "WORD" or index + 2 >= len(tokens):
                    raise MapImportError(f"{filename} 第 {key.line} 行材质字段无效")
                operator, value = tokens[index + 1], tokens[index + 2]
                if operator.kind != "OP" or operator.value != "=" or value.kind != "WORD":
                    raise MapImportError(f"{filename} 第 {key.line} 行材质字段必须是 key = value")
                record[key.value] = value.value
                index += 3
            if index >= len(tokens):
                raise MapImportError(f"{filename} 第 {opening.line} 行材质块未闭合")
            blocks.append(record)
            index += 1
        if index >= len(tokens):
            raise MapImportError(f"{filename} 第 {group_opening.line} 行材质分组未闭合")
        index += 1
    return blocks


def parse_material_catalog(path: Path, default_tile_factor: float) -> tuple[TerrainMaterial, ...]:
    if not math.isfinite(default_tile_factor) or default_tile_factor <= 0:
        raise MapImportError("默认 tile_factor 必须是正数")
    blocks = _material_blocks(_live_tokens(path), path.name)
    materials: list[TerrainMaterial] = []
    seen_ids: set[str] = set()
    for index, record in enumerate(blocks):
        material_id = record.get("id", "").strip()
        diffuse = record.get("diffuse", "").strip().replace("\\", "/")
        if not material_id:
            raise MapImportError(f"{path.name} 第 {index + 1} 个材质缺少 id")
        if material_id in seen_ids:
            raise MapImportError(f"{path.name} 材质 ID 重复：{material_id}")
        if not diffuse:
            raise MapImportError(f"{path.name} 材质 {material_id} 缺少 diffuse")
        diffuse_path = PurePosixPath(diffuse)
        if diffuse_path.is_absolute() or ".." in diffuse_path.parts:
            raise MapImportError(f"{path.name} 材质 {material_id} 的 diffuse 路径不安全")
        raw_tile_factor = record.get("tile_factor")
        try:
            tile_factor = default_tile_factor if raw_tile_factor is None else float(raw_tile_factor)
        except ValueError as error:
            raise MapImportError(f"{path.name} 材质 {material_id} 的 tile_factor 无效") from error
        if not math.isfinite(tile_factor) or tile_factor <= 0:
            raise MapImportError(f"{path.name} 材质 {material_id} 的 tile_factor 必须是正数")
        seen_ids.add(material_id)
        materials.append(TerrainMaterial(index, material_id, diffuse, tile_factor))
    if not materials:
        raise MapImportError(f"{path.name} 没有可用地形材质")
    return tuple(materials)
