from __future__ import annotations

from io import BytesIO
from pathlib import Path

import numpy as np
from PIL import Image

from .models import ConvertedTexture, ModelImportError


def _open_resized(path: Path, max_size: int) -> Image.Image:
    if max_size <= 0:
        raise ModelImportError("贴图最大尺寸必须为正整数")
    try:
        with Image.open(path) as source:
            image = source.convert("RGBA")
    except (OSError, ValueError) as error:
        raise ModelImportError(f"无法解码贴图：{path}") from error
    scale = min(1.0, max_size / max(image.size))
    if scale < 1.0:
        size = (max(1, round(image.width * scale)), max(1, round(image.height * scale)))
        image = image.resize(size, Image.Resampling.LANCZOS)
    return image


def _encode(image: Image.Image, role: str) -> ConvertedTexture:
    output = BytesIO()
    image.save(output, format="WEBP", lossless=True, method=6, exact=True)
    return ConvertedTexture(output.getvalue(), image.width, image.height, "image/webp", role)


def convert_texture(path: Path, role: str, max_size: int) -> ConvertedTexture:
    if role not in {"diffuse", "normal"}:
        raise ModelImportError(f"未知贴图角色：{role}")
    image = _open_resized(path, max_size)
    if role == "normal":
        rgba = np.asarray(image, dtype=np.uint8).copy()
        xyz = rgba[..., :3].astype(np.float64) / 127.5 - 1.0
        lengths = np.linalg.norm(xyz, axis=-1, keepdims=True)
        xyz /= np.where(lengths < 1e-8, 1.0, lengths)
        rgba[..., :3] = np.clip(np.rint((xyz + 1.0) * 127.5), 0, 255).astype(np.uint8)
        image = Image.fromarray(rgba, "RGBA")
    return _encode(image, role)


def pack_properties(path: Path, max_size: int) -> ConvertedTexture:
    image = _open_resized(path, max_size)
    rgba = np.asarray(image, dtype=np.uint8)
    packed = rgba[..., [2, 1, 0, 3]].copy()
    return _encode(Image.fromarray(packed, "RGBA"), "occlusion-metallic-roughness")
