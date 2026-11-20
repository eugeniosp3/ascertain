"""Privacy tags for every column, based on HIPAA Safe Harbor, 45 CFR 164.514(b)(2).

Vocabulary
  IDENTIFIER          one of the 18 Safe Harbor identifiers (letter A-R shown)
  QUASI-IDENTIFIER    not on the list, but helps re-identify someone when combined with other fields
  HEALTH DATA         clinical, coverage or service facts; PHI whenever the row is tied to a person
  FREE TEXT           narrative that can accidentally contain names, dates or other identifiers
  NOT PATIENT DATA    provider, facility, payer-rule or staff data that does not describe the patient

All data in this pack is synthetic. The tags say what each field *would be* in a real extract.
"""
from __future__ import annotations

from dataclasses import dataclass

from .schema import Column

IDENTIFIER = "IDENTIFIER"
QUASI = "QUASI-IDENTIFIER"
HEALTH = "HEALTH DATA"
FREE_TEXT = "FREE TEXT"
NOT_PATIENT = "NOT PATIENT DATA"

ITEMS = {
    "A": "(A) Names",
    "B": "(B) Geographic subdivisions smaller than a state",
    "C": "(C) Dates (except year) related to the individual",
    "D": "(D) Telephone numbers",
    "F": "(F) Email addresses",
    "H": "(H) Medical record numbers",
    "I": "(I) Health plan beneficiary numbers",
    "R": "(R) Any other unique identifying number, characteristic or code",
}

ACTIONS = {
    "A": "Remove",
    "B": "Remove (ZIP: keep first 3 digits only if that area has more than 20,000 people, otherwise 000)",
    "C": "Remove, or keep the year only",
    "D": "Remove",
    "F": "Remove",
    "H": "Remove",
    "I": "Remove",
    "R": "Remove, or replace with a random code that cannot be traced back (164.514(c))",
}

# column name -> HIPAA item letter
IDENTIFIER_COLUMNS = {
    # names
    "first_name": "A", "middle_initial": "A", "last_name": "A", "patient_first_name": "A", "patient_last_name": "A",
    "emergency_contact_name": "A",
    # geography below state
    "address_line1": "B", "city": "B", "zip": "B", "patient_address_line1": "B", "patient_city": "B", "patient_zip": "B",
    # phone
    "home_phone": "D", "mobile_phone": "D", "emergency_contact_phone": "D", "patient_phone": "D",
    # email
    "email": "F",
    # record numbers
    "mrn": "H",
    "primary_member_id": "I", "secondary_member_id": "I", "member_id": "I",
    # other unique ids / codes
    "patient_id": "R", "pa_request_id": "R", "related_request_id": "R", "payer_case_number": "R", "auth_number": "R",
    "encounter_id": "R", "primary_group_number": "R", "group_number": "R",
}

QUASI_COLUMNS = {
    "age_years", "patient_age_at_request", "sex_at_birth", "patient_sex", "gender_identity", "race", "patient_race",
    "ethnicity", "patient_ethnicity", "preferred_language", "patient_preferred_language", "interpreter_needed",
    "patient_interpreter_needed", "marital_status", "employment_status", "state", "patient_state",
    "emergency_contact_relationship", "subscriber_relationship",
}

NOT_PATIENT_COLUMNS = {
    "pcp_name", "pcp_npi", "assigned_specialist_id", "work_queue", "payer_deadline_hours", "payer_portal",
    "pa_requirement_source", "pa_requirement_policy_id", "dc_policy_id", "dc_criteria_set", "img_guideline_reference",
    "img_benefit_manager", "ip_criteria_vendor", "ip_criteria_subset", "ip_gmlos_days", "rx_formulary_status",
    "rx_preferred_alternative", "dm_supplier_name", "dm_supplier_npi", "dm_supplier_in_network", "office_contact_name",
    "office_contact_phone", "submission_channel", "dc_attachment_method",
}

# structured lists stored as text: health facts, not narrative
STRUCTURED_TEXT = {"problem_list_text", "active_medications", "drug_allergies", "cr_detail", "cr_unmet", "dc_missing_documents",
                   "ip_severity_of_illness", "ip_intensity_of_service", "conservative_therapy_description"}

PROVIDER_GROUP_PREFIX = "4. "


@dataclass(frozen=True)
class Privacy:
    tag: str
    item: str       # HIPAA item, or ""
    action: str     # what Safe Harbor de-identification would do with it


def classify(col: Column) -> Privacy:
    name = col.name
    if name in IDENTIFIER_COLUMNS:
        letter = IDENTIFIER_COLUMNS[name]
        return Privacy(IDENTIFIER, ITEMS[letter], ACTIONS[letter])
    if col.kind in ("date", "datetime"):
        return Privacy(IDENTIFIER, ITEMS["C"], ACTIONS["C"])
    if name in QUASI_COLUMNS:
        action = "Keep; ages over 89 must be grouped as '90 or older'" if "age" in name else \
                 "Keep (state is allowed); consider grouping small categories" if name.endswith("state") or name == "state" else \
                 "Keep, but check small groups: rare combinations can single someone out"
        return Privacy(QUASI, "", action)
    if name in NOT_PATIENT_COLUMNS or col.group.startswith(PROVIDER_GROUP_PREFIX):
        return Privacy(NOT_PATIENT, "", "Keep (describes a provider, facility, payer rule or staff member, not the patient)")
    if col.kind == "text" and name not in STRUCTURED_TEXT:
        return Privacy(FREE_TEXT, "", "Review or scrub: narrative can contain names, dates or places")
    return Privacy(HEALTH, "", "Keep once identifiers are removed; PHI while linked to an identifiable person")
