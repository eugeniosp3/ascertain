#!/bin/sh
set -eu

cd /workspace/backend
: "${TEST_DATABASE_URL:?checks requires its disposable test database}"
DATABASE_URL="$TEST_DATABASE_URL" alembic upgrade head
ruff check .
ruff format --check .
mypy app
python -m pytest -q

cd /workspace/data
ruff check src tests
ruff format --check src tests
mypy src tests
python -m pytest -q

cd /workspace
ruff check --isolated infra/scripts
ruff format --check --isolated infra/scripts
