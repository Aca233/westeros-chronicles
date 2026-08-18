from __future__ import annotations

import csv
import re
from dataclasses import dataclass
from pathlib import Path

from PIL import Image

from .models import MapImportError, ProvinceDefinition


SOURCE_ID = "2962333032"
REAL_MAP_SIZE = (9216, 6144)
DEFAULT_FILE_KEYS = ("definitions", "provinces", "rivers", "adjacencies")
FIXED_MAP_FILES = ("heightmap.png", "mask-baronyroad.png")
DEFAULT_FILE_PATTERN = re.compile(r'^\s*([a-z_]+)\s*=\s*"([^"/\\]+)"', re.MULTILINE)
REMOTE_ID_PATTERN = re.compile(r'^\s*remote_file_id\s*=\s*"?([0-9]+)"?', re.MULTILINE)


@dataclass(frozen=True, slots=True)
class MapSource:
    root: Path
    source_id: str
    map_size: tuple[int, int]
    default_files: dict[str, Path]
    heightmap: Path
    road_mask: Path
    geographical_regions: Path
    landed_titles: Path

    @classmethod
    def open(
        cls,
        root: Path,
        expected_size: tuple[int, int] | None = None,
    ) -> "MapSource":
        root = root.expanduser().resolve()
        descriptor = root / "descriptor.mod"
        if not descriptor.is_file():
            raise MapImportError(f"AGOT 地图源缺少 descriptor.mod：{root}")
        descriptor_text = descriptor.read_text(encoding="utf-8-sig", errors="replace")
        source_id_match = REMOTE_ID_PATTERN.search(descriptor_text)
        source_id = source_id_match.group(1) if source_id_match else ""
        if source_id != SOURCE_ID:
            raise MapImportError(f"地图源必须是 AGOT Workshop {SOURCE_ID}，实际为 {source_id or '未声明'}")

        map_data = root / "map_data"
        default_map = map_data / "default.map"
        if not default_map.is_file():
            raise MapImportError(f"AGOT 地图源缺少 map_data/default.map：{root}")
        default_files = _parse_default_files(default_map, map_data)
        for filename in FIXED_MAP_FILES:
            path = map_data / filename
            if not path.is_file():
                raise MapImportError(f"AGOT 地图源缺少 map_data/{filename}")

        geographical_regions = map_data / "geographical_regions"
        landed_titles = root / "common" / "landed_titles"
        if not any(geographical_regions.glob("*.txt")):
            raise MapImportError("AGOT 地图源缺少 geographical_regions 文本")
        if not any(landed_titles.glob("*.txt")):
            raise MapImportError("AGOT 地图源缺少 common/landed_titles 文本")

        required_size = expected_size or REAL_MAP_SIZE
        _validate_image(default_files["provinces"], required_size, {"RGB"}, "省份图必须为 RGB")
        _validate_image(map_data / "heightmap.png", required_size, {"I;16", "I;16B"}, "高度图必须为 16 位")
        _validate_image(default_files["rivers"], required_size, {"P", "RGB", "RGBA"}, "河流图模式不受支持")
        _validate_image(map_data / "mask-baronyroad.png", required_size, {"L", "P", "RGB", "RGBA"}, "道路遮罩模式不受支持")
        parse_definition(default_files["definitions"])

        return cls(
            root=root,
            source_id=source_id,
            map_size=required_size,
            default_files=default_files,
            heightmap=map_data / "heightmap.png",
            road_mask=map_data / "mask-baronyroad.png",
            geographical_regions=geographical_regions,
            landed_titles=landed_titles,
        )


def _parse_default_files(default_map: Path, map_data: Path) -> dict[str, Path]:
    text = default_map.read_text(encoding="utf-8-sig", errors="replace")
    declared = dict(DEFAULT_FILE_PATTERN.findall(text))
    resolved: dict[str, Path] = {}
    for key in DEFAULT_FILE_KEYS:
        filename = declared.get(key)
        if not filename:
            raise MapImportError(f"default.map 未声明 {key}")
        path = map_data / filename
        if not path.is_file():
            raise MapImportError(f"default.map 引用的文件不存在：{filename}")
        resolved[key] = path
    return resolved


def _validate_image(
    path: Path,
    expected_size: tuple[int, int],
    allowed_modes: set[str],
    mode_message: str,
) -> None:
    try:
        with Image.open(path) as image:
            if image.size != expected_size:
                width, height = expected_size
                raise MapImportError(f"{path.name} 尺寸必须为 {width}x{height}，实际为 {image.width}x{image.height}")
            if image.mode not in allowed_modes:
                raise MapImportError(f"{path.name} {mode_message}，实际为 {image.mode}")
    except MapImportError:
        raise
    except OSError as error:
        raise MapImportError(f"无法读取地图图像 {path.name}：{error}") from error


def parse_definition(path: Path) -> dict[int, ProvinceDefinition]:
    definitions: dict[int, ProvinceDefinition] = {}
    colours: dict[tuple[int, int, int], int] = {}
    with path.open("r", encoding="utf-8-sig", errors="replace", newline="") as handle:
        for line_number, row in enumerate(csv.reader(handle, delimiter=";"), start=1):
            if not row or all(not column.strip() for column in row):
                continue
            if len(row) < 5:
                raise MapImportError(f"definition.csv 第 {line_number} 行字段不足")
            try:
                province_id, red, green, blue = (int(row[index].strip()) for index in range(4))
            except ValueError as error:
                raise MapImportError(f"definition.csv 第 {line_number} 行存在非整数 ID 或颜色") from error
            if province_id < 0 or any(channel < 0 or channel > 255 for channel in (red, green, blue)):
                raise MapImportError(f"definition.csv 第 {line_number} 行 ID 或颜色越界")
            if province_id in definitions:
                raise MapImportError(f"definition.csv 省份 ID 重复：{province_id}")
            rgb = red, green, blue
            if rgb in colours:
                raise MapImportError(f"definition.csv 颜色重复：{rgb} 用于 {colours[rgb]} 和 {province_id}")
            name = row[4].strip()
            if not name:
                raise MapImportError(f"definition.csv 第 {line_number} 行缺少省份名称")
            definition = ProvinceDefinition(
                province_id=province_id,
                red=red,
                green=green,
                blue=blue,
                name=name,
                comment=row[5].strip() if len(row) > 5 else "",
            )
            definitions[province_id] = definition
            colours[rgb] = province_id
    if not definitions:
        raise MapImportError("definition.csv 没有省份定义")
    return definitions
