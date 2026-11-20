# Ascertain healthcare dashboard

[![CI](https://github.com/eugeniosp3/ascertain/actions/workflows/ci.yml/badge.svg)](https://github.com/eugeniosp3/ascertain/actions/workflows/ci.yml)

A patient-management dashboard built with React (TypeScript, Vite), FastAPI and PostgreSQL. It covers the patient list, create/edit forms, clinical notes, generated summaries and an overview with charts, plus team discussion with unread notifications.

## Contents

- [Status](#status)
- [Run it](#run-it)
- [Status](#status)
- [What's inside](#whats-inside)
- [Tests](#tests)
- [How I used agents](#how-i-used-agents)
- Folder guides: [frontend](frontend/README.md) · [backend](backend/README.md) · [data](data/README.md) · [infra](infra/README.md) · [reference](reference/README.md)
- Progress: [punch card](reference/PROGRESS.md) · [interactive Holepunch](reference/holepunch.html) · [original assessment](reference/project.md)

## Run it

You need [Docker Desktop](https://docs.docker.com/get-docker/), with its first-run setup complete. From the repository root:

```sh
./setup.sh            # or: cp .env.example .env && docker compose up --build
```

| Service | Address |
| --- | --- |
| Dashboard | [http://localhost:10050](http://localhost:10050) |
| API docs (OpenAPI) | [http://localhost:10051/docs](http://localhost:10051/docs) |
| PostgreSQL | `localhost:10052` (see `.env.example`) |

On startup the backend applies Alembic migrations and seeds 100 fictional patients from `data/`. Restarts keep your edits. The app opens as **Demo Clinician**; the user menu switches to **Demo Coordinator**, and each user's overview shows their assigned patients (52 and 48). Use `./setup.sh --dev` for hot reload of the frontend and API. Setting `VITE_DATA_MODE=demo` in `.env` runs the UI on in-browser fixture data with no backend. On Windows, use a WSL 2 terminal.

**API notes.** Writes to notes and comments are attributed to a demo user, so send `X-Demo-User-ID: <id from GET /users>`. The UI does this automatically; in `/docs`, fill in that header field. The source dataset has no blood type or status, so patients start active with blood type unrecorded rather than invented. Both can be edited in the form.

<!-- progress-summary:start -->
## Status

Snapshot: 2026-11-20 20:25 UTC.

**Core assessment: 51/51 checks verified in reviewed scopes (100%).** 0 partially verified; 0 still open.

The 51 checks split the original assessment into individually testable requirements. Stretch goals and extra features are tracked separately in the detailed card.

| Assessment section | Verified | Partial | Still open |
| --- | ---: | ---: | ---: |
| Submission | 3/3 | 0 | 0 |
| Part 1 | 10/10 | 0 | 0 |
| Part 2 | 20/20 | 0 | 0 |
| Part 3 | 8/8 | 0 | 0 |
| Part 4 | 6/6 | 0 | 0 |
| Part 5 | 4/4 | 0 | 0 |

The detailed card also tracks recommendations and selected additions; those are separate from the core assessment denominator.

**Detailed work: 148/151 items verified in stated scopes.**

- Verified build committed and pushed on 20 Nov: every core check and every selected item is verified.
- Next wave (in progress): per-domain anti-pattern and accessibility reviews with fixes, the study guide (architecture, technical decisions, maintainability and performance, data model) and a final README polish.

[See every assessment check and its evidence](reference/PROGRESS.md#core-assessment-checks).
<!-- progress-summary:end -->

## What's inside

| Folder | Contents |
| --- | --- |
| [frontend/](frontend/README.md) | Vite + React + TypeScript. Tailwind with shadcn/Radix components; TanStack Router (lazy-loaded routes), Query (server state), Table + Virtual (100+ row list) and Form + Zod (validation); Zustand for small UI preferences. |
| [backend/](backend/README.md) | FastAPI with Pydantic schemas, a service layer, SQLAlchemy 2 + psycopg, and Alembic migrations. A shared error format returns correct HTTP codes (404/409/422). Summaries are template-based, so no LLM key is needed. |
| [data/](data/README.md) | Builds the seed: a DuckDB bronze/silver pipeline cleans the source CSV and keeps the original values for lineage. |
| [infra/](infra/README.md) | Dockerfiles (nginx serves the compiled frontend and proxies `/api`), Compose with health checks, the setup script and GitHub Actions CI. |
| [reference/](reference/README.md) | The original assessment, design system, source data pack, progress punch card and agent handoff logs. |

**Assessment coverage.** Every core requirement in [the assessment](reference/project.md) is implemented and verified. [PROGRESS.md](reference/PROGRESS.md#core-assessment-checks) maps each one to its evidence. Stretch goals done: list virtualization, code splitting and lazy routes, sort/filter query parameters, Alembic migrations, dark/light theme, overview charts (status, age bands, latest visits, note coverage), API unit tests, component tests, end-to-end tests, CI, and hot reload in Docker. Request-logging middleware, advanced search filters and an LLM summarizer were not selected.

**Beyond the brief.** Per-patient discussion threads with note links and per-user unread counts, a demo-user switcher (authorship plus per-user workload, not authentication), and restoring list position and focus after closing a patient.

## Tests

```sh
docker compose --profile checks run --rm checks             # backend (301) + data (160): pytest, Ruff, mypy
cd frontend && npm ci && npm run lint && npm run typecheck && npm test   # 348 unit/component tests
npm run e2e && npm run e2e:api                                # browser journeys: demo data / HTTP adapter
python3 infra/scripts/verify_stack.py --live-browser          # clean-room stack + live browser journeys on PostgreSQL
```

CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)) runs the same checks on every push.

## How I used agents

I built this with a team of AI agents, each in its own lead chat: frontend, backend, data, infrastructure, QA and styling accessibility. A project-manager agent coordinated them. Each lead split its area into narrow tasks and handed them to specialist sub-agents, which sometimes ran sub-agents of their own for reviews and tests. The lead then integrated and checked the results. Work started on GPT-6 and GPT-6.1 Sol agents; the final implementation, code review and verification ran on Claude Opus 5.5. Contracts and handoffs between the teams are kept in [reference/chatroom/](reference/chatroom/README.md), and the [Holepunch](reference/holepunch.html) tracks every requirement against its evidence.

Real `.env` files, raw QA run evidence and personal study material are git-ignored.
