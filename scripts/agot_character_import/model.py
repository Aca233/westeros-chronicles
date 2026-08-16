"""Normalized AGOT character import models."""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path

from .paradox import Entry


class CanonTier(str, Enum):
    CANON = "canon"
    SEMICANON = "semicanon"
    MOD_SUPPORTING = "mod_supporting"
    GENEALOGY = "genealogy"
    TECHNICAL = "technical"


@dataclass(frozen=True)
class DatedEvent:
    raw_date: str
    entry: Entry


@dataclass(frozen=True)
class CharacterHistory:
    raw_id: str
    tier: CanonTier
    source_file: Path
    source_line: int
    name_key: str | None
    dynasty: str | None
    father_id: str | None
    mother_id: str | None
    culture: str | None
    faith: str | None
    sexuality: str | None
    base_attributes: dict[str, int] = field(default_factory=dict)
    undated_traits: tuple[str, ...] = ()
    dated_events: tuple[DatedEvent, ...] = ()
    flags: tuple[str, ...] = ()
    has_dna: bool = False
    comments: tuple[str, ...] = ()
