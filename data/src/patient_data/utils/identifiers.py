"""Contract UUIDv5 lineage and SHA-256 checksums, without filesystem-dependent identity."""

import hashlib
import json
import re
from collections.abc import Sequence
from datetime import date, datetime
from pathlib import Path, PureWindowsPath
from uuid import NAMESPACE_URL, UUID, uuid5

_SOURCE_NAMESPACE = uuid5(NAMESPACE_URL, "ascertain:data:source_file:v1")
_BRONZE_NAMESPACE = uuid5(NAMESPACE_URL, "ascertain:data:bronze:v1")
_SILVER_NAMESPACE = uuid5(NAMESPACE_URL, "ascertain:data:silver:v1")
_EXPORT_NAMESPACE = uuid5(NAMESPACE_URL, "ascertain:data:export:v1")


def canonical_json(value: object) -> str:
    """Serialize with the exact compact JSON settings used by the data contract."""
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def sha256_bytes(data: bytes) -> str:
    """Return the lowercase SHA-256 digest of original bytes."""
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: Path) -> str:
    """Hash a file incrementally so memory use does not grow with file size."""
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def row_checksum(values: Sequence[str]) -> str:
    """Hash ordered original strings, preserving blanks, newlines and leading zeroes."""
    if isinstance(values, str | bytes) or any(not isinstance(value, str) for value in values):
        raise ValueError("row values must be a sequence of strings")
    return sha256_bytes(canonical_json(list(values)).encode("utf-8"))


def _uuid_string(value: UUID, name: str) -> str:
    if not isinstance(value, UUID):
        raise ValueError(f"{name} must be a UUID")
    return str(value)


def _version(value: str, name: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{name} must be a nonempty string")
    return value


def source_file_id(source_path: str, checksum: str) -> UUID:
    """Identify original bytes at a canonical repository-relative POSIX path."""
    if (
        not isinstance(source_path, str)
        or not source_path.strip()
        or source_path.startswith("/")
        or PureWindowsPath(source_path).drive
        or "\\" in source_path
        or any(part in {"", ".", ".."} for part in source_path.split("/"))
        or "\x00" in source_path
    ):
        raise ValueError(
            "source_path must be a repository-relative POSIX path without dot segments"
        )
    if not isinstance(checksum, str) or re.fullmatch(r"[0-9a-fA-F]{64}", checksum) is None:
        raise ValueError("checksum must be a 64-character hexadecimal SHA-256 digest")
    return uuid5(_SOURCE_NAMESPACE, canonical_json([source_path, checksum.lower()]))


def bronze_id(file_id: UUID, row_number: int) -> UUID:
    """Identify a one-based parsed CSV data record (excluding the header)."""
    file_value = _uuid_string(file_id, "file_id")
    if isinstance(row_number, bool) or not isinstance(row_number, int) or row_number < 1:
        raise ValueError("row_number must be a positive integer")
    return uuid5(_BRONZE_NAMESPACE, canonical_json([file_value, str(row_number)]))


def silver_id(bronze_id: UUID, transformation_version: str) -> UUID:
    """Identify a bronze row transformed with the supplied rules version."""
    return uuid5(
        _SILVER_NAMESPACE,
        canonical_json(
            [
                _uuid_string(bronze_id, "bronze_id"),
                _version(transformation_version, "transformation_version"),
            ]
        ),
    )


def export_id(file_id: UUID, transformation_version: str, contract_version: str) -> UUID:
    """Identify the patient export for a source, rules version and contract version."""
    return uuid5(
        _EXPORT_NAMESPACE,
        canonical_json(
            [
                _uuid_string(file_id, "file_id"),
                _version(transformation_version, "transformation_version"),
                _version(contract_version, "contract_version"),
            ]
        ),
    )


def dataset_key(dataset_date: date, export_id: UUID) -> str:
    """Return the package directory and seed marker key."""
    if not isinstance(dataset_date, date) or isinstance(dataset_date, datetime):
        raise ValueError("dataset_date must be a date without a time component")
    return f"patients-{dataset_date.isoformat()}-{_uuid_string(export_id, 'export_id')}"
