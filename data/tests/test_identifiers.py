"""Behavioral guarantees for stable patient-only lineage."""

import hashlib
import json
from collections.abc import Callable
from datetime import date, datetime
from pathlib import Path
from uuid import NAMESPACE_URL, UUID, uuid5

import pytest

from patient_data.utils.identifiers import (
    bronze_id,
    canonical_json,
    dataset_key,
    export_id,
    row_checksum,
    sha256_bytes,
    sha256_file,
    silver_id,
    source_file_id,
)

SOURCE_PATH = "prior-auth-pack/data/patients_100.csv"
CHECKSUM = hashlib.sha256(b"original patient bytes").hexdigest()


def contract_id(layer: str, values: list[str]) -> UUID:
    namespace = uuid5(NAMESPACE_URL, f"ascertain:data:{layer}:v1")
    payload = json.dumps(values, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return uuid5(namespace, payload)


def test_ids_match_contract_and_repeat() -> None:
    file_id = source_file_id(SOURCE_PATH, CHECKSUM)
    bronze = bronze_id(file_id, 1)
    silver = silver_id(bronze, "rules-v1")
    export = export_id(file_id, "rules-v1", "contract-v1")
    assert file_id == contract_id("source_file", [SOURCE_PATH, CHECKSUM])
    assert bronze == contract_id("bronze", [str(file_id), "1"])
    assert silver == contract_id("silver", [str(bronze), "rules-v1"])
    assert export == contract_id("export", [str(file_id), "rules-v1", "contract-v1"])
    assert file_id == source_file_id(SOURCE_PATH, CHECKSUM)
    assert bronze == bronze_id(file_id, 1)
    assert silver == silver_id(bronze, "rules-v1")
    assert export == export_id(file_id, "rules-v1", "contract-v1")
    assert all(identifier.version == 5 for identifier in [file_id, bronze, silver, export])
    assert len({file_id, bronze, silver, export, bronze_id(file_id, 2)}) == 5
    assert silver != silver_id(bronze_id(file_id, 2), "rules-v1")


def test_source_and_version_changes_propagate() -> None:
    file_id = source_file_id(SOURCE_PATH, CHECKSUM)
    changed_files = [
        source_file_id("prior-auth-pack/data/renamed_patients.csv", CHECKSUM),
        source_file_id(SOURCE_PATH, sha256_bytes(b"changed original bytes")),
    ]
    bronze = bronze_id(file_id, 1)
    for changed in changed_files:
        assert changed != file_id
        assert bronze_id(changed, 1) != bronze
        assert silver_id(bronze_id(changed, 1), "v1") != silver_id(bronze, "v1")
        assert export_id(changed, "v1", "v1") != export_id(file_id, "v1", "v1")
    assert silver_id(bronze, "v1") != silver_id(bronze, "v2")
    assert export_id(file_id, "v1", "v1") != export_id(file_id, "v2", "v1")
    assert export_id(file_id, "v1", "v1") != export_id(file_id, "v1", "v2")


def test_canonical_json_unicode_and_sorted_keys() -> None:
    assert canonical_json({"z": "café", "a": ["00123", ""]}) == ('{"a":["00123",""],"z":"café"}')


def test_rows_preserve_values_and_unambiguous_boundaries() -> None:
    values = ["00123", "", "first\nsecond\r\nthird", 'a,"b"', "患者"]
    expected = '["00123","","first\\nsecond\\r\\nthird","a,\\"b\\"","患者"]'
    assert row_checksum(values) == hashlib.sha256(expected.encode("utf-8")).hexdigest()
    assert row_checksum(values) == row_checksum(tuple(values))
    assert row_checksum(["00123"]) != row_checksum(["123"])
    assert row_checksum(["a\nb", "c"]) != row_checksum(["a", "b\nc"])
    assert row_checksum(["a", "b"]) != row_checksum(["b", "a"])
    assert row_checksum([""]) != row_checksum([])


def test_streamed_file_hash_matches_bytes(tmp_path: Path) -> None:
    content = b"\x00patient\r\n" * 300_000  # More than one streamed chunk.
    path = tmp_path / "source.csv"
    path.write_bytes(content)
    assert sha256_file(path) == sha256_bytes(content) == hashlib.sha256(content).hexdigest()
    path.write_bytes(b"")
    assert sha256_file(path) == sha256_bytes(b"")
    with pytest.raises(FileNotFoundError):
        sha256_file(tmp_path / "missing.csv")


def test_dataset_key_uses_iso_date_and_lowercase_uuid() -> None:
    identifier = UUID("ABCDEFAB-1234-5678-9ABC-ABCDEFABCDEF")
    assert dataset_key(date(2026, 11, 18), identifier) == (
        "patients-2026-11-18-abcdefab-1234-5678-9abc-abcdefabcdef"
    )


@pytest.mark.parametrize(
    "path",
    [
        "",
        " ",
        "/tmp/patients.csv",
        "../patients.csv",
        "a/../p.csv",
        "./p.csv",
        "a//p.csv",
        "a/",
        "C:/patients.csv",
        "C:patients.csv",
        "a\\p.csv",
        "a\x00.csv",
    ],
)
def test_source_rejects_unstable_paths(path: str) -> None:
    with pytest.raises(ValueError, match="repository-relative"):
        source_file_id(path, CHECKSUM)


@pytest.mark.parametrize("checksum", ["", "a" * 63, "a" * 65, "g" * 64, " " + "a" * 64])
def test_source_rejects_invalid_checksums(checksum: str) -> None:
    with pytest.raises(ValueError, match="SHA-256"):
        source_file_id(SOURCE_PATH, checksum)


def test_checksum_hex_case_has_one_identity() -> None:
    assert source_file_id(SOURCE_PATH, CHECKSUM.upper()) == source_file_id(SOURCE_PATH, CHECKSUM)


@pytest.mark.parametrize("row", [0, -1, True, 1.5, "1"])
def test_bronze_rejects_invalid_record_numbers(row: object) -> None:
    # model/API boundaries can supply runtime types outside the typed signature.
    with pytest.raises(ValueError, match="positive integer"):
        bronze_id(source_file_id(SOURCE_PATH, CHECKSUM), row)  # type: ignore[arg-type]


@pytest.mark.parametrize("version", ["", " ", "\n"])
def test_versions_must_be_nonempty(version: str) -> None:
    file_id = source_file_id(SOURCE_PATH, CHECKSUM)
    with pytest.raises(ValueError, match="transformation_version"):
        silver_id(bronze_id(file_id, 1), version)
    with pytest.raises(ValueError, match="transformation_version"):
        export_id(file_id, version, "v1")
    with pytest.raises(ValueError, match="contract_version"):
        export_id(file_id, "v1", version)


@pytest.mark.parametrize(
    "operation",
    [
        lambda: bronze_id("bad", 1),  # type: ignore[arg-type]
        lambda: silver_id("bad", "v1"),  # type: ignore[arg-type]
        lambda: export_id("bad", "v1", "v1"),  # type: ignore[arg-type]
        lambda: dataset_key(date(2026, 11, 18), "bad"),  # type: ignore[arg-type]
    ],
)
def test_bad_uuid_inputs_fail_clearly(operation: Callable[[], object]) -> None:
    with pytest.raises(ValueError, match="UUID"):
        operation()


def test_dataset_key_rejects_datetime() -> None:
    with pytest.raises(ValueError, match="date without a time"):
        dataset_key(datetime(2026, 11, 18, 12), source_file_id(SOURCE_PATH, CHECKSUM))


def test_row_checksum_rejects_non_string_values() -> None:
    with pytest.raises(ValueError, match="sequence of strings"):
        row_checksum("not an array")
    with pytest.raises(ValueError, match="sequence of strings"):
        row_checksum([123])  # type: ignore[list-item]
