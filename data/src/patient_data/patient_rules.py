"""Patient-specific field rules, cross-field invariants, and the export projection.

Everything that knows about ``patients_100.csv`` lives here; the generic machinery is in
``utils.transformations``. Types, formats, and allowed values come from the source
dictionary (``reference/prior-auth-pack/generator/schema_patient.py``). Text is never normalized:
patterns and allowed values validate it exactly as written.

Null policy: only fields declared ``optional`` accept an empty string, which becomes a
typed null in silver. Every other blank is an error. ``None`` (diabetes) and ``NKDA``
(allergies) are ordinary values, never nulls.
"""

import re
from collections import defaultdict
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from typing import Literal, TypeVar

from patient_data.errors import PatientDataError
from patient_data.models import (
    CareTeamProfile,
    ClinicalProfile,
    Condition,
    ContactProfile,
    CoverageProfile,
    ExportModel,
    IdentityProfile,
    LabsProfile,
    PatientRecord,
    ProfileDetails,
    SocialProfile,
)
from patient_data.utils.transformations import (
    CleanValue,
    FieldIssue,
    FieldKind,
    FieldRule,
    FieldValueError,
    TransformedRow,
    restore_source_scale,
    split_semicolon_list,
)

TEXT, INTEGER, DECIMAL = FieldKind.TEXT, FieldKind.INTEGER, FieldKind.DECIMAL
DATE, DATETIME, FLAG = FieldKind.DATE, FieldKind.DATETIME, FieldKind.FLAG

PHONE = r"\([0-9]{3}\) [0-9]{3}-[0-9]{4}"
ICD10_CODE = r"[A-Z][0-9][0-9A-Z](?:\.[0-9A-Z]{1,4})?"


def _one_of(*values: str) -> frozenset[str]:
    return frozenset(values)


@dataclass(frozen=True)
class FieldGroup:
    """A source dictionary group and the ``profile_details`` section it feeds (if any)."""

    title: str
    section: str | None
    rules: tuple[FieldRule, ...]


FIELD_GROUPS: tuple[FieldGroup, ...] = (
    FieldGroup(
        "Identity",
        "identity",
        (
            FieldRule("patient_id", TEXT, pattern=r"PT-[0-9]{4}"),
            FieldRule("mrn", TEXT, pattern=r"[0-9]{8}", description="Text; keeps leading zeros."),
            FieldRule("first_name", TEXT),
            FieldRule("middle_initial", TEXT, optional=True, pattern=r"[A-Z]"),
            FieldRule("last_name", TEXT),
            FieldRule("date_of_birth", DATE),
            FieldRule("age_years", INTEGER, minimum=0),
            FieldRule("sex_at_birth", TEXT, allowed=_one_of("F", "M")),
            FieldRule(
                "gender_identity", TEXT, allowed=_one_of("Woman", "Man", "Non-binary", "Declined")
            ),
            FieldRule("race", TEXT),
            FieldRule(
                "ethnicity", TEXT, allowed=_one_of("Hispanic or Latino", "Not Hispanic or Latino")
            ),
            FieldRule("preferred_language", TEXT),
            FieldRule("interpreter_needed", FLAG),
            FieldRule("marital_status", TEXT),
            FieldRule("employment_status", TEXT),
        ),
    ),
    FieldGroup(
        "Contact",
        "contact",
        (
            FieldRule("address_line1", TEXT),
            FieldRule("city", TEXT),
            FieldRule("state", TEXT, pattern=r"[A-Z]{2}"),
            FieldRule("zip", TEXT, pattern=r"[0-9]{5}", description="Text; keeps leading zeros."),
            FieldRule("home_phone", TEXT, optional=True, pattern=PHONE),
            FieldRule("mobile_phone", TEXT, optional=True, pattern=PHONE),
            FieldRule("email", TEXT, pattern=r"[^@\s]+@[^@\s]+\.[^@\s]+"),
            FieldRule("emergency_contact_name", TEXT),
            FieldRule("emergency_contact_relationship", TEXT),
            FieldRule("emergency_contact_phone", TEXT, pattern=PHONE),
        ),
    ),
    FieldGroup(
        "Care team and registration",
        "care_team",
        (
            FieldRule("pcp_name", TEXT),
            FieldRule("pcp_npi", TEXT, pattern=r"[0-9]{10}"),
            FieldRule("pcp_last_visit_date", DATE),
            FieldRule("home_facility_key", TEXT, pattern=r"[A-Z0-9]+"),
            FieldRule("first_registered_date", DATE),
        ),
    ),
    FieldGroup(
        "Coverage on file",
        "coverage",
        (
            FieldRule("primary_payer_name", TEXT),
            FieldRule(
                "primary_line_of_business",
                TEXT,
                allowed=_one_of(
                    "Commercial", "Medicare Advantage", "Medicaid Managed Care", "ACA Marketplace"
                ),
            ),
            FieldRule("primary_plan_name", TEXT),
            FieldRule(
                "primary_plan_type", TEXT, allowed=_one_of("HMO", "PPO", "EPO", "POS", "HMO-POS")
            ),
            FieldRule("primary_member_id", TEXT),
            FieldRule(
                "primary_group_number",
                TEXT,
                optional=True,
                description="Blank for individual, Medicare and Medicaid coverage.",
            ),
            FieldRule("primary_coverage_effective_date", DATE),
            FieldRule("secondary_payer_name", TEXT, optional=True),
            FieldRule("secondary_member_id", TEXT, optional=True),
        ),
    ),
    FieldGroup(
        "Clinical profile",
        "clinical",
        (
            FieldRule("primary_clinical_story", TEXT),
            FieldRule("height_cm", DECIMAL, minimum=0, description="centimetres"),
            FieldRule("weight_kg", DECIMAL, minimum=0, description="kilograms"),
            FieldRule("bmi", DECIMAL, minimum=0, description="kg/m2"),
            FieldRule("smoking_status", TEXT, allowed=_one_of("Never", "Former", "Current")),
            FieldRule("alcohol_use", TEXT, allowed=_one_of("None", "Social", "Moderate", "Heavy")),
            FieldRule("problem_list_icd10", TEXT, description="Semicolon list of ICD-10-CM codes."),
            FieldRule("problem_list_text", TEXT, description="Descriptions in code order."),
            FieldRule("has_hypertension", FLAG),
            FieldRule(
                "has_diabetes",
                TEXT,
                allowed=_one_of("None", "Type 1", "Type 2"),
                description="'None' is a category, not a null.",
            ),
            FieldRule("has_ckd", FLAG),
            FieldRule("has_copd", FLAG),
            FieldRule("has_heart_failure", FLAG),
            FieldRule("has_cad", FLAG),
            FieldRule("has_afib", FLAG),
            FieldRule("has_osa", FLAG),
            FieldRule("has_depression", FLAG),
            FieldRule("has_obesity", FLAG),
            FieldRule("has_cancer_history", FLAG),
            FieldRule("charlson_comorbidity_index", INTEGER, minimum=0),
            FieldRule(
                "active_medications",
                TEXT,
                optional=True,
                description="Semicolon list kept as text; blank means none documented.",
            ),
            FieldRule(
                "drug_allergies",
                TEXT,
                optional=True,
                description="'NKDA' means no known allergies; blank means unknown.",
            ),
        ),
    ),
    FieldGroup(
        "Recent labs and utilization",
        "labs",
        (
            FieldRule("last_labs_date", DATE),
            FieldRule("last_hba1c_pct", DECIMAL, minimum=0, description="percent"),
            FieldRule("last_egfr", INTEGER, minimum=0, description="mL/min/1.73m2"),
            FieldRule("last_creatinine_mg_dl", DECIMAL, minimum=0, description="mg/dL"),
            FieldRule("last_ldl_mg_dl", INTEGER, minimum=0, description="mg/dL"),
            FieldRule("last_hemoglobin_g_dl", DECIMAL, minimum=0, description="g/dL"),
            FieldRule("hospitalizations_12mo", INTEGER, minimum=0),
            FieldRule("ed_visits_12mo", INTEGER, minimum=0),
        ),
    ),
    FieldGroup(
        "Social and administrative",
        "social",
        (
            FieldRule(
                "housing_status", TEXT, allowed=_one_of("Stable", "Unstable", "Lives with family")
            ),
            FieldRule("transportation_barrier", FLAG),
            FieldRule("advance_directive_on_file", FLAG),
            FieldRule("code_status", TEXT, allowed=_one_of("Full code", "DNR", "Not documented")),
            FieldRule(
                "pa_request_count",
                INTEGER,
                minimum=0,
                description="Supplied historical context; never recomputed.",
            ),
        ),
    ),
    FieldGroup(
        "System audit fields",
        None,
        (
            FieldRule("created_at", DATETIME),
            FieldRule("updated_at", DATETIME),
        ),
    ),
)

PATIENT_FIELDS: tuple[FieldRule, ...] = tuple(
    rule for group in FIELD_GROUPS for rule in group.rules
)
FIELD_NAMES: tuple[str, ...] = tuple(rule.name for rule in PATIENT_FIELDS)
SOURCE_COLUMN_COUNT = 76

# Source fields that become top-level record fields or structured lists rather than
# profile_details entries. home_phone/mobile_phone feed ``phone`` *and* stay in contact.
PROMOTED_FIELDS: dict[str, str] = {
    "patient_id": "record.source_patient_id",
    "mrn": "record.mrn",
    "first_name": "record.first_name",
    "middle_initial": "record.middle_initial",
    "last_name": "record.last_name",
    "date_of_birth": "record.date_of_birth",
    "address_line1": "record.address_line1",
    "city": "record.city",
    "state": "record.state",
    "zip": "record.postal_code",
    "email": "record.email",
    "pcp_last_visit_date": "record.last_visit",
    "problem_list_icd10": "record.conditions[].code",
    "problem_list_text": "record.conditions[].label",
    "drug_allergies": "record.allergies + record.allergy_status",
    "created_at": "record.source_created_at",
    "updated_at": "record.source_updated_at",
}
_ALSO_IN_SECTION = frozenset({"home_phone", "mobile_phone"})


def section_fields(section: str) -> tuple[str, ...]:
    """Source fields stored under ``profile_details.<section>``, in source order."""
    for group in FIELD_GROUPS:
        if group.section == section:
            return tuple(
                rule.name
                for rule in group.rules
                if rule.name not in PROMOTED_FIELDS or rule.name in _ALSO_IN_SECTION
            )
    raise KeyError(section)


def field_destinations() -> dict[str, list[str]]:
    """Every source field's export destination(s); used to prove all 76 are accounted for."""
    destinations: dict[str, list[str]] = {name: [] for name in FIELD_NAMES}
    for name, target in PROMOTED_FIELDS.items():
        destinations[name].append(target)
    for group in FIELD_GROUPS:
        if group.section is not None:
            for name in section_fields(group.section):
                destinations[name].append(f"record.profile_details.{group.section}.{name}")
    for name in ("home_phone", "mobile_phone"):
        destinations[name].append("record.phone (mobile preferred)")
    for name in FIELD_NAMES:
        destinations[name].append("record.source_record")
    return destinations


# --- Cross-field and cross-row invariants -------------------------------------------------


def _issue(row: TransformedRow, field: str, message: str) -> FieldIssue:
    return FieldIssue(row.row_number, field, message)


def age_on(birth: date, on: date) -> int:
    """Whole years between ``birth`` and ``on``."""
    return on.year - birth.year - ((on.month, on.day) < (birth.month, birth.day))


def parse_conditions(codes_text: str, labels_text: str) -> list[Condition]:
    """Pair semicolon-separated codes and descriptions, rejecting mismatched lists."""
    codes = split_semicolon_list(codes_text)
    labels = split_semicolon_list(labels_text)
    if len(codes) != len(labels):
        raise FieldValueError(f"{len(codes)} diagnosis code(s) but {len(labels)} description(s)")
    for code in codes:
        if re.fullmatch(ICD10_CODE, code) is None:
            raise FieldValueError("diagnosis code is not ICD-10-CM shaped")
    return [Condition(code=code, label=label) for code, label in zip(codes, labels, strict=True)]


def _duplicate_issues(rows: Sequence[TransformedRow], field: str) -> list[FieldIssue]:
    seen: dict[CleanValue, list[int]] = defaultdict(list)
    for row in rows:
        seen[row.clean_values()[field]].append(row.row_number)
    issues = []
    for row_numbers in seen.values():
        if len(row_numbers) > 1:
            issues.append(
                FieldIssue(row_numbers[0], field, f"value repeated in rows {row_numbers}")
            )
    return issues


def invariant_issues(rows: Sequence[TransformedRow], dataset_date: date) -> list[FieldIssue]:
    """Check uniqueness, date ordering, snapshot age, and list pairing across all rows."""
    issues = _duplicate_issues(rows, "patient_id") + _duplicate_issues(rows, "mrn")
    snapshot_end = datetime.combine(dataset_date + timedelta(days=1), datetime.min.time(), UTC)
    for row in rows:
        v = row.clean_values()
        birth = _get(v, "date_of_birth", date)
        for name in ("pcp_last_visit_date", "first_registered_date", "last_labs_date"):
            value = _get(v, name, date)
            if not birth <= value <= dataset_date:
                issues.append(
                    _issue(row, name, "must fall between date_of_birth and the dataset date")
                )
        if birth > dataset_date:
            issues.append(_issue(row, "date_of_birth", "is after the dataset date"))
        if _get(v, "age_years", int) != age_on(birth, dataset_date):
            issues.append(
                _issue(row, "age_years", "does not match date_of_birth on the dataset date")
            )
        created = _get(v, "created_at", datetime)
        updated = _get(v, "updated_at", datetime)
        if updated < created:
            issues.append(_issue(row, "updated_at", "is earlier than created_at"))
        if updated >= snapshot_end:
            issues.append(_issue(row, "updated_at", "is after the dataset date"))
        if (v["secondary_payer_name"] is None) != (v["secondary_member_id"] is None):
            issues.append(
                _issue(
                    row,
                    "secondary_member_id",
                    "secondary payer and member ID must both be present or blank",
                )
            )
        try:
            parse_conditions(_get(v, "problem_list_icd10", str), _get(v, "problem_list_text", str))
        except FieldValueError as error:
            issues.append(_issue(row, "problem_list_icd10", str(error)))
    return sorted(issues, key=lambda issue: (issue.row_number, issue.field))


# --- Export projection -------------------------------------------------------------------

_T = TypeVar("_T")
_Section = TypeVar("_Section", bound=ExportModel)


def _get(values: Mapping[str, CleanValue], name: str, kind: type[_T]) -> _T:
    value = values[name]
    if not isinstance(value, kind) or (kind is int and isinstance(value, bool)):
        raise PatientDataError(f"clean field {name} is not {kind.__name__}; rebuild silver")
    return value


def _get_optional(values: Mapping[str, CleanValue], name: str, kind: type[_T]) -> _T | None:
    return None if values[name] is None else _get(values, name, kind)


def allergy_projection(
    clean_allergies: str | None,
) -> tuple[Literal["no_known", "unknown", "reported"], list[str]]:
    """``NKDA`` → no known; blank → unknown; other text kept whole as one reported entry."""
    if clean_allergies is None:
        return "unknown", []
    if clean_allergies == "NKDA":
        return "no_known", []
    return "reported", [clean_allergies]


def _section(
    model: type[_Section],
    section: str,
    clean: Mapping[str, CleanValue],
    raw: Mapping[str, str],
) -> _Section:
    values: dict[str, object] = {}
    for name in section_fields(section):
        value = clean[name]
        values[name] = (
            restore_source_scale(value, raw[name]) if isinstance(value, Decimal) else value
        )
    return model.model_validate(values)


def build_patient_record(clean: Mapping[str, CleanValue], raw: Mapping[str, str]) -> PatientRecord:
    """Project one silver patient into the (provisional) application record.

    ``clean`` holds the typed silver values and ``raw`` the original strings; both must
    cover all 76 fields. Decimals keep the source's written precision.
    """
    if tuple(raw) != FIELD_NAMES or set(clean) != set(FIELD_NAMES):
        raise PatientDataError("patient values do not cover the 76 contract fields in order")
    status, allergies = allergy_projection(_get_optional(clean, "drug_allergies", str))
    mobile = _get_optional(clean, "mobile_phone", str)
    home = _get_optional(clean, "home_phone", str)
    details = ProfileDetails(
        identity=_section(IdentityProfile, "identity", clean, raw),
        contact=_section(ContactProfile, "contact", clean, raw),
        care_team=_section(CareTeamProfile, "care_team", clean, raw),
        coverage=_section(CoverageProfile, "coverage", clean, raw),
        clinical=_section(ClinicalProfile, "clinical", clean, raw),
        labs=_section(LabsProfile, "labs", clean, raw),
        social=_section(SocialProfile, "social", clean, raw),
    )
    return PatientRecord(
        source_patient_id=_get(clean, "patient_id", str),
        mrn=_get(clean, "mrn", str),
        first_name=_get(clean, "first_name", str),
        middle_initial=_get_optional(clean, "middle_initial", str),
        last_name=_get(clean, "last_name", str),
        date_of_birth=_get(clean, "date_of_birth", date),
        phone=mobile if mobile is not None else home,
        email=_get(clean, "email", str),
        address_line1=_get(clean, "address_line1", str),
        city=_get(clean, "city", str),
        state=_get(clean, "state", str),
        postal_code=_get(clean, "zip", str),
        last_visit=_get(clean, "pcp_last_visit_date", date),
        conditions=parse_conditions(
            _get(clean, "problem_list_icd10", str), _get(clean, "problem_list_text", str)
        ),
        allergies=allergies,
        allergy_status=status,
        profile_details=details,
        source_created_at=_get(clean, "created_at", datetime),
        source_updated_at=_get(clean, "updated_at", datetime),
        source_record=dict(raw),
    )
