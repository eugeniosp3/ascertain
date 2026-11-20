"""Application-owned validation codes and safe public messages, without input values."""

from typing import Literal, NoReturn

from pydantic_core import PydanticCustomError

ValidationCode = Literal[
    "date_in_future",
    "date_of_birth_too_early",
    "last_visit_before_birth",
    "invalid_phone",
    "invalid_email",
    "allergies_required",
    "allergies_not_reported",
    "clinical_time_in_future",
    "duplicate_note_reference",
    "invalid_source_url",
    "invalid_discussion_cursor",
]

PUBLIC_VALIDATION_MESSAGES = {
    "date_in_future": "Date must not be in the future.",
    "date_of_birth_too_early": "Date of birth must be on or after January 1, 1900.",
    "last_visit_before_birth": "Last visit cannot be before the date of birth.",
    "invalid_phone": "Enter a valid phone number.",
    "invalid_email": "Enter a valid email address.",
    "allergies_required": "Add at least one allergy when allergy status is reported.",
    "allergies_not_reported": "Clear the allergy list or choose the reported allergy status.",
    "clinical_time_in_future": "Clinical time cannot be in the future.",
    "duplicate_note_reference": "Link each note only once.",
    "invalid_source_url": "Use an HTTPS URL without credentials.",
    "invalid_discussion_cursor": "Invalid discussion cursor. Reload the discussion.",
}

# These model-level rules belong beside the control that can resolve them.
VALIDATION_FIELD_TARGETS = {
    "allergies_required": "allergies",
    "allergies_not_reported": "allergies",
    "last_visit_before_birth": "last_visit",
}


def reject(code: ValidationCode) -> NoReturn:
    """Raise a controlled code; the HTTP boundary also uses this fixed message catalog."""
    raise PydanticCustomError(code, PUBLIC_VALIDATION_MESSAGES[code])
