"""Selected runtime seed command: ``python -m app.seed [--check-only]``.

Infra must run Alembic, then this command, then start the API. Do not also wire
``patient_data.seed``: that JSONL package prototype is not the runtime input.
"""

import argparse
from collections.abc import Sequence
from pathlib import Path

from app.services.seeding import run_seed
from app.utils.duckdb_source import DEFAULT_BRONZE_PATH, DEFAULT_SILVER_PATH


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Validate and seed PostgreSQL directly from read-only DuckDB snapshots"
    )
    parser.add_argument(
        "--check-only",
        action="store_true",
        help="Read-only source/schema/conflict checks; never insert seed data",
    )
    parser.add_argument("--bronze", type=Path, default=DEFAULT_BRONZE_PATH)
    parser.add_argument("--silver", type=Path, default=DEFAULT_SILVER_PATH)
    args = parser.parse_args(argv)
    outcome = run_seed(bronze=args.bronze, silver=args.silver, check_only=args.check_only)
    for check in outcome.checks:
        if check.status != "passed":
            print(f"{check.status.upper()} {check.name}: {check.message}")
    print(f"Seed {outcome.status}" + (f": {outcome.dataset_key}" if outcome.dataset_key else ""))
    return outcome.exit_code


if __name__ == "__main__":
    raise SystemExit(main())
