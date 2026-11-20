"""Required check outcomes and validation boundaries."""

from typing import Literal

import pytest
from pydantic import ValidationError

from patient_data.utils.checks import CheckReport, CheckResult
from patient_data.utils.models import DataModel


def test_no_required_checks_never_passes() -> None:
    report = CheckReport()
    assert not report.passed
    report.add("informational", "passed", required=False)
    assert not report.passed


def test_report_lists_are_isolated() -> None:
    first, second = CheckReport(), CheckReport()
    first.add("package", "passed")
    assert first.passed
    assert second.results == []
    assert not second.passed


@pytest.mark.parametrize("status", ["failed", "blocked"])
def test_required_failure_or_block_stops_report(status: Literal["failed", "blocked"]) -> None:
    report = CheckReport()
    report.add("source", "passed")
    report.add("destination", status, "Check destination schema")
    assert not report.passed
    assert report.results[-1].message == "Check destination schema"


def test_optional_failures_and_blocks_do_not_block_required_success() -> None:
    report = CheckReport()
    report.add("source", "passed")
    report.add("schema", "passed")
    report.add("diagnostics", "failed", required=False)
    report.add("optional connectivity", "blocked", required=False)
    assert report.passed


def test_results_have_expected_defaults_and_serialization() -> None:
    result = CheckResult(name="source", status="passed")
    assert result.message == ""
    assert result.required
    report = CheckReport(results=[result])
    assert report.model_dump() == {
        "results": [{"name": "source", "status": "passed", "message": "", "required": True}]
    }
    assert isinstance(report, DataModel)
    assert isinstance(result, DataModel)


def test_add_validates_before_appending() -> None:
    report = CheckReport()
    with pytest.raises(ValidationError, match="status"):
        report.add("bad", "unknown")  # type: ignore[arg-type]
    assert report.results == []


@pytest.mark.parametrize(
    "model,payload",
    [
        (DataModel, {"unexpected": True}),
        (CheckResult, {"name": "source", "status": "passed", "unexpected": True}),
        (CheckReport, {"results": [], "unexpected": True}),
        (CheckReport, {"results": [{"name": "source", "status": "passed", "extra": 1}]}),
    ],
)
def test_models_reject_extra_fields(model: type[DataModel], payload: dict[str, object]) -> None:
    with pytest.raises(ValidationError, match="extra_forbidden"):
        model.model_validate(payload)
