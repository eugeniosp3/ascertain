"""Fixture types and CSV-writing helpers, independent of pytest's conftest plugin."""

import csv
import io
from collections.abc import Callable, Sequence
from pathlib import Path

from patient_data.settings import StageSettings

Rows = list[list[str]]
MakeRepo = Callable[..., StageSettings]


def write_csv(path: Path, header: Sequence[str], rows: Sequence[Sequence[str]]) -> None:
    buffer = io.StringIO(newline="")
    writer = csv.writer(buffer, lineterminator="\n")
    writer.writerow(header)
    writer.writerows(rows)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(buffer.getvalue().encode("utf-8"))


def column(header: Sequence[str], name: str) -> int:
    return list(header).index(name)
