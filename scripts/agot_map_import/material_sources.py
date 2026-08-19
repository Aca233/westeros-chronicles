from __future__ import annotations

from collections import OrderedDict
from dataclasses import dataclass
from pathlib import Path

from PIL import Image

from .material_catalog import TerrainMaterial
from .models import MapImportError


@dataclass(frozen=True, slots=True)
class MaterialSourceRoots:
    agot: Path
    ck3: Path


def _terrain_root(root: Path) -> Path:
    return (root.expanduser().resolve() / "gfx" / "map" / "terrain").resolve()


def _safe_candidate(root: Path, relative: str) -> Path:
    candidate = (root / relative).resolve()
    try:
        candidate.relative_to(root)
    except ValueError as error:
        raise MapImportError(f"地形材质路径越出来源目录：{relative}") from error
    return candidate


def resolve_diffuse(material: TerrainMaterial, roots: MaterialSourceRoots) -> Path:
    for source_root in (_terrain_root(roots.agot), _terrain_root(roots.ck3)):
        candidate = _safe_candidate(source_root, material.diffuse)
        if candidate.is_file():
            return candidate
    raise MapImportError(f"地形材质 {material.id} 缺少 Diffuse：{material.diffuse}")


class MaterialTextureCache:
    def __init__(self, roots: MaterialSourceRoots, max_bytes: int = 268_435_456):
        if max_bytes <= 0:
            raise MapImportError("地形材质缓存上限必须为正整数")
        self._roots = roots
        self._max_bytes = int(max_bytes)
        self._bytes = 0
        self._images: OrderedDict[Path, tuple[Image.Image, int]] = OrderedDict()

    def get(self, material: TerrainMaterial) -> Image.Image:
        path = resolve_diffuse(material, self._roots)
        cached = self._images.get(path)
        if cached is not None:
            self._images.move_to_end(path)
            return cached[0]
        try:
            with Image.open(path) as opened:
                image = opened.convert("RGB")
                image.load()
        except OSError as error:
            raise MapImportError(f"无法解码地形材质 {path.name}：{error}") from error
        size = image.width * image.height * 3
        self._images[path] = (image, size)
        self._bytes += size
        while self._bytes > self._max_bytes and len(self._images) > 1:
            old_path, (old_image, old_size) = self._images.popitem(last=False)
            if old_path == path:
                self._images[old_path] = (old_image, old_size)
                self._images.move_to_end(old_path)
                continue
            self._bytes -= old_size
            old_image.close()
        return image

    def close(self) -> None:
        for image, _ in self._images.values():
            image.close()
        self._images.clear()
        self._bytes = 0
