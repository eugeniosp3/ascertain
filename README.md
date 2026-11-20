# Ascertain Patient Dashboard

[![CI](https://github.com/eugeniosp3/ascertain/actions/workflows/ci.yml/badge.svg)](https://github.com/eugeniosp3/ascertain/actions/workflows/ci.yml)

A full-stack patient management dashboard for a medical practice, built with React and TypeScript (Vite), FastAPI and PostgreSQL. Clinicians can find patients quickly, maintain profiles and clinical notes, read an AI-generated patient summary, and track their own assigned workload. The whole stack starts with a single command and runs on fictional data.

## TLDR

1. Make sure [Docker Desktop](https://docs.docker.com/get-docker/) is installed and its initial setup is complete.
2. Open a terminal in the root of the repository and run:

```sh
./setup.sh
```

3. Open the dashboard at [http://localhost:10050](http://localhost:10050). You start as **Demo Clinician**, with 100 fictional patients already loaded.

The script reports each step as it goes. It starts Docker Desktop if needed, creates a `.env` from the sample configuration (an existing `.env` is never overwritten), builds the images, applies database migrations, seeds the data, waits until every service is healthy, and finishes by printing the address of each service. Use `./setup.sh --dev` for hot reload of the frontend and API. On Windows, run it from a WSL 2 terminal. If you prefer plain Compose: `cp .env.example .env && docker compose up --build`.

| Service | Address |
| --- | --- |
| Dashboard | [http://localhost:10050](http://localhost:10050) |
| API documentation (OpenAPI) | [http://localhost:10051/docs](http://localhost:10051/docs) |
| PostgreSQL | `localhost:10052` (sample credentials in [.env.example](.env.example)) |

## Contents

- [Status](#status)
- [What the application does](#what-the-application-does)
- [Architecture](#architecture)
- [Key technical decisions](#key-technical-decisions)
- [Assessment coverage](#assessment-coverage)
- [Testing and quality](#testing-and-quality)
- [Project structure](#project-structure)
- [How this was built](#how-this-was-built)
- [Notes and limitations](#notes-and-limitations)

## What the application does

| Area | Capabilities |
| --- | --- |
| **Patient directory** | Search, filter, sort and page through 100+ patients. Create, edit and delete patients, with validation in the browser and on the server. |
| **Patient workspace** | Profile and medical details, timestamped clinical notes, an AI-generated summary, and a team discussion thread with unread tracking. |
| **Overview** | Each user's assigned patients at a glance: status, age bands, latest visits and clinical-note coverage. |
| **Experience** | Responsive from phone to desktop, dark and light themes, keyboard accessible, and it restores your place in the list after you close a patient. |

## Architecture

```
Browser (React + TypeScript)
   │  /api/...
   ▼
nginx  ── serves the compiled app and proxies /api
   │
   ▼
FastAPI ── validates (Pydantic), applies business rules, persists (SQLAlchemy)
   │
   ▼
PostgreSQL ◀── Alembic migrations and an idempotent seed on startup
                 (prepared by a DuckDB data pipeline from the source CSV)
```

| Layer | Technology | Responsibility |
| --- | --- | --- |
| [Frontend](frontend/README.md) | React 19, TypeScript, TanStack Router, Query, Table, Virtual and Form, Zod, Tailwind CSS with shadcn/ui | Screens, validation, server-state caching and an accessible UI |
| [Backend](backend/README.md) | FastAPI, Pydantic v2, SQLAlchemy 2, Alembic | REST API, business rules, consistent errors and schema migrations |
| [Data](data/README.md) | Python with DuckDB | Cleans and validates the source dataset, keeps the original values for traceability, and feeds the seed |
| [Infrastructure](infra/README.md) | Docker Compose, nginx, GitHub Actions | One-command local setup, a production-style frontend build, and CI on every push |

## Key technical decisions

1. **The server does the heavy lifting.** Search, filtering, sorting and pagination run in PostgreSQL against matching indexes, so the browser only renders the current page. The list stays fast at any size, and searching never blocks typing.
2. **Each kind of state has one owner.** Server data lives in TanStack Query (cached, cancellable, refreshed after every change), list filters live in the URL (shareable and back-button friendly), and the few UI preferences live in Zustand.
3. **Validate twice, report clearly.** Zod gives immediate feedback in the form; Pydantic is the authority on the server. Server-side errors carry field paths, so every message appears beside the field it belongs to.
4. **The schema changes only through migrations.** Alembic recreates the database exactly on any machine, and the seed is idempotent: restarts never duplicate or overwrite data.
5. **AI summaries are generated once and reused.** An open-weight LLM writes each summary from the patient's verified facts. The result is stored with a fingerprint of those facts and regenerated only when they change; if the LLM is unavailable, a deterministic summary is returned instead.
6. **One predictable API contract.** Routes follow REST conventions with the expected status codes: 201 on create, 204 on delete, 404 for a missing record, 422 for invalid input. Every error shares one shape, `{"error": {"code", "message", "fields"}}`, and its field paths let the form place each message beside the right input. The interactive OpenAPI docs at `/docs` are generated from the same Pydantic models; the full contract is in [backend/docs/API_CONTRACT.md](backend/docs/API_CONTRACT.md).

## Assessment coverage

Every core requirement in [the original assessment](reference/project.md) is implemented and verified. The [project punch card](reference/PROGRESS.md#core-assessment-checks) maps each requirement to its evidence, and an [interactive version](reference/holepunch.html) is available.

| Evaluation criterion | Where to look |
| --- | --- |
| Technical decision-making | [Architecture](#architecture), [key technical decisions](#key-technical-decisions) and the folder READMEs |
| Code quality and best practices | Thin routes over a service layer, feature-based frontend modules, strict typing and linting on both sides; [testing and quality](#testing-and-quality) |
| API design and error handling | Decision 6, the [API contract](backend/docs/API_CONTRACT.md) and the OpenAPI docs at `/docs` |
| Documentation and ease of local setup | The [TLDR](#tldr) (one command) and a README in every folder |
| Correctness and completeness | The [punch card](reference/PROGRESS.md#core-assessment-checks) maps every requirement to its evidence; CI runs on every push |
| Understanding and applying requirements | The lists below: stretch goals implemented, additions, and what was deliberately not selected |

<!-- progress-summary:start -->
**51/51 assessment requirements verified** · 149/151 tracked items · updated 2026-11-20 22:35 UTC. Every requirement is mapped to its evidence in the [punch card](reference/PROGRESS.md#core-assessment-checks) ([interactive version](reference/holepunch.html)).
<!-- progress-summary:end -->

**Stretch goals implemented:** list virtualization; code splitting with lazy-loaded routes; memoized list rendering; sorting and filtering query parameters; Alembic migrations; dark and light themes; overview charts (patient status, age bands, latest visits, note coverage); API unit tests; component tests; end-to-end tests; CI; and hot reload in Docker.

**Beyond the brief:** per-patient discussion threads with unread notifications, per-user workloads on the overview, the AI patient summary, and list position restoration.

**Not selected:** request-logging middleware and advanced multi-field search filters.

## Testing and quality

| Suite | Command | What it verifies |
| --- | --- | --- |
| Backend and data | `docker compose --profile checks run --rm checks` | 342 API, migration and seed tests and 153 data-pipeline tests against real PostgreSQL, plus Ruff and strict mypy |
| Frontend | `cd frontend && npm ci && npm run lint && npm run typecheck && npm test` | 390 unit and component tests, ESLint, Prettier and strict TypeScript |
| Browser journeys | `cd frontend && npm run e2e && npm run e2e:api` | End-to-end journeys on desktop and phone, plus the HTTP client against recorded API responses |
| Clean-room stack | `python3 infra/scripts/verify_stack.py --live-browser` | Builds a fresh, isolated stack; checks migrations, seeding, restarts and log privacy; drives the live app in a browser |

[GitHub Actions](.github/workflows/ci.yml) runs these checks on every push.

## Project structure

```
frontend/    React application: features, shared UI, API client, tests
backend/     FastAPI service: routers, schemas, services, models, Alembic migrations, tests
data/        Data-preparation pipeline that turns the source CSV into the seed
infra/       Dockerfiles, Compose, nginx configuration and verification scripts
reference/   Original assessment, design system, progress punch card and team handoffs
```

Each folder has its own README with setup details, design notes and commands.

## How this was built

The project was delivered by a small team of AI agents that I directed and reviewed. Each area (frontend, backend, data, infrastructure, QA and accessibility) had a lead agent that planned its work and delegated focused tasks to specialist sub-agents. A project-manager agent maintained the requirement checklist and the API contracts between teams. Work was accepted only when tests, independent reviews and a clean-room run proved it. The [punch card](reference/PROGRESS.md) tracks every requirement against its evidence, and the coordination log between teams is kept in [reference/chatroom](reference/chatroom/README.md).

## Notes and limitations

- **Demo identity, not authentication.** The user switcher demonstrates authorship and per-user views. API writes to notes and comments need an `X-Demo-User-ID` header (any id from `GET /users`); the UI sends it automatically. A production deployment would use the practice's identity provider.
- **Source data.** The dataset has no blood type or patient status, so patients start active and blood type is left unrecorded rather than invented. Both can be edited in the form.
- **AI summaries** use a free, keyless LLM endpoint with a daily quota per network. When the quota is reached, the application shows the standard summary and says so. Set `SUMMARY_PROVIDER=template` to turn the LLM off. All patient data is fictional.
