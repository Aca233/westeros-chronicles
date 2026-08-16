"""Project AGOT character history to a campaign start date."""
from __future__ import annotations

from dataclasses import dataclass

from .characters import ATTRIBUTE_KEYS
from .model import CharacterHistory
from .paradox import Entry


@dataclass(frozen=True, order=True)
class AgotDate:
    year: int
    month: int
    day: int

    @classmethod
    def parse(cls, raw: str) -> "AgotDate":
        parts = raw.split(".")
        if len(parts) != 3:
            raise ValueError(f"Invalid AGOT date: {raw}")
        year, month, day = (int(part) for part in parts)
        if year < 1 or not 1 <= month <= 12 or not 1 <= day <= 31:
            raise ValueError(f"Invalid AGOT date: {raw}")
        return cls(year, month, day)

    @property
    def ac_year(self) -> int:
        return self.year - 8000

    def __str__(self) -> str:
        return f"{self.year}.{self.month}.{self.day}"


@dataclass(frozen=True)
class ProjectedRelation:
    kind: str
    target_id: str


@dataclass(frozen=True)
class ProjectedCharacter:
    raw_id: str
    start_date: AgotDate
    display_year: int
    born: bool
    alive: bool
    birth_date: AgotDate | None
    death_date: AgotDate | None
    death_reason: str | None
    killer_id: str | None
    traits: tuple[str, ...]
    spouse_ids: tuple[str, ...]
    base_attributes: dict[str, int]
    relations: tuple[ProjectedRelation, ...]
    applied_operations: tuple[str, ...]
    unsupported_operations: tuple[str, ...]


def _scalar(entry: Entry, key: str) -> str | None:
    child = entry.first(key)
    return child.value if child else None


def _relation(entry: Entry) -> ProjectedRelation | None:
    relation_kinds = {
        "set_relation_friend": "friend",
        "set_relation_lover": "lover",
        "set_relation_rival": "rival",
        "set_relation_nemesis": "nemesis",
        "set_relation_guardian": "guardian",
    }
    kind = relation_kinds.get(entry.key)
    if not kind:
        return None
    target = entry.value or _scalar(entry, "target")
    return ProjectedRelation(kind, target) if target else None


def project_character(history: CharacterHistory, start_date: AgotDate) -> ProjectedCharacter:
    traits = list(dict.fromkeys(history.undated_traits))
    spouses: list[str] = []
    attributes = dict(history.base_attributes)
    relations: list[ProjectedRelation] = []
    applied: list[str] = []
    unsupported: list[str] = []

    birth_events = [event for event in history.dated_events if event.entry.first("birth") is not None]
    born = not birth_events
    birth_date: AgotDate | None = None
    death_date: AgotDate | None = None
    death_reason: str | None = None
    killer_id: str | None = None

    for dated_event in history.dated_events:
        event_date = AgotDate.parse(dated_event.raw_date)
        if event_date > start_date:
            continue
        for operation in dated_event.entry.children:
            key = operation.key
            if key == "birth" and operation.value == "yes":
                born = True
                birth_date = event_date
                applied.append("birth")
            elif key == "death":
                death_date = event_date
                if operation.value and operation.value != "yes":
                    death_reason = operation.value
                else:
                    death_reason = _scalar(operation, "death_reason")
                    killer_id = _scalar(operation, "killer")
                applied.extend(filter(None, ("death", death_reason)))
            elif key == "trait" and operation.value:
                if operation.value not in traits:
                    traits.append(operation.value)
                applied.append(f"trait:{operation.value}")
            elif key in {"remove_trait", "make_trait_inactive"} and operation.value:
                traits = [trait for trait in traits if trait != operation.value]
                applied.append(f"{key}:{operation.value}")
            elif key == "add_spouse" and operation.value:
                if operation.value not in spouses:
                    spouses.append(operation.value)
                applied.append(f"add_spouse:{operation.value}")
            elif key in {"remove_spouse", "remove_spouse_from_history"} and operation.value:
                spouses = [spouse for spouse in spouses if spouse != operation.value]
                applied.append(f"{key}:{operation.value}")
            elif key in ATTRIBUTE_KEYS and operation.value:
                try:
                    attributes[key] = int(operation.value)
                    applied.append(f"attribute:{key}")
                except ValueError:
                    unsupported.append(f"{event_date}:{key}={operation.value}")
            elif (relation := _relation(operation)) is not None:
                relations = [existing for existing in relations if existing.kind != relation.kind or existing.target_id != relation.target_id]
                relations.append(relation)
                applied.append(f"relation:{relation.kind}:{relation.target_id}")
            elif key in {"add_character_flag", "set_character_flag"}:
                applied.append(f"flag:{operation.value}")
            elif key not in {"effect"}:
                unsupported.append(f"{event_date}:{key}")

    alive = born and death_date is None
    return ProjectedCharacter(
        raw_id=history.raw_id,
        start_date=start_date,
        display_year=start_date.ac_year,
        born=born,
        alive=alive,
        birth_date=birth_date,
        death_date=death_date,
        death_reason=death_reason,
        killer_id=killer_id,
        traits=tuple(traits),
        spouse_ids=tuple(spouses),
        base_attributes=attributes,
        relations=tuple(relations),
        applied_operations=tuple(applied),
        unsupported_operations=tuple(unsupported),
    )
