# Ascertain healthcare dashboard

[![CI](https://github.com/eugeniosp3/ascertain/actions/workflows/ci.yml/badge.svg)](https://github.com/eugeniosp3/ascertain/actions/workflows/ci.yml)

## TLDR

1. Make sure [Docker Desktop](https://docs.docker.com/get-docker/) is installed and its initial setup has been completed.
2. Open a terminal in the root of the repository and run:

```sh
./setup.sh
```

The script starts Docker Desktop if needed and handles application setup. Use `./setup.sh --dev` for hot reload. On Windows, run it from a WSL 2 terminal.

## Step-by-Step Setup

The setup script starts Docker Desktop if necessary, waits for the engine, creates `.env` if missing, preserves existing settings and database data, builds the images, starts all services, waits for healthchecks, and prints the URLs. To set up manually or understand each step, follow along below.

### 1. Install Docker

Install Docker Desktop and complete its initial configuration. The setup script opens it when needed. Run commands in macOS Terminal, a Linux terminal, or a WSL 2 terminal on Windows with Docker Desktop's WSL integration enabled. An already-running Docker Engine is also supported. The [infrastructure guide](infra/README.md#1-install-docker) covers platform details and manual startup.

### 2. Configure and run the application

For manual setup, open Docker Desktop and wait for its engine. From a fresh checkout, copy the sample configuration. Preserve an existing `.env` and skip the copy if it is already present.

```sh
cp .env.example .env
docker compose up -d --build --wait
```

Open [the frontend](http://localhost:8080) or [API documentation](http://localhost:8000/docs). Compose starts the compiled React frontend through nginx, FastAPI, and PostgreSQL.

The frontend defaults to **demo mode** while live API integration is being completed. Demo patient edits are kept in the browser's in-memory data source, not PostgreSQL. The sample configuration enables automatic database migrations and seeding; an existing `.env` keeps its own settings.

### 3. Develop with hot reload

```sh
docker compose -f infra/docker-compose.dev.yml up -d --build --wait
```

Use the same [frontend URL](http://localhost:8080). Local frontend edits update through Vite; Python edits restart FastAPI through Uvicorn. No rebuild is needed for normal source edits. Re-run the command after changing dependencies or Dockerfiles. To return to the compiled setup, run the normal startup command above.

### 4. Configuration

[.env.example](.env.example) lists every configurable Compose key with sample values. [.gitignore](.gitignore) excludes `.env` and local variants, and [.dockerignore](.dockerignore) excludes them from image builds.

Database credentials configure containers at startup and are not baked into images. `VITE_DATA_MODE` and `VITE_API_BASE` are public frontend settings: the normal build embeds them in browser assets, so changing them requires a frontend rebuild. Development mode reads them when Vite starts.

The sample database is `sample_db` on `localhost:5432`, with user `sample_user` and password `sample_password`. These are local demo credentials; an existing `.env` takes precedence. To run only PostgreSQL, use `docker compose up -d --wait db`.

See [the infrastructure setup guide](infra/README.md) for connections, logs, stopping, development, and checks. The original assignment is in [reference/project.md](reference/project.md).

## Continuous integration

[GitHub Actions](https://github.com/eugeniosp3/ascertain/actions/workflows/ci.yml) runs on pull requests, pushes to the default branch, and manual requests. It checks ESLint/Prettier, Ruff linting/formatting, TypeScript, mypy, unit and integration tests, Docker builds, and clean startup with migrations and sample data.

A separate browser job runs desktop/mobile demo journeys and HTTP-adapter contract tests with Playwright. The contract tests use controlled HTTP fixtures; they are distinct from the real PostgreSQL/backend tests. Formatting violations fail CI instead of rewriting source files.

The public repository requires approval for fork workflows from all external contributors. Workflow tokens have read-only repository permissions, and CI uses GitHub-hosted runners without deployment secrets. Personal `study_mats/` files and real `.env` files are excluded from Git.
