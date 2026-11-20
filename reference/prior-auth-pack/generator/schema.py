"""Column definitions. One declaration drives the CSV header, the writer and the data dictionary."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Iterable, List, Sequence, Tuple


@dataclass(frozen=True)
class Column:
    name: str
    kind: str          # string | integer | decimal | date | datetime | flag | code | text | enum
    group: str
    description: str
    note: str = ""     # format, units or code system


class Schema:
    def __init__(self, title: str):
        self.title = title
        self.columns: List[Column] = []
        self._names = set()

    def group(self, group: str, rows: Iterable[Sequence[str]]) -> "Schema":
        """rows are (name, kind, description) or (name, kind, description, note)."""
        for row in rows:
            name, kind, description = row[0], row[1], row[2]
            note = row[3] if len(row) > 3 else ""
            if name in self._names:
                raise ValueError("duplicate column %s" % name)
            self._names.add(name)
            self.columns.append(Column(name, kind, group, description, note))
        return self

    @property
    def names(self) -> List[str]:
        return [c.name for c in self.columns]

    def groups(self) -> Dict[str, List[Column]]:
        out: Dict[str, List[Column]] = {}
        for c in self.columns:
            out.setdefault(c.group, []).append(c)
        return out

    def check_row(self, row: Dict[str, object]) -> None:
        extra = set(row) - self._names
        if extra:
            raise KeyError("columns not in schema: %s" % sorted(extra))
