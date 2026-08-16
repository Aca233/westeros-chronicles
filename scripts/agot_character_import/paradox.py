"""Small, lossless-enough parser for Paradox script data.

The parser keeps repeated keys, nested blocks, source lines, comparison
operators, and comments needed by the AGOT character importer. It deliberately
does not evaluate script effects.
"""
from __future__ import annotations

from dataclasses import dataclass, replace


@dataclass(frozen=True)
class Token:
    kind: str
    value: str
    line: int


@dataclass(frozen=True)
class Entry:
    key: str
    value: str | None
    children: tuple["Entry", ...]
    line: int
    comments: tuple[str, ...] = ()
    operator: str = "="

    def all(self, key: str) -> list["Entry"]:
        return [child for child in self.children if child.key == key]

    def first(self, key: str) -> "Entry | None":
        return next((child for child in self.children if child.key == key), None)


def tokenize(text: str) -> list[Token]:
    tokens: list[Token] = []
    index = 0
    line = 1
    length = len(text)

    while index < length:
        char = text[index]
        if char in " \t\r":
            index += 1
            continue
        if char == "\n":
            line += 1
            index += 1
            continue
        if char == "#":
            end = text.find("\n", index)
            if end == -1:
                end = length
            tokens.append(Token("COMMENT", text[index + 1 : end].strip(), line))
            index = end
            continue
        if char == '"':
            start_line = line
            index += 1
            value: list[str] = []
            while index < length:
                current = text[index]
                if current == "\\" and index + 1 < length:
                    value.append(text[index + 1])
                    index += 2
                    continue
                if current == '"':
                    index += 1
                    break
                if current == "\n":
                    line += 1
                value.append(current)
                index += 1
            tokens.append(Token("WORD", "".join(value), start_line))
            continue
        if char == "{":
            tokens.append(Token("LBRACE", char, line))
            index += 1
            continue
        if char == "}":
            tokens.append(Token("RBRACE", char, line))
            index += 1
            continue
        if char in "=<>?":
            start = index
            while index < length and text[index] in "=<>?":
                index += 1
            tokens.append(Token("OP", text[start:index], line))
            continue

        start = index
        while index < length and text[index] not in " \t\r\n{}#=<>?\"":
            index += 1
        tokens.append(Token("WORD", text[start:index], line))

    return tokens


class _Parser:
    def __init__(self, tokens: list[Token]):
        self.tokens = tokens
        self.index = 0

    def _peek(self) -> Token | None:
        return self.tokens[self.index] if self.index < len(self.tokens) else None

    def _take(self) -> Token:
        token = self._peek()
        if token is None:
            raise ValueError("Unexpected end of Paradox document")
        self.index += 1
        return token

    def parse_entries(self, stop_at_brace: bool = False) -> tuple[list[Entry], int | None]:
        entries: list[Entry] = []
        pending_comments: list[str] = []
        closing_line: int | None = None

        while (token := self._peek()) is not None:
            if token.kind == "COMMENT":
                pending_comments.append(self._take().value)
                continue
            if token.kind == "RBRACE":
                if not stop_at_brace:
                    raise ValueError(f"Unexpected closing brace on line {token.line}")
                closing_line = self._take().line
                break
            if token.kind != "WORD":
                raise ValueError(f"Expected key on line {token.line}, found {token.value!r}")

            key_token = self._take()
            operator_token = self._peek()
            if operator_token is None or operator_token.kind != "OP":
                entry = Entry("$value", key_token.value, (), key_token.line, tuple(pending_comments), "")
                pending_comments.clear()
                entries.append(entry)
                continue

            operator = self._take().value
            value_token = self._take()
            comments = list(pending_comments)
            pending_comments.clear()

            if value_token.kind == "LBRACE":
                while (comment := self._peek()) is not None and comment.kind == "COMMENT" and comment.line == value_token.line:
                    comments.append(self._take().value)
                children, closing_line = self.parse_entries(stop_at_brace=True)
                entry = Entry(key_token.value, None, tuple(children), key_token.line, tuple(comments), operator)
                end_line = closing_line or key_token.line
            elif value_token.kind == "WORD":
                entry = Entry(key_token.value, value_token.value, (), key_token.line, tuple(comments), operator)
                end_line = value_token.line
            else:
                raise ValueError(f"Expected value for {key_token.value!r} on line {key_token.line}")

            trailing: list[str] = []
            while (comment := self._peek()) is not None and comment.kind == "COMMENT" and comment.line == end_line:
                trailing.append(self._take().value)
            if trailing:
                entry = replace(entry, comments=entry.comments + tuple(trailing))
            entries.append(entry)

        if stop_at_brace and closing_line is None:
            raise ValueError("Unclosed Paradox block")
        return entries, closing_line


def parse_document(text: str) -> list[Entry]:
    """Parse a Paradox script document while retaining repeated keys."""
    entries, _ = _Parser(tokenize(text.lstrip("\ufeff"))).parse_entries()
    return entries
