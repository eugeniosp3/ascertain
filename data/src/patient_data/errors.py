"""One error type for actionable, value-free pipeline failures.

Messages name rows, fields, files, and checks, but never patient values, so they can be
printed to logs and CI output safely.
"""

from collections.abc import Iterable

_MAX_LISTED_ISSUES = 25


class PatientDataError(Exception):
    """A pipeline step refused to continue; ``issues`` explains every detected problem."""

    def __init__(self, summary: str, issues: Iterable[str] = ()) -> None:
        self.summary = summary
        self.issues: tuple[str, ...] = tuple(issues)
        super().__init__(summary)

    def __str__(self) -> str:
        if not self.issues:
            return self.summary
        listed = [f"  - {issue}" for issue in self.issues[:_MAX_LISTED_ISSUES]]
        hidden = len(self.issues) - len(listed)
        if hidden > 0:
            listed.append(f"  ... and {hidden} more issue(s)")
        return "\n".join([f"{self.summary} ({len(self.issues)} issue(s)):", *listed])
