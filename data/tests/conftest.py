"""Patient fixtures: isolated temporary repositories built from the real source rows.

Tests never write to the real ``data/`` directory. Each fixture repository holds a copy
(or an edited subset) of ``patients_100.csv`` at the contract source path; the original
file is only read.
"""

import csv
import io
from collections.abc import Callable, Sequence
from pathlib import Path

import pytest

from patient_data.settings import StageSettings

REAL_SOURCE = StageSettings().source_file

Rows = list[list[str]]
MakeRepo = Callable[..., StageSettings]


def read_real_rows() -> tuple[list[str], Rows]:
    with REAL_SOURCE.open(newline="", encoding="utf-8") as stream:
        records = list(csv.reader(stream))
    return records[0], records[1:]


def write_csv(path: Path, header: Sequence[str], rows: Sequence[Sequence[str]]) -> None:
    buffer = io.StringIO(newline="")
    writer = csv.writer(buffer, lineterminator="\n")
    writer.writerow(header)
    writer.writerows(rows)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(buffer.getvalue().encode("utf-8"))


@pytest.fixture(scope="session")
def real_rows() -> tuple[list[str], Rows]:
    return read_real_rows()


@pytest.fixture
def make_repo(tmp_path: Path, real_rows: tuple[list[str], Rows]) -> MakeRepo:
    """Return a factory: ``make_repo(rows=None, header=None, name="repo")`` -> settings.

    With no rows it uses all 100 real rows. The settings' expected row count follows the
    number of rows written so small fixtures are valid.
    """

    def factory(
        rows: Sequence[Sequence[str]] | None = None,
        header: Sequence[str] | None = None,
        name: str = "repo",
        expected_row_count: int | None = None,
    ) -> StageSettings:
        root = tmp_path / name
        chosen_rows = [list(r) for r in real_rows[1]] if rows is None else [list(r) for r in rows]
        settings = StageSettings(
            repo_root=root,
            expected_row_count=expected_row_count or max(len(chosen_rows), 1),
        )
        write_csv(settings.source_file, header or real_rows[0], chosen_rows)
        return settings

    return factory


def column(header: Sequence[str], name: str) -> int:
    return list(header).index(name)


@pytest.fixture(scope="session")
def exported_package(tmp_path_factory: pytest.TempPathFactory) -> Path:
    """A real 100-patient package built from the source rows in an isolated repository."""
    from patient_data.export import export_package
    from patient_data.stages import build_bronze, build_silver

    root = tmp_path_factory.mktemp("package-repo")
    header, rows = read_real_rows()
    settings = StageSettings(repo_root=root)
    write_csv(settings.source_file, header, rows)
    build_bronze(settings)
    build_silver(settings)
    return export_package(settings).path
