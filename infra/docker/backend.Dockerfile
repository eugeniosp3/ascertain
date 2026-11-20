# syntax=docker/dockerfile:1
# check=error=true
# Multi-platform digests keep Apple Silicon and Linux CI on the same image release.
ARG PYTHON_IMAGE=python:3.12-slim-bookworm@sha256:935c3c5b12357a7e10caa9c1e6ca5692344d97cf229832ef584be2cec9fc03df
FROM ghcr.io/astral-sh/uv:0.12.18@sha256:3adc3706091ce7c2fe595e669628caedd6d951551b92b258b7e7dbe06d9440bc AS uv
FROM ${PYTHON_IMAGE} AS dependencies
COPY --from=uv /uv /usr/local/bin/uv
ENV UV_PYTHON_DOWNLOADS=never UV_LINK_MODE=copy
COPY backend/pyproject.toml backend/uv.lock /build/backend/
COPY data/pyproject.toml data/uv.lock /build/data/
RUN uv venv --python /usr/local/bin/python /opt/venv

FROM dependencies AS runtime-dependencies
# Both application locks are authoritative. Conflicting pins fail the build.
RUN uv export --project /build/backend --locked --no-dev --no-emit-local --output-file /tmp/backend.txt > /dev/null \
    && uv export --project /build/data --locked --no-dev --no-emit-local --output-file /tmp/data.txt > /dev/null \
    && uv pip sync --python /opt/venv/bin/python --require-hashes /tmp/backend.txt /tmp/data.txt

FROM dependencies AS check-dependencies
RUN uv export --project /build/backend --locked --no-emit-local --output-file /tmp/backend.txt > /dev/null \
    && uv export --project /build/data --locked --no-emit-local --output-file /tmp/data.txt > /dev/null \
    && uv pip sync --python /opt/venv/bin/python --require-hashes /tmp/backend.txt /tmp/data.txt

FROM ${PYTHON_IMAGE} AS application
ENV PATH="/opt/venv/bin:$PATH" \
    PYTHONPATH="/workspace/backend:/workspace/data/src" \
    PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
RUN groupadd --gid 10001 app && useradd --uid 10001 --gid app --create-home app
WORKDIR /workspace/backend
COPY --from=runtime-dependencies /opt/venv /opt/venv
COPY backend/app ./app
COPY backend/alembic ./alembic
COPY backend/alembic.ini ./alembic.ini
COPY data/src /workspace/data/src
# Build the backend's read-only seed snapshots from committed source, not host files.
COPY reference/prior-auth-pack/data/patients_100.csv /workspace/reference/prior-auth-pack/data/patients_100.csv
RUN python -m patient_data build --repo-root /workspace \
    && python -c "from patient_data.settings import StageSettings; s = StageSettings(); s.bronze_path.chmod(0o444); s.silver_path.chmod(0o444)"
COPY infra/scripts /workspace/infra/scripts
USER app
EXPOSE 8000
ENTRYPOINT ["python", "/workspace/infra/scripts/entrypoint.py"]
CMD ["serve"]

FROM application AS checks
USER root
COPY --from=check-dependencies /opt/venv /opt/venv
COPY backend/pyproject.toml /workspace/backend/pyproject.toml
COPY backend/tests /workspace/backend/tests
COPY data/pyproject.toml /workspace/data/pyproject.toml
COPY data/tests /workspace/data/tests
RUN chown -R app:app /workspace
WORKDIR /workspace
USER app
CMD ["sh", "/workspace/infra/scripts/checks.sh"]

# A plain docker build also produces the application image, not the test runner.
FROM application AS runtime
