"""Pure UTC clock and calendar helpers shared by profile responses and validation."""

from datetime import UTC, date, datetime


def utc_now() -> datetime:
    """Return an aware UTC instant without changing application state."""
    return datetime.now(UTC)


def utc_today() -> date:
    """Use the UTC calendar consistently for API date validation and current ages."""
    return utc_now().date()


def calculate_age(date_of_birth: date, on_date: date | None = None) -> int:
    """Calculate completed years; a leap-day birthday advances on March 1 otherwise.

    Never negative: a birth date up to one day after the UTC date (a local "today" east of
    UTC) counts as age 0.
    """
    today = on_date if on_date is not None else utc_today()
    return max(
        0,
        today.year
        - date_of_birth.year
        - ((today.month, today.day) < (date_of_birth.month, date_of_birth.day)),
    )
