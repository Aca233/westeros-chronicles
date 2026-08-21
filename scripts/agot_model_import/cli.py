from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
import shutil
import sys
import tempfile
from dataclasses import dataclass, replace
from pathlib import Path
from typing import Callable, Iterable

from PIL import Image

from .asset_parser import parse_asset
from .audit import AuditReport, MAX_LOD_BYTES, audit_outputs, stable_hash
from .catalog import load_catalog, validate_source_root
from .gltf_writer import inspect_glb, write_glb
from .locators import parse_locators, resolve_transform
from .placement import audit_landmark_placement_image, read_glb_positions
from .mesh_adapter import convert_mesh, simplify_primitive, verify_converter
from .models import (
    CONVERTER_COMMIT,
    EXPECTED_SOURCE_ID,
    LandmarkCatalog,
    LandmarkCatalogEntry,
    MeshPrimitive,
    ModelImportError,
    StaticMesh,
)
from .textures import convert_texture, pack_properties
from scripts.agot_map_import.source import parse_definition
from scripts.agot_map_import.water_coloring import parse_water_province_sets

DEFAULT_CATALOG = Path(__file__).with_name("landmark_models.json")
LOD_TEXTURE_EDGE_CANDIDATES = {0: (512, 256, 128), 1: (256, 128)}


@dataclass(frozen=True)
class SourceAuditReport:
    landmark_count: int
    asset_count: int
    texture_count: int


@dataclass(frozen=True)
class ImportReport:
    landmark_count: int
    glb_count: int
    total_bytes: int
    asset_hash: str


def _source_hash(root: Path, path: Path) -> tuple[str, str]:
    try:
        relative = path.resolve().relative_to(root.resolve()).as_posix()
    except ValueError as error:
        raise ModelImportError(f"源路径逃逸：{path}") from error
    return relative, hashlib.sha256(path.read_bytes()).hexdigest()


def _definitions(source_root: Path) -> dict[int, str]:
    result: dict[int, str] = {}
    path = source_root / "map_data" / "definition.csv"
    try:
        with path.open(encoding="utf-8-sig", newline="") as handle:
            for row in csv.reader(handle, delimiter=";"):
                if len(row) >= 5 and row[0].isdigit():
                    result[int(row[0])] = row[4]
    except OSError as error:
        raise ModelImportError("AGOT 源缺少 map_data/definition.csv") from error
    return result


def audit_source(source_root: Path, converter_root: Path, catalog: LandmarkCatalog) -> SourceAuditReport:
    validate_source_root(source_root)
    verify_converter(converter_root)
    definitions = _definitions(source_root)
    locators = parse_locators(source_root / "gfx/map/map_object_data/special_building_locators.txt")
    texture_count = 0
    for entry in catalog.landmarks:
        if definitions.get(entry.province_id) != entry.location_id:
            raise ModelImportError(f"{entry.id} 的 locationId/provinceId 与 definition.csv 不一致")
        if entry.province_id not in locators:
            raise ModelImportError(f"{entry.id} 缺少 locator {entry.province_id}")
        asset_path = source_root / entry.asset
        if not asset_path.is_file():
            raise ModelImportError(f"{entry.id} 的 asset 不存在：{entry.asset}")
        asset = parse_asset(asset_path, source_root)
        for component in asset.components:
            if not component.mesh_path.is_file():
                raise ModelImportError(f"{entry.id} 的 mesh 不存在：{component.mesh_path}")
            for material in component.materials:
                missing = [texture for texture in (material.textures.diffuse, material.textures.normal, material.textures.properties) if not texture.is_file()]
                if missing and material.shader != "tree":
                    raise ModelImportError(f"{entry.id} 的主体贴图不存在：{missing[0].name}")
                for texture in (material.textures.diffuse, material.textures.normal, material.textures.properties):
                    if texture.is_file():
                        _source_hash(source_root, texture)
                        texture_count += 1
    return SourceAuditReport(len(catalog.landmarks), len(catalog.landmarks), texture_count)



def _usable_materials(component):
    usable = []
    ignored = []
    for material in component.materials:
        missing = [path for path in (material.textures.diffuse, material.textures.normal, material.textures.properties) if not path.is_file()]
        if missing:
            if material.shader == "tree":
                ignored.append(material.name)
                continue
            raise ModelImportError(f"主体材质 {material.name} 缺少贴图：{missing[0].name}")
        usable.append(material)
    if not usable:
        raise ModelImportError(f"组件 {component.name} 没有可转换的主体材质")
    return tuple(usable), frozenset(ignored)


def _scaled_mesh(mesh: StaticMesh, scale: float) -> StaticMesh:
    if scale == 1.0:
        return mesh
    return StaticMesh(tuple(replace(
        primitive,
        positions=tuple(tuple(axis * scale for axis in position) for position in primitive.positions),
    ) for primitive in mesh.primitives))


def _namespace_component(component_name: str, mesh: StaticMesh, materials):
    renamed_materials = tuple(replace(material, name=f"{component_name}:{material.name}") for material in materials)
    names = {material.name: f"{component_name}:{material.name}" for material in materials}
    renamed_mesh = StaticMesh(tuple(replace(
        primitive,
        name=f"{component_name}:{primitive.name}",
        material_name=names[primitive.material_name],
    ) for primitive in mesh.primitives))
    return renamed_mesh, renamed_materials


def _merge_meshes(meshes):
    return StaticMesh(tuple(primitive for mesh in meshes for primitive in mesh.primitives))

def _lod_mesh(mesh: StaticMesh, ratio: float = 0.35) -> StaticMesh:
    simplified: list[MeshPrimitive] = []
    for primitive in mesh.primitives:
        if len(primitive.indices) <= 12:
            # Tiny material islands are retained; the aggregate audit still enforces 25%-40%.
            indices = primitive.indices
        else:
            # Individual disconnected material islands cannot always reach 40% while
            # retaining valid triangles. The release budget is defined for the whole
            # landmark, so accept per-primitive overshoot and enforce the aggregate below.
            indices = simplify_primitive(
                primitive.indices,
                primitive.positions,
                ratio,
                allow_ratio_overshoot=True,
            )
        simplified.append(replace(primitive, indices=indices))
    result = StaticMesh(tuple(simplified))
    source_triangles = sum(len(item.indices) for item in mesh.primitives) // 3
    target_triangles = sum(len(item.indices) for item in result.primitives) // 3
    aggregate = target_triangles / source_triangles
    if not 0.25 <= aggregate <= 0.40:
        raise ModelImportError(f"LOD1 聚合三角形比例超限：{aggregate:.3f}")
    return result


def _textures(materials, max_size: int):
    output = {}
    for material in materials:
        output[(material.name, "diffuse")] = convert_texture(material.textures.diffuse, "diffuse", max_size)
        output[(material.name, "normal")] = convert_texture(material.textures.normal, "normal", max_size)
        output[(material.name, "properties")] = pack_properties(material.textures.properties, max_size)
    return output


def _write_budgeted_glb(mesh, materials, output: Path, level: int):
    report = None
    selected_edge = None
    for maximum in LOD_TEXTURE_EDGE_CANDIDATES[level]:
        report = write_glb(mesh, materials, _textures(materials, maximum), output)
        selected_edge = maximum
        if report.bytes <= MAX_LOD_BYTES[level]:
            return report, selected_edge
    assert report is not None and selected_edge is not None
    raise ModelImportError(
        f"模型 {output.parent.name}/lod{level} 即使贴图降至 {selected_edge} 仍超过字节预算"
    )


def _bounds(mesh: StaticMesh, scale: tuple[float, float, float]) -> tuple[float, float]:
    positions = [point for primitive in mesh.primitives for point in primitive.positions]
    minimum = [min(point[index] for point in positions) for index in range(3)]
    maximum = [max(point[index] for point in positions) for index in range(3)]
    radius = max(abs(minimum[0]), abs(maximum[0]), abs(minimum[2]), abs(maximum[2])) * max(scale[0], scale[2])
    height = (maximum[1] - minimum[1]) * scale[1]
    return radius, height


def _convert_to_roots(
    catalog: LandmarkCatalog,
    source_root: Path,
    converter_root: Path,
    data_root: Path,
    asset_root: Path,
    only: tuple[str, ...] | None,
) -> ImportReport:
    selected = tuple(item for item in catalog.landmarks if only is None or item.id in only)
    if only is not None and tuple(item.id for item in selected) != only:
        raise ModelImportError("--only 必须按白名单顺序列出存在的地标 id")
    locators = parse_locators(source_root / "gfx/map/map_object_data/special_building_locators.txt")
    heightmap = source_root / "map_data/heightmap.png"
    records: list[dict[str, object]] = []
    audits: list[dict[str, object]] = []
    with tempfile.TemporaryDirectory(prefix="agot-model-json-") as temp:
        temp_root = Path(temp)
        for entry in selected:
            asset_path = source_root / entry.asset
            asset = parse_asset(asset_path, source_root)
            component_meshes = []
            all_materials = []
            excluded_shapes = []
            for component_index, component in enumerate(asset.components):
                usable_materials, ignored_shapes = _usable_materials(component)
                converted = convert_mesh(
                    converter_root,
                    component.mesh_path,
                    temp_root / f"{entry.id}-{component_index}.json",
                    usable_materials,
                    ignored_shapes,
                )
                converted = _scaled_mesh(converted, component.scale)
                converted, namespaced_materials = _namespace_component(component.name, converted, usable_materials)
                component_meshes.append(converted)
                all_materials.extend(namespaced_materials)
                excluded_shapes.extend(sorted(ignored_shapes))
            mesh = _merge_meshes(component_meshes)
            materials = tuple(all_materials)
            lod1_mesh = _lod_mesh(mesh)
            transform = resolve_transform(entry, locators[entry.province_id], 6144, heightmap, 1.0)
            model_root = asset_root / entry.id
            lod_reports = []
            for level, source_mesh in ((0, mesh), (1, lod1_mesh)):
                output = model_root / f"lod{level}.glb"
                report, maximum = _write_budgeted_glb(source_mesh, materials, output, level)
                lod_reports.append({
                    "minZoom": 4.60 if level == 1 else 5.35,
                    "path": f"/assets/agot-map/models/{entry.id}/lod{level}.glb",
                    "bytes": report.bytes,
                    "triangleCount": report.triangle_count,
                    "sha256": report.sha256,
                    "textureMaxEdge": maximum,
                    "textureSizes": [list(size) for size in report.texture_sizes],
                })
            radius, height = _bounds(mesh, transform.scale)
            record = {
                "id": entry.id,
                "locationId": entry.location_id,
                "provinceId": entry.province_id,
                "name": entry.name,
                "transform": {
                    "mapX": transform.map_x,
                    "mapY": transform.map_y,
                    "elevationMeters": transform.elevation_meters,
                    "rotation": list(transform.rotation),
                    "scale": list(transform.scale),
                },
                "lods": lod_reports,
                "bounds": {"radiusMapPixels": radius, "heightMeters": height},
            }
            records.append(record)
            source_paths = [asset_path]
            for component in asset.components:
                source_paths.append(component.mesh_path)
                for material in component.materials:
                    source_paths.extend(path for path in (material.textures.diffuse, material.textures.normal, material.textures.properties) if path.is_file())
            source_hashes = dict(_source_hash(source_root, path) for path in sorted(set(source_paths)))
            audits.append({
                "id": entry.id,
                "variant": entry.variant,
                "correctionReason": entry.corrections.reason if entry.corrections else None,
                "excludedShapes": excluded_shapes,
                "excludedReason": "基础游戏 tree shader 贴图不在 AGOT Workshop 源中" if excluded_shapes else None,
                "sourceHashes": source_hashes,
                "lods": lod_reports,
            })
    definitions = parse_definition(source_root / "map_data/definition.csv")
    colour_to_province = {definition.rgb: province_id for province_id, definition in definitions.items()}
    default_map_text = (source_root / "map_data/default.map").read_text(encoding="utf-8-sig", errors="replace")
    water = parse_water_province_sets(default_map_text)
    water_ids = frozenset(water.seas | water.lakes | water.rivers)
    with Image.open(source_root / "map_data/provinces.png") as province_image:
        for record, audit_record in zip(records, audits, strict=True):
            landmark_id = str(record["id"])
            audit_record["placement"] = audit_landmark_placement_image(
                record,
                read_glb_positions(asset_root / landmark_id / "lod0.glb"),
                province_image,
                colour_to_province,
                water_ids,
            )
    asset_hash = stable_hash(records)
    manifest = {
        "schemaVersion": 1,
        "sourceId": EXPECTED_SOURCE_ID,
        "converter": {"name": "io_pdx_mesh", "commit": CONVERTER_COMMIT},
        "assetHash": asset_hash,
        "landmarks": records,
    }
    data_root.mkdir(parents=True, exist_ok=True)
    (data_root / "reports").mkdir(parents=True, exist_ok=True)
    (data_root / "landmarks.json").write_text(json.dumps(manifest, ensure_ascii=False, sort_keys=True, indent=2) + "\n", encoding="utf-8")
    (data_root / "reports" / "audit.json").write_text(json.dumps({
        "schemaVersion": 1,
        "assetHash": asset_hash,
        "landmarks": audits,
    }, ensure_ascii=False, sort_keys=True, indent=2) + "\n", encoding="utf-8")
    audit = audit_outputs(data_root, asset_root, (item.id for item in selected))
    return ImportReport(audit.landmark_count, audit.glb_count, audit.total_bytes, audit.asset_hash)




def _bounds_from_glb(path: Path, scale: tuple[float, float, float]) -> tuple[float, float]:
    bounds = inspect_glb(path).bounds
    radius = max(
        abs(bounds.minimum[0]), abs(bounds.maximum[0]),
        abs(bounds.minimum[2]), abs(bounds.maximum[2]),
    ) * max(scale[0], scale[2])
    height = (bounds.maximum[1] - bounds.minimum[1]) * scale[1]
    return radius, height


def refresh_metadata(
    catalog: LandmarkCatalog,
    source_root: Path,
    data_output: Path,
    asset_output: Path,
) -> ImportReport:
    validate_source_root(source_root)
    manifest_path = data_output / "landmarks.json"
    audit_path = data_output / "reports" / "audit.json"
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        audit_payload = json.loads(audit_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise ModelImportError("无法读取现有地标清单或审计报告") from error
    existing_records = manifest.get("landmarks")
    existing_audits = audit_payload.get("landmarks")
    if not isinstance(existing_records, list) or not isinstance(existing_audits, list):
        raise ModelImportError("现有地标清单或审计报告结构无效")
    records_by_id = {record.get("id"): record for record in existing_records if isinstance(record, dict)}
    audits_by_id = {record.get("id"): record for record in existing_audits if isinstance(record, dict)}
    if tuple(records_by_id) != catalog.ids or tuple(audits_by_id) != catalog.ids:
        raise ModelImportError("现有地标清单或审计顺序/集合与 catalog 不一致")

    locators = parse_locators(source_root / "gfx/map/map_object_data/special_building_locators.txt")
    heightmap = source_root / "map_data/heightmap.png"
    definitions = parse_definition(source_root / "map_data/definition.csv")
    colour_to_province = {definition.rgb: province_id for province_id, definition in definitions.items()}
    default_map_text = (source_root / "map_data/default.map").read_text(encoding="utf-8-sig", errors="replace")
    water = parse_water_province_sets(default_map_text)
    water_ids = frozenset(water.seas | water.lakes | water.rivers)

    refreshed_records: list[dict[str, object]] = []
    refreshed_audits: list[dict[str, object]] = []
    with Image.open(source_root / "map_data/provinces.png") as province_image:
        for entry in catalog.landmarks:
            existing = records_by_id[entry.id]
            transform = resolve_transform(entry, locators[entry.province_id], 6144, heightmap, 1.0)
            lods = existing.get("lods")
            if not isinstance(lods, list) or len(lods) != 2:
                raise ModelImportError(f"地标 {entry.id} 现有 LOD 元数据无效")
            lod0_path = asset_output / entry.id / "lod0.glb"
            radius, height = _bounds_from_glb(lod0_path, transform.scale)
            record = {
                "id": entry.id,
                "locationId": entry.location_id,
                "provinceId": entry.province_id,
                "name": entry.name,
                "transform": {
                    "mapX": transform.map_x,
                    "mapY": transform.map_y,
                    "elevationMeters": transform.elevation_meters,
                    "rotation": list(transform.rotation),
                    "scale": list(transform.scale),
                },
                "lods": lods,
                "bounds": {"radiusMapPixels": radius, "heightMeters": height},
            }
            placement = audit_landmark_placement_image(
                record, read_glb_positions(lod0_path), province_image, colour_to_province, water_ids,
            )
            refreshed_records.append(record)
            previous_audit = audits_by_id[entry.id]
            refreshed_audits.append({
                **previous_audit,
                "id": entry.id,
                "correctionReason": entry.corrections.reason if entry.corrections else None,
                "lods": lods,
                "placement": placement,
            })

    asset_hash = stable_hash(refreshed_records)
    refreshed_manifest = {
        **manifest,
        "schemaVersion": 1,
        "sourceId": EXPECTED_SOURCE_ID,
        "converter": {"name": "io_pdx_mesh", "commit": CONVERTER_COMMIT},
        "assetHash": asset_hash,
        "landmarks": refreshed_records,
    }
    refreshed_audit_payload = {
        **audit_payload,
        "schemaVersion": 1,
        "assetHash": asset_hash,
        "landmarks": refreshed_audits,
    }
    manifest_path.write_text(json.dumps(refreshed_manifest, ensure_ascii=False, sort_keys=True, indent=2) + "\n", encoding="utf-8")
    audit_path.write_text(json.dumps(refreshed_audit_payload, ensure_ascii=False, sort_keys=True, indent=2) + "\n", encoding="utf-8")
    audit = audit_outputs(data_output, asset_output, catalog.ids)
    return ImportReport(audit.landmark_count, audit.glb_count, audit.total_bytes, audit.asset_hash)


def _remove_owned(path: Path) -> None:
    if path.exists():
        shutil.rmtree(path)



def _move_directory(source: Path, target: Path) -> None:
    try:
        source.rename(target)
    except PermissionError:
        if target.exists():
            raise
        shutil.copytree(source, target)
        shutil.rmtree(source)

def atomic_replace_pair(data_stage: Path, asset_stage: Path, data_output: Path, asset_output: Path) -> None:
    data_backup = data_output.with_name(f"{data_output.name}.backup-{os.getpid()}")
    asset_backup = asset_output.with_name(f"{asset_output.name}.backup-{os.getpid()}")
    for backup in (data_backup, asset_backup):
        _remove_owned(backup)
    data_moved = asset_moved = False
    try:
        if data_output.exists():
            _move_directory(data_output, data_backup)
            data_moved = True
        if asset_output.exists():
            _move_directory(asset_output, asset_backup)
            asset_moved = True
        _move_directory(data_stage, data_output)
        _move_directory(asset_stage, asset_output)
    except Exception:
        if data_output.exists() and not data_stage.exists():
            _move_directory(data_output, data_stage)
        if asset_output.exists() and not asset_stage.exists():
            _move_directory(asset_output, asset_stage)
        if data_moved and data_backup.exists():
            _move_directory(data_backup, data_output)
        if asset_moved and asset_backup.exists():
            _move_directory(asset_backup, asset_output)
        raise
    else:
        _remove_owned(data_backup)
        _remove_owned(asset_backup)


def convert_catalog(
    catalog: LandmarkCatalog,
    source_root: Path,
    converter_root: Path,
    data_output: Path,
    asset_output: Path,
    only: tuple[str, ...] | None = None,
) -> ImportReport:
    audit_source(source_root, converter_root, catalog)
    suffix = f".staging-{os.getpid()}"
    data_stage = data_output.with_name(data_output.name + suffix)
    asset_stage = asset_output.with_name(asset_output.name + suffix)
    _remove_owned(data_stage)
    _remove_owned(asset_stage)
    try:
        report = _convert_to_roots(catalog, source_root, converter_root, data_stage, asset_stage, only)
        atomic_replace_pair(data_stage, asset_stage, data_output, asset_output)
        return report
    except Exception:
        _remove_owned(data_stage)
        _remove_owned(asset_stage)
        raise


def _ids(value: str | None) -> tuple[str, ...] | None:
    if not value:
        return None
    return tuple(item.strip() for item in value.split(",") if item.strip())


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(description="Convert AGOT special buildings to local GLB landmarks")
    sub = result.add_subparsers(dest="command", required=True)
    source_common = argparse.ArgumentParser(add_help=False)
    source_common.add_argument("--catalog", type=Path, default=DEFAULT_CATALOG)
    source_common.add_argument("--source", type=Path, required=True)
    converter_common = argparse.ArgumentParser(add_help=False, parents=[source_common])
    converter_common.add_argument("--converter-root", type=Path, required=True)
    audit_source_command = sub.add_parser("audit-source", parents=[converter_common])
    audit_source_command.set_defaults(kind="audit-source")
    convert = sub.add_parser("convert", parents=[converter_common])
    convert.add_argument("--data-output", type=Path, required=True)
    convert.add_argument("--asset-output", type=Path, required=True)
    convert.add_argument("--only")
    convert.set_defaults(kind="convert")
    refresh = sub.add_parser("refresh-metadata", parents=[source_common])
    refresh.add_argument("--data-output", type=Path, required=True)
    refresh.add_argument("--asset-output", type=Path, required=True)
    refresh.set_defaults(kind="refresh-metadata")
    audit = sub.add_parser("audit")
    audit.add_argument("--data", type=Path, required=True)
    audit.add_argument("--assets", type=Path, required=True)
    audit.add_argument("--ids", required=True)
    audit.set_defaults(kind="audit")
    return result


def main(argv: Iterable[str] | None = None) -> int:
    args = parser().parse_args(argv)
    try:
        if args.kind == "audit":
            report = audit_outputs(args.data, args.assets, _ids(args.ids) or ())
        else:
            catalog = load_catalog(args.catalog)
            if args.kind == "audit-source":
                report = audit_source(args.source, args.converter_root, catalog)
            elif args.kind == "refresh-metadata":
                report = refresh_metadata(catalog, args.source, args.data_output, args.asset_output)
            else:
                report = convert_catalog(catalog, args.source, args.converter_root, args.data_output, args.asset_output, _ids(args.only))
    except ModelImportError as error:
        print(f"AGOT 模型导入失败：{error}", file=sys.stderr)
        return 1
    print(json.dumps(report.__dict__, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
