from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path, PurePosixPath

EXPECTED_SOURCE_ID = "2962333032"
CONVERTER_COMMIT = "2249e35f80a1cc04ba4c2b8e4c650f36b18085db"


class ModelImportError(RuntimeError):
    """Raised when a landmark input cannot be published safely."""


@dataclass(frozen=True)
class Correction:
    position_offset: tuple[float, float, float] = (0.0, 0.0, 0.0)
    rotation_offset: tuple[float, float, float, float] = (0.0, 0.0, 0.0, 1.0)
    scale_multiplier: tuple[float, float, float] = (1.0, 1.0, 1.0)
    reason: str = ""


@dataclass(frozen=True)
class LandmarkCatalogEntry:
    id: str
    name: str
    location_id: str
    province_id: int
    asset: PurePosixPath
    variant: str | None = None
    corrections: Correction | None = None


@dataclass(frozen=True)
class LandmarkCatalog:
    schema_version: int
    source_id: str
    landmarks: tuple[LandmarkCatalogEntry, ...]

    @property
    def ids(self) -> tuple[str, ...]:
        return tuple(item.id for item in self.landmarks)


@dataclass(frozen=True)
class TextureSet:
    diffuse: Path
    normal: Path
    properties: Path


@dataclass(frozen=True)
class MaterialBinding:
    name: str
    mesh_index: int
    textures: TextureSet
    shader: str


@dataclass(frozen=True)
class AssetComponent:
    name: str
    mesh_path: Path
    scale: float
    materials: tuple[MaterialBinding, ...]


@dataclass(frozen=True)
class AssetDefinition:
    components: tuple[AssetComponent, ...]

    @property
    def mesh_path(self) -> Path:
        if len(self.components) != 1:
            raise ModelImportError("多组件 asset 没有单一 mesh_path")
        return self.components[0].mesh_path

    @property
    def scale(self) -> float:
        if len(self.components) != 1:
            raise ModelImportError("多组件 asset 没有单一 scale")
        return self.components[0].scale

    @property
    def materials(self) -> tuple[MaterialBinding, ...]:
        if len(self.components) != 1:
            raise ModelImportError("多组件 asset 没有单一 materials")
        return self.components[0].materials


@dataclass(frozen=True)
class MeshPrimitive:
    name: str
    positions: tuple[tuple[float, float, float], ...]
    normals: tuple[tuple[float, float, float], ...]
    tangents: tuple[tuple[float, float, float, float], ...]
    uv0: tuple[tuple[float, float], ...]
    indices: tuple[int, ...]
    material_name: str


@dataclass(frozen=True)
class StaticMesh:
    primitives: tuple[MeshPrimitive, ...]


@dataclass(frozen=True)
class Locator:
    id: int
    position: tuple[float, float, float]
    rotation: tuple[float, float, float, float]
    scale: tuple[float, float, float]


@dataclass(frozen=True)
class ResolvedTransform:
    map_x: float
    map_y: float
    elevation_meters: float
    rotation: tuple[float, float, float, float]
    scale: tuple[float, float, float]


@dataclass(frozen=True)
class ConvertedTexture:
    data: bytes
    width: int
    height: int
    mime_type: str
    role: str


@dataclass(frozen=True)
class GlbBounds:
    minimum: tuple[float, float, float]
    maximum: tuple[float, float, float]


@dataclass(frozen=True)
class GlbReport:
    bytes: int
    triangle_count: int
    bounds: GlbBounds
    texture_sizes: tuple[tuple[int, int], ...]
    sha256: str
