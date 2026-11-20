# Infrastructure checklist

Current work: run the frontend, API, and PostgreSQL through Compose, with a separate hot-reload development setup. [README.md](../README.md) contains the run commands. An unchecked item is not yet verified end to end.

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
- [x] Verify baseline frontend lint, formatting, type checks, tests, and build on published commit `611bda5`.
- [ ] Verify live patient CRUD, notes, comments, notifications, and seed-repeat behavior through the frontend and backend together.
- [x] Enable migration and seed initialization in the sample configuration while preserving existing environment settings.
- [x] Make API mode the setup default, with demo mode available as an explicit opt-in.
- [x] Run hosted baseline CI successfully in the public GitHub repository.
- [x] Prepare a separate real API browser CI lane and isolated runner using the agreed frontend test interface.
- [ ] Run the frontend-owned live suite against an isolated compiled API-mode stack with no HTTP interception.
- [ ] Complete the final coordinated code review and integration test run after application changes land.
- [ ] Complete the coordinated shared API-mode setup without resetting data or overwriting unrelated environment settings.
- [ ] Publish owner-verified integration files and verify hosted CI for that exact revision.

## Ownership

The frontend team owns application components and the demo/API adapters. Backend owns application tables, migrations, routes, and `app.seed`. Data owns the source transformation code and bronze/silver snapshot rules. Infra packages these implementations and invokes their commands without implementing a second database writer.

The project manager owns the root README, shared integration plan, and master acceptance checklist. Infra maintains this folder's setup/verification guidance and sends root-documentation changes through that owner.

The current backend seed path reads DuckDB snapshots, as defined in `backend/app/seed.py`. The older JSONL `patient_data.seed` prototype is not the application startup path. The image builds snapshots from the committed patient CSV; local generated DuckDB files are not required for a fresh image build.

API mode with automatic migration and seeding is the default. Explicit demo mode uses in-memory fixture data. Existing `.env` values are preserved; older mode and initialization settings must be updated deliberately. Running containers, HTTP healthchecks, and HMR verification do not establish a completed database-backed patient workflow.

## Verified on 2026-11-20

The compiled stack passed the isolated verifier: built JS/CSS assets, SPA deep links, API JSON/error forwarding, backend replacement, full stack recreation, and persistent database data. Its temporary project and volume were removed after the checks.

The development stack remains running on frontend port 8080, backend port 8000, and PostgreSQL port 5432. Vite emitted a real HMR websocket update after a host edit; Uvicorn restarted its worker after a Python edit. Temporary probe files were removed. Chrome rendered the demo overview and patient list and refreshed the patient-list route without JavaScript errors.

Pre-publication local checks recorded passing linting, formatting, typing, 193 backend tests, and 160 data tests. A small frontend test-selector type error that blocked compilation was corrected; its six note tests passed. The subsequent published baseline CI result and remaining live integration work are recorded below.

## Integration readiness after publication

Published baseline commit `611bda5` passed [hosted CI](https://github.com/eugeniosp3/ascertain/actions/runs/44781809472), including the frontend quality suite, desktop/mobile demo journeys, intercepted HTTP-contract tests, and real seeded container startup/restart checks. This supersedes the earlier pre-publication CI status above; it does not certify a live database-backed browser journey.

The live lane uses `npm run e2e:live -- --workers=1`, `playwright.live.config.ts`, `e2e-live/`, and required `PLAYWRIGHT_LIVE_BASE_URL`. On commit `80c9dab`, all 16 hosted live browser cases passed, but the job failed afterward because the stopped-backend probe expected 502 and received 504. The corrected ordinary verifier passes locally; hosted CI must rerun the correction. [delivery-review.md](delivery-review.md) records the result and scope. The project manager coordinates publication and the final review.

## Opus platform follow-up

- [x] OPR-002 local verification: request-value-free nginx summaries and API error-detail suppression pass the isolated search/entity/upstream-failure privacy checks with the corrected 502/504 probe. Hosted rerun remains pending.
- [x] OPR-007 local verification: entry HTML/SPA `no-cache`, immutable hashed assets, missing-asset handling and content-type protection pass runtime assertions in the complete isolated verifier.
- [x] OPR-008 packaging: generated QA evidence stays local under ignored `qa/`; Git and Docker build exclusions remain in place. The removed backend fault harness is not part of the application package.
- [x] OPR-001 configuration: fresh setup uses API mode; demo mode is opt-in. Existing environment values and the running shared stack are updated separately through the coordinated cutover.
