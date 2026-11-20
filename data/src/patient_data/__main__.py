"""Stage and export commands: ``python -m patient_data <command>``.

Commands:
  build-bronze   CSV -> data/assets/bronze/bronze.duckdb
  build-silver   bronze (read-only) -> data/assets/silver/silver.duckdb
  build          both stages
  validate       re-check the CSV, both files, and their lineage
  inspect        summarize both files without printing patient values
  export         silver -> data/assets/exports/<dataset-key>/{patients.jsonl,manifest.json}
  all            build, validate, export

PostgreSQL seeding belongs to the backend: ``python -m app.seed`` from ``backend/``.
"""

import argparse
import json
import sys
from collections.abc import Sequence
from pathlib import Path

from patient_data.errors import PatientDataError
from patient_data.export import export_package, validate_export
from patient_data.settings import StageSettings
from patient_data.stages import (
    StageResult,
    build_bronze,
    build_silver,
    inspect_stages,
    validate_stages,
)
from patient_data.utils.checks import CheckReport

COMMANDS = ("build-bronze", "build-silver", "build", "validate", "inspect", "export", "all")


def _print_stage(result: StageResult) -> None:
    print(f"{result.stage}: {result.status} {result.path} ({result.row_count} patients)")


def _print_report(report: CheckReport) -> None:
    for result in report.results:
        marker = {"passed": "ok", "failed": "FAIL", "blocked": "BLOCKED"}[result.status]
        print(f"[{marker:7}] {result.name}: {result.message}")
    print("validation:", "passed" if report.passed else "FAILED")


def run(command: str, settings: StageSettings, package_dir: Path | None = None) -> int:
    if command in ("build-bronze", "build", "all"):
        _print_stage(build_bronze(settings))
    if command in ("build-silver", "build", "all"):
        _print_stage(build_silver(settings))
    if command in ("validate", "all"):
        report = validate_stages(settings)
        _print_report(report)
        if not report.passed:
            return 1
    if command == "validate" and package_dir is not None:
        package_report = validate_export(settings, package_dir)
        _print_report(package_report)
        if not package_report.passed:
            return 1
    if command == "inspect":
        print(json.dumps(inspect_stages(settings), indent=2, sort_keys=True))
    if command in ("export", "all"):
        result = export_package(settings)
        print(
            f"export: {result.status} {result.path} "
            f"({result.patient_count} patients, sha256 {result.patients_sha256})"
        )
    return 0


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m patient_data",
        description="Build, validate, inspect, and export the patient stages.",
        epilog="PostgreSQL seeding: run `python -m app.seed` from backend/.",
    )
    parser.add_argument("command", choices=COMMANDS)
    parser.add_argument("--repo-root", type=Path, help="repository root (default: this checkout)")
    parser.add_argument(
        "--package-dir",
        type=Path,
        help="with validate: also validate this exported package directory",
    )
    args = parser.parse_args(argv)
    settings = StageSettings(repo_root=args.repo_root) if args.repo_root else StageSettings()
    try:
        return run(args.command, settings, args.package_dir)
    except PatientDataError as error:
        print(f"error: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
