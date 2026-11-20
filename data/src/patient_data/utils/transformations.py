"""Reusable field rules and row transformation, independent of any one dataset.

``FieldRule`` describes one source column; ``RowTransformer`` applies an ordered set of
rules to whole rows and collects every problem instead of stopping at the first. Parser
errors deliberately describe the expected shape, never the offending value, so reports can
be shared without leaking patient data.
"""

import re
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from datetime import UTC, date, datetime
from decimal import Decimal, InvalidOperation
from enum import StrEnum
from typing import TypeAlias, TypeVar

CleanValue: TypeAlias = str | int | Decimal | date | datetime | bool | None
_Number = TypeVar("_Number", int, Decimal)

BIGINT_MIN = -(2**63)
BIGINT_MAX = 2**63 - 1
DECIMAL_PRECISION = 18
DECIMAL_SCALE = 6

_INTEGER = re.compile(r"-?(?:0|[1-9][0-9]*)")
_DECIMAL = re.compile(r"-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?")
_DATE = re.compile(r"[0-9]{4}-[0-9]{2}-[0-9]{2}")
_UTC_TIMESTAMP = re.compile(r"[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z")
_FLAGS = {"Y": True, "N": False}


class FieldValueError(ValueError):
    """A value does not satisfy its field rule. The message never contains the value."""


class FieldKind(StrEnum):
    TEXT = "text"
    INTEGER = "integer"
    DECIMAL = "decimal"
    DATE = "date"
    DATETIME = "datetime"
    FLAG = "flag"


# DDL type used to create the clean column, and the name DuckDB's catalog reports for it.
DUCKDB_DDL_TYPES: dict[FieldKind, str] = {
    FieldKind.TEXT: "VARCHAR",
    FieldKind.INTEGER: "BIGINT",
    FieldKind.DECIMAL: f"DECIMAL({DECIMAL_PRECISION},{DECIMAL_SCALE})",
    FieldKind.DATE: "DATE",
    FieldKind.DATETIME: "TIMESTAMPTZ",
    FieldKind.FLAG: "BOOLEAN",
}
DUCKDB_CATALOG_TYPES: dict[FieldKind, str] = {
    **DUCKDB_DDL_TYPES,
    FieldKind.DATETIME: "TIMESTAMP WITH TIME ZONE",
}


def parse_integer(text: str) -> int:
    """Parse a complete base-10 integer that fits in a signed 64-bit column."""
    if _INTEGER.fullmatch(text) is None:
        raise FieldValueError("expected a base-10 integer without sign padding or leading zeros")
    value = int(text)
    if not BIGINT_MIN <= value <= BIGINT_MAX:
        raise FieldValueError("integer is outside the BIGINT range")
    return value


def parse_decimal(text: str) -> Decimal:
    """Parse an exact decimal that fits DECIMAL(18,6) without rounding.

    Trailing fractional zeros beyond six places are accepted because they do not change
    the value; any other excess precision or integer overflow is rejected.
    """
    if _DECIMAL.fullmatch(text) is None:
        raise FieldValueError("expected a plain decimal number such as 12.5")
    try:
        value = Decimal(text)
    except InvalidOperation as error:  # pragma: no cover - the pattern already guards this
        raise FieldValueError("expected a plain decimal number such as 12.5") from error
    exponent = value.normalize().as_tuple().exponent
    if isinstance(exponent, int) and exponent < -DECIMAL_SCALE:
        raise FieldValueError(
            f"decimal has more than {DECIMAL_SCALE} significant fractional digits"
        )
    if abs(value) >= Decimal(10) ** (DECIMAL_PRECISION - DECIMAL_SCALE):
        raise FieldValueError(f"decimal does not fit DECIMAL({DECIMAL_PRECISION},{DECIMAL_SCALE})")
    return value


def parse_iso_date(text: str) -> date:
    """Parse a complete ``YYYY-MM-DD`` calendar date."""
    if _DATE.fullmatch(text) is None:
        raise FieldValueError("expected a YYYY-MM-DD date")
    try:
        return date.fromisoformat(text)
    except ValueError as error:
        raise FieldValueError("not a valid calendar date") from error


def parse_utc_timestamp(text: str) -> datetime:
    """Parse the documented UTC instant form ``YYYY-MM-DDTHH:MM:SSZ``."""
    if _UTC_TIMESTAMP.fullmatch(text) is None:
        raise FieldValueError("expected a UTC timestamp such as 2021-03-04T14:22:31Z")
    try:
        return datetime.strptime(text, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=UTC)
    except ValueError as error:
        raise FieldValueError("not a valid calendar date and time") from error


def parse_flag(text: str) -> bool:
    """Map ``Y``/``N`` to true/false; any other value is an error, not a null."""
    try:
        return _FLAGS[text]
    except KeyError as error:
        raise FieldValueError("expected Y or N") from error


def split_semicolon_list(text: str) -> list[str]:
    """Split a ``;``-separated list, trimming item padding and rejecting empty items."""
    items = [item.strip() for item in text.split(";")]
    if any(not item for item in items):
        raise FieldValueError("list contains an empty item")
    return items


def restore_source_scale(value: Decimal, raw: str) -> Decimal:
    """Return ``value`` with the fractional digits written in ``raw`` (for example ``72.0``).

    DuckDB stores DECIMAL(18,6), so ``72.0`` reads back as ``72.000000``. This keeps the
    exact value and the source's measurement precision, and fails if the two disagree.
    """
    source = parse_decimal(raw)
    if value != source:
        raise FieldValueError("clean decimal does not equal its original value")
    return value.quantize(source)


@dataclass(frozen=True)
class FieldRule:
    """How one source column is validated and converted.

    ``optional`` fields map an empty string to a typed null; required fields reject it.
    ``pattern`` and ``allowed`` constrain text exactly as written (no normalization), and
    ``minimum`` bounds numeric kinds.
    """

    name: str
    kind: FieldKind
    optional: bool = False
    pattern: str | None = None
    allowed: frozenset[str] | None = None
    minimum: int | None = None
    description: str = ""

    def __post_init__(self) -> None:
        if self.kind is not FieldKind.TEXT and (self.pattern or self.allowed):
            raise ValueError(f"{self.name}: pattern/allowed apply only to text fields")
        if self.minimum is not None and self.kind not in (FieldKind.INTEGER, FieldKind.DECIMAL):
            raise ValueError(f"{self.name}: minimum applies only to numeric fields")

    @property
    def duckdb_type(self) -> str:
        return DUCKDB_DDL_TYPES[self.kind]

    def parse(self, raw: str) -> CleanValue:
        """Convert one original string, raising ``FieldValueError`` when it is invalid."""
        if raw == "":
            if self.optional:
                return None
            raise FieldValueError("required value is blank")
        match self.kind:
            case FieldKind.TEXT:
                return self._parse_text(raw)
            case FieldKind.INTEGER:
                return self._check_minimum(parse_integer(raw))
            case FieldKind.DECIMAL:
                return self._check_minimum(parse_decimal(raw))
            case FieldKind.DATE:
                return parse_iso_date(raw)
            case FieldKind.DATETIME:
                return parse_utc_timestamp(raw)
            case FieldKind.FLAG:
                return parse_flag(raw)

    def _parse_text(self, raw: str) -> str:
        if self.pattern is not None and re.fullmatch(self.pattern, raw) is None:
            raise FieldValueError(f"does not match the expected format {self.pattern}")
        if self.allowed is not None and raw not in self.allowed:
            raise FieldValueError(f"not one of the allowed values {sorted(self.allowed)}")
        return raw

    def _check_minimum(self, value: _Number) -> _Number:
        if self.minimum is not None and value < self.minimum:
            raise FieldValueError(f"must be at least {self.minimum}")
        return value


@dataclass(frozen=True)
class FieldIssue:
    """A row/field problem; ``row_number`` is the one-based data record (header excluded)."""

    row_number: int
    field: str
    message: str

    def __str__(self) -> str:
        return f"row {self.row_number}, field {self.field}: {self.message}"


@dataclass(frozen=True)
class TransformedRow:
    """Original strings and converted values for one record, in rule order."""

    row_number: int
    raw: tuple[str, ...]
    clean: tuple[CleanValue, ...]
    field_names: tuple[str, ...]

    def clean_values(self) -> dict[str, CleanValue]:
        return dict(zip(self.field_names, self.clean, strict=True))

    def raw_values(self) -> dict[str, str]:
        return dict(zip(self.field_names, self.raw, strict=True))


class RowTransformer:
    """Apply an ordered tuple of field rules to rows, collecting all issues."""

    def __init__(self, rules: Sequence[FieldRule]) -> None:
        names = [rule.name for rule in rules]
        duplicates = sorted({name for name in names if names.count(name) > 1})
        if duplicates:
            raise ValueError(f"duplicate field rules: {duplicates}")
        if not rules:
            raise ValueError("at least one field rule is required")
        self.rules: tuple[FieldRule, ...] = tuple(rules)
        self.field_names: tuple[str, ...] = tuple(names)

    def header_issues(self, header: Sequence[str]) -> list[str]:
        """Describe missing, unexpected, duplicated, or reordered columns."""
        expected = list(self.field_names)
        actual = list(header)
        if actual == expected:
            return []
        issues: list[str] = []
        missing = [name for name in expected if name not in actual]
        unexpected = [name for name in actual if name not in expected]
        repeated = sorted({name for name in actual if actual.count(name) > 1})
        if missing:
            issues.append(f"missing column(s): {missing}")
        if unexpected:
            issues.append(f"unexpected column(s): {unexpected}")
        if repeated:
            issues.append(f"repeated column(s): {repeated}")
        if not issues:
            issues.append("columns are present but not in the contract order")
        return issues

    def transform(
        self, row_number: int, values: Sequence[str]
    ) -> tuple[TransformedRow | None, list[FieldIssue]]:
        """Convert one row; return ``(None, issues)`` if any field fails."""
        if len(values) != len(self.rules):
            return None, [
                FieldIssue(
                    row_number,
                    "*",
                    f"expected {len(self.rules)} values but found {len(values)}",
                )
            ]
        clean: list[CleanValue] = []
        issues: list[FieldIssue] = []
        for rule, raw in zip(self.rules, values, strict=True):
            if not isinstance(raw, str):
                issues.append(FieldIssue(row_number, rule.name, "original value is not text"))
                continue
            try:
                clean.append(rule.parse(raw))
            except FieldValueError as error:
                issues.append(FieldIssue(row_number, rule.name, str(error)))
        if issues:
            return None, issues
        row = TransformedRow(row_number, tuple(values), tuple(clean), self.field_names)
        return row, []

    def transform_all(
        self, rows: Iterable[tuple[int, Sequence[str]]]
    ) -> tuple[list[TransformedRow], list[FieldIssue]]:
        """Convert every row and return all successful rows plus all issues found."""
        transformed: list[TransformedRow] = []
        issues: list[FieldIssue] = []
        for row_number, values in rows:
            row, row_issues = self.transform(row_number, values)
            issues.extend(row_issues)
            if row is not None:
                transformed.append(row)
        return transformed, issues
