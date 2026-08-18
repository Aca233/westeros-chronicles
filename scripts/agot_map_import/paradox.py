from __future__ import annotations

from pathlib import Path

from scripts.agot_character_import.paradox import Entry, Token, parse_document, tokenize

__all__ = ["Entry", "Token", "parse_document", "parse_file", "tokenize"]


def parse_file(path: Path) -> list[Entry]:
    return parse_document(path.read_text(encoding="utf-8-sig", errors="replace"))
