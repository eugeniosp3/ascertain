"""Field parsing, row transformation, patient rules, and the export projection."""

import traceback
from datetime import UTC, date, datetime
from decimal import Decimal

import pytest

from patient_data.errors import PatientDataError
from patient_data.models import ProfileDetails
from patient_data.patient_rules import (
    FIELD_GROUPS,
    FIELD_NAMES,
    PATIENT_FIELDS,
    allergy_projection,
    build_patient_record,
    field_destinations,
    invariant_issues,
    parse_conditions,
    section_fields,
)
from patient_data.settings import DATASET_DATE
from patient_data.utils.transformations import (
    FieldKind,
    FieldRule,
    FieldValueError,
    RowTransformer,
    parse_decimal,
    parse_flag,
    parse_integer,
    parse_iso_date,
    parse_utc_timestamp,
    restore_source_scale,
    split_semicolon_list,
)

from .helpers import Rows, column

RULES = {rule.name: rule for rule in PATIENT_FIELDS}


@pytest.mark.parametrize("text, value", [("0", 0), ("42", 42), ("-7", -7)])
def test_integer_accepts_complete_values(text: str, value: int) -> None:
    assert parse_integer(text) == value


@pytest.mark.parametrize("text", ["007", "1.0", " 1", "1 ", "+1", "1e3", "", "9" * 20])
def test_integer_rejects_partial_padded_or_oversized_values(text: str) -> None:
    with pytest.raises(FieldValueError):
        parse_integer(text)


def test_decimal_is_exact_and_keeps_written_precision() -> None:
    assert parse_decimal("72.0") == Decimal("72.0")
    assert str(parse_decimal("72.0")) == "72.0"
    assert parse_decimal("1.1000000") == Decimal("1.1")  # trailing zeros do not add precision
    assert parse_decimal("-0.5") == Decimal("-0.5")


@pytest.mark.parametrize("text", ["1.1234567", "1000000000000", "1e3", ".5", "5.", "NaN", "0x1"])
def test_decimal_rejects_excess_precision_overflow_and_non_plain_forms(text: str) -> None:
    with pytest.raises(FieldValueError):
        parse_decimal(text)


def test_dates_and_timestamps_are_strict() -> None:
    assert parse_iso_date("2026-11-18") == date(2026, 11, 18)
    for bad in ("2026-02-30", "2026-1-01", "20261118", "2026-11-18T00:00:00Z"):
        with pytest.raises(FieldValueError):
            parse_iso_date(bad)
    assert parse_utc_timestamp("2021-03-04T14:22:31Z") == datetime(
        2021, 3, 4, 14, 22, 31, tzinfo=UTC
    )
    for bad in ("2021-03-04T14:22:31+00:00", "2021-03-04 14:22:31Z", "2021-03-04T25:00:00Z"):
        with pytest.raises(FieldValueError):
            parse_utc_timestamp(bad)


def test_flags_map_only_y_and_n() -> None:
    assert parse_flag("Y") is True and parse_flag("N") is False
    for bad in ("y", "Yes", "1", "true"):
        with pytest.raises(FieldValueError):
            parse_flag(bad)


def test_error_messages_never_contain_the_value() -> None:
    secret = "SECRET-VALUE-123"
    for kind in FieldKind:
        rule = FieldRule("field", kind)
        with pytest.raises(FieldValueError) as caught:
            rule.parse(secret) if kind is not FieldKind.TEXT else FieldRule(
                "field", kind, pattern=r"[0-9]+"
            ).parse(secret)
        assert secret not in str(caught.value)
        assert secret not in "".join(traceback.format_exception(caught.value))


def test_blank_policy_is_explicit_per_field() -> None:
    assert RULES["middle_initial"].parse("") is None
    assert RULES["secondary_payer_name"].parse("") is None
    assert RULES["drug_allergies"].parse("") is None
    with pytest.raises(FieldValueError, match="blank"):
        RULES["date_of_birth"].parse("")
    with pytest.raises(FieldValueError, match="blank"):
        RULES["has_ckd"].parse("")  # unknown is not false


def test_meaningful_text_values_are_preserved_exactly() -> None:
    assert RULES["has_diabetes"].parse("None") == "None"  # a category, not a null
    assert RULES["drug_allergies"].parse("NKDA") == "NKDA"
    assert RULES["mrn"].parse("00123456") == "00123456"  # leading zeros survive
    assert RULES["zip"].parse("02134") == "02134"
    narrative = "Losartan 50 mg daily; Atorvastatin 40 mg nightly"
    assert RULES["active_medications"].parse(narrative) == narrative
    with pytest.raises(FieldValueError):
        RULES["has_diabetes"].parse("none")
    with pytest.raises(FieldValueError):
        RULES["mrn"].parse("1234567")


def test_row_transformer_collects_every_issue_in_a_row() -> None:
    transformer = RowTransformer(
        [
            FieldRule("a", FieldKind.INTEGER),
            FieldRule("b", FieldKind.DATE),
            FieldRule("c", FieldKind.FLAG),
        ]
    )
    row, issues = transformer.transform(3, ["x", "2026-13-01", "Y"])
    assert row is None
    assert [(i.row_number, i.field) for i in issues] == [(3, "a"), (3, "b")]
    row, issues = transformer.transform(4, ["1"])
    assert row is None and issues[0].field == "*"
    row, issues = transformer.transform(5, ["1", "2026-01-01", "N"])
    assert issues == [] and row is not None
    assert row.clean == (1, date(2026, 1, 1), False)
    assert row.raw == ("1", "2026-01-01", "N")


def test_header_issues_name_missing_extra_and_reordered_columns() -> None:
    transformer = RowTransformer([FieldRule("a", FieldKind.TEXT), FieldRule("b", FieldKind.TEXT)])
    assert transformer.header_issues(["a", "b"]) == []
    assert "missing column(s): ['b']" in transformer.header_issues(["a"])
    assert "unexpected column(s): ['z']" in transformer.header_issues(["a", "b", "z"])
    assert transformer.header_issues(["b", "a"]) == [
        "columns are present but not in the contract order"
    ]


def test_restore_source_scale_keeps_value_and_written_digits() -> None:
    assert str(restore_source_scale(Decimal("72.000000"), "72.0")) == "72.0"
    with pytest.raises(FieldValueError):
        restore_source_scale(Decimal("72.1"), "72.0")


def test_lists_split_on_semicolons_and_reject_empty_items() -> None:
    assert split_semicolon_list("I10; E78.5") == ["I10", "E78.5"]
    with pytest.raises(FieldValueError):
        split_semicolon_list("I10;; E78.5")


def test_conditions_pair_codes_and_labels_and_reject_mismatches() -> None:
    conditions = parse_conditions("I10; E78.5", "Hypertension; Hyperlipidemia, unspecified")
    assert [(c.code, c.label) for c in conditions] == [
        ("I10", "Hypertension"),
        ("E78.5", "Hyperlipidemia, unspecified"),
    ]
    with pytest.raises(FieldValueError, match="2 diagnosis code"):
        parse_conditions("I10; E78.5", "Hypertension")
    with pytest.raises(FieldValueError):
        parse_conditions("not-a-code", "Label")


def test_allergy_status_distinguishes_no_known_unknown_and_reported() -> None:
    assert allergy_projection("NKDA") == ("no_known", [])
    assert allergy_projection(None) == ("unknown", [])
    assert allergy_projection("Penicillin (rash)") == ("reported", ["Penicillin (rash)"])


def test_rules_cover_the_76_source_columns_in_order(real_rows: tuple[list[str], Rows]) -> None:
    assert len(PATIENT_FIELDS) == 76
    assert list(FIELD_NAMES) == real_rows[0]


def test_every_field_has_an_export_destination_and_sections_match_models() -> None:
    destinations = field_destinations()
    assert set(destinations) == set(FIELD_NAMES)
    assert all(len(targets) >= 2 for targets in destinations.values())  # + source_record
    sections = [group.section for group in FIELD_GROUPS if group.section]
    assert sections == list(ProfileDetails.model_fields)
    for section in sections:
        annotation = ProfileDetails.model_fields[section].annotation
        assert annotation is not None
        assert tuple(annotation.model_fields) == section_fields(section)


def test_all_real_rows_pass_rules_and_invariants(real_rows: tuple[list[str], Rows]) -> None:
    transformer = RowTransformer(PATIENT_FIELDS)
    rows, issues = transformer.transform_all(enumerate(real_rows[1], start=1))
    assert issues == []
    assert invariant_issues(rows, DATASET_DATE) == []


def test_invariants_detect_duplicates_and_bad_dates(real_rows: tuple[list[str], Rows]) -> None:
    header, source = real_rows
    first, second = list(source[0]), list(source[1])
    second[column(header, "patient_id")] = first[column(header, "patient_id")]
    second[column(header, "updated_at")] = "2001-01-01T00:00:00Z"
    second[column(header, "age_years")] = "3"
    rows, issues = RowTransformer(PATIENT_FIELDS).transform_all([(1, first), (2, second)])
    assert issues == []
    found = {(i.row_number, i.field) for i in invariant_issues(rows, DATASET_DATE)}
    assert {(1, "patient_id"), (2, "updated_at"), (2, "age_years")} <= found


def test_record_projection_follows_the_draft_mapping(real_rows: tuple[list[str], Rows]) -> None:
    header, source = real_rows
    values = list(source[0])
    values[column(header, "mobile_phone")] = ""
    row, issues = RowTransformer(PATIENT_FIELDS).transform(1, values)
    assert row is not None and not issues
    record = build_patient_record(row.clean_values(), row.raw_values())
    raw = row.raw_values()
    assert record.source_patient_id == raw["patient_id"]
    assert record.postal_code == raw["zip"]
    assert record.phone == raw["home_phone"]  # mobile blank -> home
    assert record.profile_details.contact.mobile_phone is None
    assert record.last_visit.isoformat() == raw["pcp_last_visit_date"]
    assert record.blood_type is None and record.address_line2 is None
    assert record.status == "active"
    assert record.source_record == raw
    assert str(record.profile_details.clinical.weight_kg) == raw["weight_kg"]
    assert record.profile_details.social.pa_request_count == int(raw["pa_request_count"])


def test_record_projection_requires_all_fields(real_rows: tuple[list[str], Rows]) -> None:
    row, _ = RowTransformer(PATIENT_FIELDS).transform(1, real_rows[1][0])
    assert row is not None
    raw = row.raw_values()
    raw.pop("bmi")
    with pytest.raises(PatientDataError):
        build_patient_record(row.clean_values(), raw)
