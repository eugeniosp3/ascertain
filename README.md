# Ascertain patient dashboard

[![CI](https://github.com/eugeniosp3/ascertain/actions/workflows/ci.yml/badge.svg)](https://github.com/eugeniosp3/ascertain/actions/workflows/ci.yml)

A patient dashboard for a medical practice. You can find patients fast, keep their records and clinical notes, read an AI summary, and see your own workload at a glance. It uses React + TypeScript (Vite), FastAPI and PostgreSQL, and starts with one command.

## Run it

You need [Docker Desktop](https://docs.docker.com/get-docker/). From the repository root:

```sh
./setup.sh        # or: cp .env.example .env && docker compose up --build
```

| Open | Address |
| --- | --- |
| Dashboard | [http://localhost:10050](http://localhost:10050) |
| API docs | [http://localhost:10051/docs](http://localhost:10051/docs) |
| PostgreSQL | `localhost:10052` (credentials in `.env.example`) |

On first start the database migrates and seeds 100 fictional patients, and your edits survive restarts. You start as **Demo Clinician**; switch users at the top right. `./setup.sh --dev` adds hot reload. On Windows, use a WSL 2 terminal.

<!-- progress-summary:start -->
## Status

**51/51 assessment requirements verified** · 148/151 tracked items · updated 2026-11-20 20:58 UTC. Every requirement is mapped to its evidence in the [punch card](reference/PROGRESS.md#core-assessment-checks) ([interactive version](reference/holepunch.html)).
<!-- progress-summary:end -->

## What you can do

| Area | What it does |
| --- | --- |
| Patients | Search, filter, sort and page through 100+ patients. Add, edit and delete them, with validation on both sides. |
| Patient page | Profile, timestamped clinical notes, an AI summary and a team discussion thread with unread counts. |
| Overview | Your assigned patients as charts: status, age bands, latest visits and note coverage. |

## How it's built

| Layer | Stack | Why |
| --- | --- | --- |
| [Frontend](frontend/README.md) | React, TanStack (Router, Query, Table, Virtual, Form), Zod, Tailwind + shadcn/ui | Server data is cached and refreshed in one place, filters live in the URL, and only visible rows render. |
| [Backend](backend/README.md) | FastAPI, Pydantic v2, SQLAlchemy 2, Alembic | Thin routes over testable services, one error format, and schema changes only through migrations. |
| [Data](data/README.md) | DuckDB pipeline feeding the PostgreSQL seed | Cleans the source CSV once, keeps the original values for traceability, and never seeds twice. |
| [Infra](infra/README.md) | Docker Compose, nginx, GitHub Actions | One command to run. nginx serves the app and proxies the API, and CI runs every check on each push. |

**The five decisions that matter**

1. **The server does the heavy work.** Search, filters, sorting and paging run in PostgreSQL with matching indexes. The browser only renders the current page.
2. **Each kind of state has one home.** Server data lives in TanStack Query, filters in the URL, and small UI preferences in Zustand.
3. **Validate twice, report once.** Zod gives instant feedback, Pydantic is the authority, and server errors land on the right field.
4. **The database changes only through migrations,** and seeding never duplicates or overwrites data.
5. **Summaries are generated once and reused.** An open-weight LLM writes each summary from the patient's facts. It is saved with a fingerprint of those facts and regenerated only when they change. If the LLM is unreachable, a deterministic template answers instead.

## Quality

```sh
docker compose --profile checks run --rm checks              # backend + data tests, lint, types
(cd frontend && npm ci && npm run lint && npm run typecheck && npm test && npm run e2e)
python3 infra/scripts/verify_stack.py --live-browser           # fresh stack + browser journeys on PostgreSQL
```

The backend (337) and data (153) suites run against real PostgreSQL. The frontend has 370 unit tests plus browser journeys on desktop and phone. A clean-room run builds the whole stack from nothing and drives it in a real browser, and CI repeats the checks on every push.

## How I built it

I ran this like a small engineering team made of AI agents. Each area (frontend, backend, data, infrastructure, QA and accessibility) had a lead agent that delegated focused work to specialist sub-agents, and a project-manager agent held the requirements and the contracts between teams. I set direction and reviewed. Nothing counted as done until tests and a clean-room run proved it. The [Holepunch](reference/holepunch.html) tracks every requirement against its evidence, and the teams' handoffs are in [reference/chatroom](reference/chatroom/README.md). The original brief is in [reference/project.md](reference/project.md).

**Good to know:** the user switcher demonstrates authorship and per-user views; it is not authentication. Note and comment writes through the API need an `X-Demo-User-ID` header (any id from `GET /users`). The UI sends it for you. The source data has no blood type or status, so patients start active, with blood type left unrecorded rather than invented.
