"""Bounded, agent-readable discovery of usable original components."""

import json
from pathlib import Path
from typing import Any


def search_catalogue(path: Path, query):
    catalogue = json.loads(path.read_text())
    text = query.get("q", [""])[0].strip().casefold()
    selected = query.get("definition", [None])[0]
    limit = int(query.get("limit", [12])[0])
    offset = int(query.get("offset", [0])[0])
    if not 1 <= limit <= 50 or offset < 0:
        raise ValueError("Use limit 1–50 and a nonnegative offset")
    entries: list[dict[str, Any]] = []
    for key, definition in catalogue["definitions"].items():
        if selected is not None and key != selected:
            continue
        aliases = definition.get("aliases", [])
        exact = text in [
            key.casefold(),
            definition["id"].casefold(),
            definition["name"].casefold(),
        ]
        alias = text in [value.casefold() for value in aliases]
        searchable = " ".join(
            [
                key,
                definition["name"],
                definition["family"],
                definition.get("description", ""),
                *aliases,
                *definition.get("tags", []),
            ]
        ).casefold()
        if (
            selected is None
            and text
            and not all(word in searchable for word in text.split())
        ):
            continue
        entries.append(
            {
                "key": key,
                "match": "exact-name"
                if text and exact
                else "exact-alias"
                if text and alias
                else "candidate"
                if text
                else "browse",
                "definition": definition,
            }
        )
    if selected is None and text:
        direct = {entry["key"] for entry in entries}
        related = {
            key for entry in entries for key in entry["definition"].get("related", [])
        }
        for key, definition in catalogue["definitions"].items():
            if key not in direct and (
                key in related or direct.intersection(definition.get("related", []))
            ):
                entries.append(
                    {"key": key, "match": "related-type", "definition": definition}
                )
    entries.sort(
        key=lambda item: (
            {
                "exact-name": 0,
                "exact-alias": 0,
                "candidate": 1,
                "browse": 1,
                "related-type": 2,
            }[item["match"]],
            item["definition"]["name"].casefold(),
            item["key"],
        )
    )
    if selected is not None and not entries:
        raise KeyError("Unknown component definition")
    return {
        "query": text,
        "total": len(entries),
        "offset": offset,
        "limit": limit,
        "entries": entries[offset : offset + limit],
        "license": catalogue.get("license"),
        "artwork": catalogue.get("artwork"),
        "relationships": (
            "Aliases name the same definition; related entries remain distinct "
            "types, not interchangeable aliases."
        ),
    }
