"""CSV output. Columns come from the schema; keys starting with '_' are internal and dropped."""
from __future__ import annotations

import csv
from pathlib import Path
from typing import Dict, Iterable, List

from .schema import Schema


def public(row: Dict[str, object]) -> Dict[str, object]:
    return {k: v for k, v in row.items() if not k.startswith("_")}


def write_csv(path: Path, schema: Schema, rows: Iterable[Dict[str, object]]) -> List[Dict[str, object]]:
    cleaned: List[Dict[str, object]] = []
    for row in rows:
        pub = public(row)
        schema.check_row(pub)
        cleaned.append(pub)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=schema.names, extrasaction="raise", lineterminator="\n")
        writer.writeheader()
        for pub in cleaned:
            writer.writerow({name: pub.get(name, "") for name in schema.names})
    return cleaned
