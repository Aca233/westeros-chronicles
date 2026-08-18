from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "public/data/tv-timeline/westeros_chronological_timeline.json"
SEARCH_INDEX = ROOT / "public/data/agot-characters/search-index.json"
OUTPUT = ROOT / "src/data/generated/canonicalTimeline.ts"

DYNASTY_ALIASES = {
    "史塔克": "dynn_Stark",
    "兰尼斯特": "dynn_Lannister",
    "拜拉席恩": "dynn_Baratheon",
    "坦格利安": "dynn_Targaryen",
    "徒利": "dynn_Tully",
    "艾林": "dynn_Arryn",
    "葛雷乔伊": "dynn_Greyjoy",
    "提利尔": "dynn_Tyrell",
    "马泰尔": "dynn_Martell",
    "佛雷": "dynn_Frey",
    "波顿": "dynn_Bolton",
    "莫尔蒙": "dynn_Mormont",
    "塔利": "dynn_Tarly",
    "克里冈": "dynn_Clegane",
    "戴恩": "dynn_Dayne",
    "贝里席": "dynn_Baelish",
    "席渥斯": "dynn_Seaworth",
    "瑞德": "dynn_Reed",
    "布蕾妮": "dynn_Tarth",
}

EXPLICIT_IDS = {
    "艾德·史塔克": "agot:Stark_3",
    "奈德·史塔克": "agot:Stark_3",
    "琼恩·雪诺": "agot:Stark_7",
    "丹妮莉丝·坦格利安": "agot:Targaryen_9",
    "劳勃·拜拉席恩": "agot:Baratheon_2",
    "凯特琳·史塔克": "agot:Tully_4",
    "凯特琳·徒利": "agot:Tully_4",
}

DATE_DAY = {"上": 5, "中": 15, "下": 25}


def machine_date(year: int, display: str) -> dict[str, int]:
    match = re.search(r"(\d+)月(?:(\d+)日|([上中下])旬)?", display)
    if not match:
        raise ValueError(f"无法解析时间线日期: {display}")
    month = int(match.group(1))
    day = int(match.group(2)) if match.group(2) else DATE_DAY.get(match.group(3), 15)
    if not 1 <= month <= 12 or day < 1:
        raise ValueError(f"时间线日期越界: {display}")
    # The runtime calendar uses twelve 30-day months. Source dates on the 31st
    # are normalized to the first day of the following month without changing
    # their original display label.
    while day > 30:
        day -= 30
        month += 1
    while month > 12:
        month -= 12
        year += 1
    return {"year": year, "month": month, "day": day}


def clean_person_name(raw: str) -> str:
    value = re.sub(r"\s*\([^)]*\)\s*", "", raw).strip()
    value = re.sub(r"^(国王|王后|首相|学士|爵士|公爵|夫人|卡奥)", "", value).strip()
    return value


def build_lookup(index: list[dict]) -> dict[tuple[str, str], list[dict]]:
    lookup: dict[tuple[str, str], list[dict]] = {}
    for row in index:
        dynasty = row.get("dynastyId")
        name = row.get("name")
        if not dynasty or not name or row.get("canonTier") not in {"canon", "semicanon"}:
            continue
        lookup.setdefault((name, dynasty.lower()), []).append(row)
    return lookup


def resolve_person(name: str, year: int, lookup: dict[tuple[str, str], list[dict]]) -> dict[str, str]:
    result = {"name": name}
    if name in EXPLICIT_IDS:
        result["characterId"] = EXPLICIT_IDS[name]
        return result
    if "·" not in name:
        return result
    given, surname = name.split("·", 1)
    dynasty = DYNASTY_ALIASES.get(surname)
    if not dynasty:
        return result
    candidates = []
    for row in lookup.get((given, dynasty.lower()), []):
        born = row.get("birthYear")
        died = row.get("deathYear")
        if born is not None and born > year:
            continue
        if died is not None and died < year:
            continue
        candidates.append(row)
    if len(candidates) == 1:
        result["characterId"] = candidates[0]["id"]
    return result


def split_fatalities(values: list[str]) -> list[str]:
    output: list[str] = []
    for value in values:
        for part in re.split(r"\s*(?:&|、|与)\s*", value):
            cleaned = clean_person_name(part)
            if cleaned:
                output.append(cleaned)
    return output


def build() -> list[dict]:
    source = json.loads(SOURCE.read_text(encoding="utf-8"))
    index = json.loads(SEARCH_INDEX.read_text(encoding="utf-8"))
    lookup = build_lookup(index)
    events: list[dict] = []
    for year_block in source["years"]:
        year = int(year_block["year_ac"])
        for raw in year_block["events"]:
            participant_names = [clean_person_name(name) for name in raw.get("characters", [])]
            fatality_names = split_fatalities(raw.get("fatalities", []))
            events.append({
                "id": raw["id"],
                "date": machine_date(year, raw["date_display"]),
                "dateDisplay": raw["date_display"],
                "title": raw["title"],
                "summary": raw["summary"],
                "region": raw["region"],
                "regionTag": raw["region_tag"],
                "category": raw["category"],
                "participants": [resolve_person(name, year, lookup) for name in participant_names],
                "fatalities": [resolve_person(name, year, lookup) for name in fatality_names],
                "consequences": raw.get("key_consequences", []),
            })
    events.sort(key=lambda event: (event["date"]["year"], event["date"]["month"], event["date"]["day"], event["id"]))
    ids = [event["id"] for event in events]
    if len(events) != source["total_events"] or len(ids) != len(set(ids)):
        raise ValueError("时间线事件数量或 ID 唯一性校验失败")
    return events


def main() -> None:
    events = build()
    payload = json.dumps(events, ensure_ascii=False, indent=2)
    text = (
        "import type { CanonicalTimelineEvent } from '../../features/world/canonicalTimeline';\n\n"
        "// Generated by scripts/build_canonical_timeline.py. Do not edit by hand.\n"
        f"export const CANONICAL_TIMELINE = {payload} as const satisfies readonly CanonicalTimelineEvent[];\n"
    )
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(text, encoding="utf-8")
    print(f"Generated {len(events)} canonical timeline events -> {OUTPUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
