"""Validation results shared by build, export, and seed checks."""

from typing import Literal

from pydantic import Field

from patient_data.utils.models import DataModel


class CheckResult(DataModel):
    """The outcome of a single check."""

    name: str
    status: Literal["passed", "failed", "blocked"]
    message: str = ""
    required: bool = True


class CheckReport(DataModel):
    """Proceed only after at least one required check and all required checks pass."""

    results: list[CheckResult] = Field(default_factory=list)

    @property
    def passed(self) -> bool:
        required = [result for result in self.results if result.required]
        return bool(required) and all(result.status == "passed" for result in required)

    def add(
        self,
        name: str,
        status: Literal["passed", "failed", "blocked"],
        message: str = "",
        required: bool = True,
    ) -> None:
        """Validate and append a result; blocked required checks prevent continuation."""
        self.results.append(
            CheckResult(name=name, status=status, message=message, required=required)
        )
