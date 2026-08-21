from __future__ import annotations

import math
from functools import lru_cache
from pathlib import Path, PurePosixPath

from scripts.agot_map_import.paradox import Entry, parse_file

from .models import AssetComponent, AssetDefinition, MaterialBinding, ModelImportError, TextureSet


def _value(block: Entry, key: str, *, required: bool = True) -> str | None:
    entry = block.first(key)
    value = entry.value.strip() if entry and entry.value is not None else None
    if required and not value:
        raise ModelImportError(f"{block.key} 第 {block.line} 行缺少 {key}")
    return value


@lru_cache(maxsize=8)
def _filename_index(root: Path) -> dict[str, tuple[Path, ...]]:
    index: dict[str, list[Path]] = {}
    model_root = root / "gfx" / "models"
    if model_root.is_dir():
        for path in model_root.rglob("*"):
            if path.is_file():
                index.setdefault(path.name.casefold(), []).append(path)
    return {name: tuple(sorted(paths)) for name, paths in index.items()}


def _relative_file(directory: Path, raw: str, label: str, source_root: Path | None = None) -> Path:
    relative = PurePosixPath(raw.replace("\\", "/"))
    if relative.is_absolute() or ".." in relative.parts:
        raise ModelImportError(f"{label} 必须是安全相对路径")
    candidate = directory.joinpath(*relative.parts)
    if candidate.exists() or source_root is None:
        return candidate
    matches = _filename_index(source_root).get(relative.name.casefold(), ())
    if len(matches) == 1:
        return matches[0]
    if len(matches) > 1:
        raise ModelImportError(f"{label} 文件名在源目录中不唯一：{relative.name}")
    return candidate


def _material(block: Entry, directory: Path, source_root: Path | None) -> MaterialBinding:
    name = _value(block, "name")
    raw_index = _value(block, "index")
    try:
        index = int(raw_index or "")
    except ValueError as error:
        raise ModelImportError(f"材质 {name} 的 index 无效") from error
    if index < 0:
        raise ModelImportError(f"材质 {name} 的 index 不能为负")
    diffuse = _relative_file(directory, _value(block, "texture_diffuse") or "", "diffuse", source_root)
    normal = _relative_file(directory, _value(block, "texture_normal") or "", "normal", source_root)
    properties = _relative_file(directory, _value(block, "texture_specular") or "", "properties", source_root)
    shader = _value(block, "shader") or ""
    return MaterialBinding(name or "", index, TextureSet(diffuse, normal, properties), shader)


def parse_asset(path: Path, source_root: Path | None = None) -> AssetDefinition:
    try:
        entries = parse_file(path)
    except (OSError, UnicodeError, ValueError) as error:
        raise ModelImportError(f"无法解析 asset：{path}") from error
    meshes = [entry for entry in entries if entry.key == "pdxmesh"]
    if not meshes:
        raise ModelImportError(f"{path.name} 至少需要一个 pdxmesh")
    components: list[AssetComponent] = []
    seen_component_names: set[str] = set()
    for block in meshes:
        component_name = _value(block, "name") or ""
        if component_name in seen_component_names:
            raise ModelImportError(f"{path.name} 的 pdxmesh 名称重复：{component_name}")
        seen_component_names.add(component_name)
        mesh_path = _relative_file(path.parent, _value(block, "file") or "", "mesh", source_root)
        if mesh_path.suffix.lower() != ".mesh":
            raise ModelImportError(f"{path.name} 引用的 file 不是 .mesh")
        raw_scale = _value(block, "scale", required=False)
        try:
            scale = 1.0 if raw_scale is None else float(raw_scale)
        except ValueError as error:
            raise ModelImportError(f"{path.name} 的 scale 无效") from error
        if not math.isfinite(scale) or scale <= 0:
            raise ModelImportError(f"{path.name} 的 scale 必须为正数")
        materials = tuple(_material(item, path.parent, source_root) for item in block.all("meshsettings"))
        if not materials:
            raise ModelImportError(f"{path.name}/{component_name} 没有 meshsettings")
        names = [item.name for item in materials]
        if len(set(names)) != len(names):
            raise ModelImportError(f"{path.name}/{component_name} 的 meshsettings 名称重复")
        components.append(AssetComponent(component_name, mesh_path, scale, materials))
    return AssetDefinition(tuple(components))
