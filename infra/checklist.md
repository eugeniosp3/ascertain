# Infrastructure checklist

Current work: run the frontend, API, and PostgreSQL through Compose, with a separate hot-reload development setup. [README.md](README.md) contains the run commands. An unchecked item is not yet verified end to end.

## Organization and configuration

- [x] Keep Dockerfiles, service definitions, development overrides, nginx, and helper scripts under `infra/`.
- [x] Keep a small root Compose entry point for the interviewer's standard command.
- [x] Preserve the Compose project name, existing database volume, ports, and environment values through the move.
- [x] Commit a complete `.env.example` with sample values and exclude real environment files from Git and image builds.
- [x] Keep database credentials at runtime and restrict frontend build arguments to public Vite settings.
- [x] Pin multi-platform base images and install application dependencies from their lockfiles.

## PostgreSQL

- [x] Run PostgreSQL in its own container, with localhost access and a readiness check.
- [x] Store database data in a named Docker volume.
- [x] Verify authenticated host connections and rejection of an incorrect password.
- [x] Verify fresh startup and persistence across container removal/recreation in an isolated project.
- [x] Keep automated test databases separate from development data.

## Frontend and API containers

- [x] Add a multi-stage frontend Dockerfile with a Node/Vite build and a non-root nginx runtime.
- [x] Configure frontend deep-link fallback, static-file 404s, and `/api` forwarding without converting API errors to HTML.
- [x] Validate nginx configuration syntax as its non-root runtime user.
- [x] Run the development frontend, FastAPI, and PostgreSQL containers with healthchecks.
- [x] Verify Vite's same-origin forwarding to API health and database readiness.
- [x] Build the API image with source-generated DuckDB snapshots for the backend's selected seed command.
- [x] Wire optional startup as Alembic, then `python -m app.seed`, then FastAPI, stopping on failure.
- [x] Complete a successful production frontend build after the frontend's remaining components land.
- [x] Run the full compiled-stack verifier for assets, deep links, nginx proxy recovery, and container recreation.
- [x] Verify the development overview and patient list in Chrome, including a refreshed deep link with no JavaScript errors.
- [ ] Verify frontend browser journeys through the compiled deployment.

## Hot reload

- [x] Mount local frontend source while keeping container dependencies in a separate volume.
- [x] Run Vite with reliable file polling and its browser update connection.
- [x] Verify a local source edit produces a real Vite HMR websocket update and serves the changed module.
- [x] Mount backend/data Python source and launch Uvicorn with `--reload`.
- [x] Verify a Python edit restarts the API worker and health recovers.
- [x] Document development startup, dependency rebuilds, and switching back to the compiled setup.

## CI and remaining integration

- [x] Add containerized frontend and Python checks with bounded CI jobs and cleanup.
- [x] Apply migrations to the disposable backend test database before its integration tests.
- [x] Add an isolated full-stack verifier, retaining a database-only option.
- [ ] Verify all current frontend lint, formatting, type checks, tests, and build once its implementation is complete.
- [ ] Verify live patient CRUD, notes, comments, notifications, and seed-repeat behavior through the frontend and backend together.
- [ ] Enable API mode and automatic database initialization by default only after that integration passes.
- [ ] Run hosted CI once a GitHub repository exists.

## Ownership

The frontend team owns application components and the demo/API adapters. Backend owns application tables, migrations, routes, and `app.seed`. Data owns the source transformation code and bronze/silver snapshot rules. Infra packages these implementations and invokes their commands without implementing a second database writer.

The current backend seed path reads DuckDB snapshots, as defined in `backend/app/seed.py`. The older JSONL `patient_data.seed` prototype is not the application startup path. The image builds snapshots from the committed patient CSV; local generated DuckDB files are not required for a fresh image build.

Frontend demo mode is explicit and uses in-memory fixture data. Running containers, HTTP healthchecks, and HMR verification do not establish a completed database-backed patient workflow.

## Verified on 2026-11-20

The compiled stack passed the isolated verifier: built JS/CSS assets, SPA deep links, API JSON/error forwarding, backend replacement, full stack recreation, and persistent database data. Its temporary project and volume were removed after the checks.

The development stack remains running on frontend port 8080, backend port 8000, and PostgreSQL port 5432. Vite emitted a real HMR websocket update after a host edit; Uvicorn restarted its worker after a Python edit. Temporary probe files were removed. Chrome rendered the demo overview and patient list and refreshed the patient-list route without JavaScript errors.

The latest Python container checks passed linting, formatting, typing, 193 backend tests, and 160 data tests. A small frontend test-selector type error that blocked compilation was corrected; its six note tests passed. Full frontend quality checks are still pending while that application is being edited, so this record does not claim a completely green application CI run or hosted CI result.
