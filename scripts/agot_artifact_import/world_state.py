"""Project a restricted subset of AGOT historical artifact setup effects.

This module is intentionally not a general Paradox script interpreter. Unknown
conditions and dynamic scopes are reported rather than guessed.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Mapping, Sequence

from scripts.agot_character_import.paradox import Entry, parse_document
from scripts.agot_character_import.timeline import AgotDate


_TITLE_PREFIXES = ("e_", "k_", "d_", "c_", "b_")
_CREATE_EFFECT_RE = re.compile(r"(?:create|spawn).*_effect$", re.IGNORECASE)


@dataclass(frozen=True)
class ArtifactEffectSpec:
    definition_id: str
    unique: bool
    subcategory: str


@dataclass(frozen=True)
class CharacterSnapshot:
    id: str
    alive: bool
    born: bool
    birth_year: int | None
    dynasty_id: str | None


@dataclass(frozen=True)
class WorldStateProjection:
    artifacts: dict[str, dict[str, object]]
    issues: tuple[dict[str, object], ...]


@dataclass(frozen=True)
class _Scope:
    kind: str
    raw_id: str
    controller_id: str


@dataclass(frozen=True)
class _ConditionResult:
    value: bool | None
    reasons: tuple[str, ...] = ()


def extract_title_parents(landed_title_files: Iterable[Path]) -> dict[str, str]:
    """Extract child-to-parent title relationships from AGOT landed titles."""
    parents: dict[str, str] = {}

    def walk(entries: Sequence[Entry], parent: str | None = None) -> None:
        for entry in entries:
            is_title = entry.key.startswith(_TITLE_PREFIXES)
            next_parent = parent
            if is_title:
                if parent is not None:
                    parents.setdefault(entry.key, parent)
                next_parent = entry.key
            if entry.children:
                walk(entry.children, next_parent)

    for path in sorted((Path(item) for item in landed_title_files), key=lambda item: item.as_posix()):
        walk(parse_document(path.read_text(encoding="utf-8-sig", errors="replace")))
    return parents


def _raw_character_id(value: str) -> str:
    return value.removeprefix("character:")


def _character_id(value: str) -> str:
    raw = _raw_character_id(value)
    return raw if raw.startswith("agot:") else f"agot:{raw}"


def _title_id(value: str) -> str | None:
    if not value.startswith("title:") or not value.endswith(".holder"):
        return None
    return value.removeprefix("title:").removesuffix(".holder")


def _dynasty_id(value: str) -> str | None:
    if not value.startswith("dynasty:"):
        return None
    raw = value.removeprefix("dynasty:")
    return raw.removesuffix(".dynast")


def _resolve_title_holder(
    title_id: str,
    direct_title_holders: Mapping[str, str],
    title_parents: Mapping[str, str],
) -> str | None:
    visited: set[str] = set()
    current: str | None = title_id
    while current and current not in visited:
        visited.add(current)
        holder = direct_title_holders.get(current)
        if holder:
            return holder
        current = title_parents.get(current)
    return None


def _resolve_scope(
    value: str,
    characters: Mapping[str, CharacterSnapshot],
    direct_title_holders: Mapping[str, str],
    title_parents: Mapping[str, str],
) -> _Scope | None:
    if value.startswith("character:"):
        character_id = _character_id(value)
        if character_id not in characters:
            return None
        return _Scope("character", character_id, character_id)
    if (title_id := _title_id(value)) is not None:
        holder = _resolve_title_holder(title_id, direct_title_holders, title_parents)
        if holder is None:
            return None
        return _Scope("title", title_id, holder)
    if value.startswith("dynasty:") and value.endswith(".dynast"):
        dynasty_id = _dynasty_id(value)
        if dynasty_id is None:
            return None
        has_living_member = any(
            character.born and character.alive and character.dynasty_id == dynasty_id
            for character in characters.values()
        )
        if not has_living_member:
            return None
        return _Scope("dynasty", dynasty_id, f"dynasty:{dynasty_id}")
    return None


def _compare_dates(left: AgotDate, operator: str, right: AgotDate) -> bool | None:
    if operator == "=":
        return left == right
    if operator == ">":
        return left > right
    if operator == ">=":
        return left >= right
    if operator == "<":
        return left < right
    if operator == "<=":
        return left <= right
    return None


def _and(results: Iterable[_ConditionResult]) -> _ConditionResult:
    unknown: list[str] = []
    for result in results:
        if result.value is False:
            return _ConditionResult(False)
        if result.value is None:
            unknown.extend(result.reasons)
    if unknown:
        return _ConditionResult(None, tuple(sorted(set(unknown))))
    return _ConditionResult(True)


def _condition(
    entry: Entry,
    start_date: AgotDate,
    characters: Mapping[str, CharacterSnapshot],
    direct_title_holders: Mapping[str, str],
    title_parents: Mapping[str, str],
) -> _ConditionResult:
    if entry.key == "game_start_date" and entry.value:
        try:
            expected = AgotDate.parse(entry.value)
        except ValueError:
            return _ConditionResult(None, (f"invalid date {entry.value}",))
        value = _compare_dates(start_date, entry.operator, expected)
        return _ConditionResult(value, () if value is not None else (f"operator {entry.operator}",))

    if entry.key == "always" and entry.value in {"yes", "no"}:
        return _ConditionResult(entry.value == "yes")

    if entry.key == "exists" and entry.value:
        value = entry.value
        if value.startswith("character:"):
            return _ConditionResult(_character_id(value) in characters)
        if (title_id := _title_id(value)) is not None:
            return _ConditionResult(_resolve_title_holder(title_id, direct_title_holders, title_parents) is not None)
        if value.startswith("dynasty:"):
            dynasty_id = _dynasty_id(value)
            exists = dynasty_id is not None and any(
                character.born and character.alive and character.dynasty_id == dynasty_id
                for character in characters.values()
            )
            return _ConditionResult(exists)
        return _ConditionResult(None, (f"exists {value}",))

    if entry.key == "NOT":
        result = _and(
            _condition(child, start_date, characters, direct_title_holders, title_parents)
            for child in entry.children
        )
        return _ConditionResult(None if result.value is None else not result.value, result.reasons)

    if entry.key.startswith("character:"):
        snapshot = characters.get(_character_id(entry.key))
        if snapshot is None:
            return _ConditionResult(False)
        checks: list[_ConditionResult] = []
        for child in entry.children:
            if child.key == "is_alive" and child.value in {"yes", "no"}:
                checks.append(_ConditionResult(snapshot.alive == (child.value == "yes")))
            elif child.key == "is_adult" and child.value in {"yes", "no"}:
                adult = snapshot.birth_year is not None and start_date.ac_year - snapshot.birth_year >= 16
                checks.append(_ConditionResult(adult == (child.value == "yes")))
            else:
                checks.append(_ConditionResult(None, (f"{entry.key}.{child.key}",)))
        return _and(checks)

    if (title_id := _title_id(entry.key)) is not None:
        holder = _resolve_title_holder(title_id, direct_title_holders, title_parents)
        if holder is None:
            return _ConditionResult(False)
        snapshot = characters.get(holder)
        checks: list[_ConditionResult] = []
        for child in entry.children:
            if child.key == "is_alive" and child.value in {"yes", "no"} and snapshot is not None:
                checks.append(_ConditionResult(snapshot.alive == (child.value == "yes")))
            else:
                checks.append(_ConditionResult(None, (f"{entry.key}.{child.key}",)))
        return _and(checks)

    if entry.key.startswith("dynasty:") and entry.children:
        # Runtime house-customizer placeholders do not exist in this fixed historical snapshot.
        if len(entry.children) == 1:
            child = entry.children[0]
            if child.key == "has_character_flag" and child.value == "house_customizer_placeholder":
                return _ConditionResult(False)
        return _ConditionResult(None, (entry.key,))

    return _ConditionResult(None, (entry.key,))


def _contains_mapped_effect(entry: Entry, effect_specs: Mapping[str, ArtifactEffectSpec]) -> bool:
    if entry.key in effect_specs:
        return True
    return any(_contains_mapped_effect(child, effect_specs) for child in entry.children)


def project_artifact_world_state(
    *,
    scenario_file: Path,
    root_effect_id: str,
    helper_effect_ids: set[str],
    start_date: AgotDate,
    effect_specs: Mapping[str, ArtifactEffectSpec],
    characters: Mapping[str, CharacterSnapshot],
    direct_title_holders: Mapping[str, str],
    title_parents: Mapping[str, str],
) -> WorldStateProjection:
    """Project unique artifact creation calls from approved historical effects."""
    document = parse_document(scenario_file.read_text(encoding="utf-8-sig", errors="replace"))
    definitions = {entry.key: entry for entry in document}
    root = definitions.get(root_effect_id)
    if root is None:
        raise ValueError(f"Historical artifact effect not found: {root_effect_id}")

    artifacts: dict[str, dict[str, object]] = {}
    issues: list[dict[str, object]] = []
    call_stack: list[str] = []

    def issue(kind: str, entry: Entry, detail: str) -> None:
        issues.append({
            "kind": kind,
            "detail": detail,
            "file": scenario_file.name,
            "line": entry.line,
        })

    def emit(entry: Entry, current_scope: _Scope | None) -> None:
        spec = effect_specs[entry.key]
        if not spec.unique:
            issue("non_unique_effect", entry, entry.key)
            return

        owner_value = entry.first("OWNER")
        owner_scope = current_scope
        if owner_value and owner_value.value and owner_value.value.lower() != "this":
            owner_scope = _resolve_scope(owner_value.value, characters, direct_title_holders, title_parents)
        if owner_scope is None:
            issue("unresolved_owner", entry, entry.key)
            return

        if spec.definition_id in artifacts:
            issue("duplicate_unique_definition", entry, spec.definition_id)
            return

        if owner_scope.kind == "title" and spec.subcategory == "throne_special":
            placement: dict[str, object] = {
                "type": "title",
                "titleId": owner_scope.raw_id,
                "controllerId": owner_scope.controller_id,
            }
        elif owner_scope.kind == "dynasty":
            placement = {"type": "dynasty", "dynastyId": owner_scope.raw_id}
        else:
            placement = {"type": "character", "characterId": owner_scope.controller_id}

        artifacts[spec.definition_id] = {
            "instanceId": f"world.{spec.definition_id}",
            "definitionId": spec.definition_id,
            "lawfulControllerId": owner_scope.controller_id,
            "placement": placement,
            "equipped": False,
            "source": {
                "file": scenario_file.name,
                "line": entry.line,
                "effectId": entry.key,
            },
        }

    def process(entries: Sequence[Entry], current_scope: _Scope | None) -> None:
        index = 0
        while index < len(entries):
            entry = entries[index]
            if entry.key == "if":
                chain = [entry]
                cursor = index + 1
                while cursor < len(entries) and entries[cursor].key in {"else_if", "else"}:
                    chain.append(entries[cursor])
                    cursor += 1

                selected: Entry | None = None
                for branch in chain:
                    if branch.key == "else":
                        selected = branch
                        break
                    limit = branch.first("limit")
                    if limit is None:
                        issue("unsupported_condition", branch, "missing limit")
                        selected = None
                        break
                    result = _and(
                        _condition(child, start_date, characters, direct_title_holders, title_parents)
                        for child in limit.children
                    )
                    if result.value is None:
                        if any(_contains_mapped_effect(candidate, effect_specs) for candidate in chain):
                            issue("unsupported_condition", branch, ", ".join(result.reasons))
                        selected = None
                        break
                    if result.value:
                        selected = branch
                        break
                if selected is not None:
                    process(tuple(child for child in selected.children if child.key != "limit"), current_scope)
                index = cursor
                continue

            if entry.key in {"else_if", "else"}:
                issue("orphan_branch", entry, entry.key)
                index += 1
                continue

            if entry.key in effect_specs:
                emit(entry, current_scope)
                index += 1
                continue

            if entry.key in helper_effect_ids:
                helper = definitions.get(entry.key)
                if helper is None:
                    issue("missing_helper_effect", entry, entry.key)
                elif entry.key in call_stack:
                    issue("recursive_helper_effect", entry, entry.key)
                else:
                    call_stack.append(entry.key)
                    process(helper.children, current_scope)
                    call_stack.pop()
                index += 1
                continue

            if entry.key in definitions and entry.key.endswith("_effect") and "assign_starting" in entry.key:
                issue("unsupported_helper_effect", entry, entry.key)
                index += 1
                continue

            if entry.key.startswith(("character:", "title:", "dynasty:")):
                resolved = _resolve_scope(entry.key, characters, direct_title_holders, title_parents)
                if resolved is None:
                    if entry.operator != "?=" and _contains_mapped_effect(entry, effect_specs):
                        issue("unresolved_scope", entry, entry.key)
                else:
                    process(entry.children, resolved)
                index += 1
                continue

            if _CREATE_EFFECT_RE.search(entry.key):
                issue("missing_definition", entry, entry.key)
                index += 1
                continue

            if entry.children and _contains_mapped_effect(entry, effect_specs):
                issue("unsupported_scope", entry, entry.key)
            index += 1

    call_stack.append(root_effect_id)
    process(root.children, None)
    call_stack.pop()

    ordered_artifacts = {key: artifacts[key] for key in sorted(artifacts)}
    ordered_issues = tuple(sorted(issues, key=lambda item: (str(item["kind"]), str(item["detail"]), int(item["line"]))))
    return WorldStateProjection(ordered_artifacts, ordered_issues)
