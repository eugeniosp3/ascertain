# Local setup

## TLDR

1. Make sure [Docker Desktop](https://docs.docker.com/get-docker/) is installed and its initial setup has been completed.
2. Open a terminal in the root of the repository and run:

```sh
./setup.sh
```

The script starts Docker Desktop if needed and handles application setup. Use `./setup.sh --dev` for hot reload. On Windows, run it from a WSL 2 terminal.

## Step-by-Step Setup

The setup script starts Docker Desktop if necessary, waits for the engine, creates `.env` only if needed, preserves existing settings and database data, builds the images, starts the services, waits for healthchecks, and prints the URLs. To set up manually or understand each step, follow along below.

Docker Compose runs the React frontend, FastAPI backend, and PostgreSQL. There are two setups: a compiled frontend for the interviewer, and a development override with hot reload.

The frontend currently defaults to **demo mode**. Demo edits use in-memory fixtures and do not persist to PostgreSQL. The sample configuration enables database migrations and seeding automatically. An existing `.env` is preserved, including any disabled initialization flags.

### 1. Install Docker

- **macOS:** Install [Docker Desktop for Mac](https://docs.docker.com/desktop/setup/install/mac-install/) and complete its initial configuration. Run the commands in Terminal. The setup script opens Desktop when needed.
- **Windows:** Install [Docker Desktop for Windows](https://docs.docker.com/desktop/setup/install/windows-install/) using its WSL 2 backend and Linux containers. Enable [WSL integration](https://docs.docker.com/desktop/features/wsl/) for your Linux distribution, then run the commands from that distribution's terminal, such as Ubuntu. `setup.sh` is a shell script; use WSL rather than PowerShell or Command Prompt for it.
- **Linux:** Install [Docker Desktop for Linux](https://docs.docker.com/desktop/setup/install/linux/) and complete its initial configuration, or use [Docker Engine and the Compose plugin](https://docs.docker.com/engine/install/). The script can start Desktop; a native Engine service must already be running and accessible. Follow Docker's [post-installation instructions](https://docs.docker.com/engine/install/linux-postinstall/) if your user cannot access the engine.

The script reuses an already-running engine and does not replace a deliberately selected remote or alternative Docker context. If Docker displays first-launch prompts, complete them. On Windows, Docker must be available inside your WSL terminal after Desktop starts.

For the manual steps below, open Docker Desktop first (or start your Engine service). In the terminal you will use for this project, check:

```sh
docker version
docker compose version
```

`docker version` should show a Server section. Use Compose 2.20 or newer for its [include support](https://docs.docker.com/reference/compose-file/include/). You do not need Node, Python, npm, or PostgreSQL installed locally to run the application containers.

### 2. Copy the sample configuration

Open a terminal in the project root, which contains `docker-compose.yml`:

```sh
cd /path/to/ascertain
cp .env.example .env
```

**If `.env` already exists, preserve it and skip the copy.** The committed [.env.example](../.env.example) contains all configurable Compose keys, including the sample database, user, and password. [.gitignore](../.gitignore) ignores local `.env` files but keeps the example; [.dockerignore](../.dockerignore) keeps environment files out of image builds.

Compose reads the root `.env` automatically. The sample defaults also work when it is absent. Database credentials are runtime configuration, not Docker build arguments.

### 3. Build and run the application

```sh
docker compose up -d --build --wait
docker compose ps
```

The first run downloads images and dependencies, compiles the frontend, and waits for healthy services. Open:

| Service | Default address |
| --- | --- |
| React frontend | [http://localhost:8080](http://localhost:8080) |
| API documentation | [http://localhost:8000/docs](http://localhost:8000/docs) |
| API liveness | [http://localhost:8000/health](http://localhost:8000/health) |
| Database connectivity | [http://localhost:8000/ready](http://localhost:8000/ready) |
| PostgreSQL | `localhost:5432` |

nginx serves the built frontend, supports refreshed deep links, and forwards `/api/...` to the backend with `/api` removed. Backend errors remain API responses. `/ready` checks database connectivity, not successful patient seeding.

### 4. Develop with hot reload

Use the development override instead of the normal startup command:

```sh
docker compose -f infra/docker-compose.dev.yml up -d --build --wait
```

The frontend remains at [http://localhost:8080](http://localhost:8080).

- Your `frontend/` source is mounted into the frontend container. Vite watches edits and updates the browser. File polling helps detect changes across host/container file mounts.
- Your backend application and data-package Python source are mounted into the API container. Uvicorn's `--reload` restarts its worker when Python files change.
- Frontend dependencies stay in a Docker volume, separate from any host `node_modules`. The development container runs `npm ci` on startup to match the lockfile.
- Normal source edits need no image rebuild. Dependency or Dockerfile changes need the same development command again with `--build`.

To return to the compiled interviewer setup, run `docker compose up -d --build --wait`. Both modes use the same database volume and host ports; switching modes recreates application containers without deleting database data.

### 5. Connect to PostgreSQL

For the sample `.env`, use database `sample_db`, username `sample_user`, password `sample_password`, and host `localhost:5432`. If you already have an `.env`, use its values instead. These are local demo credentials; host ports bind only to localhost.

Open the PostgreSQL client inside its container:

```sh
docker compose exec db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

Run `SELECT current_database(), current_user;` and type `\q` to exit. A native backend uses `postgresql+psycopg://sample_user:sample_password@localhost:5432/sample_db`; a container uses host `db` and port `5432`. URL-encode credentials when constructing a URL manually.

For database-only work:

```sh
docker compose up -d --wait db
```

### 6. Logs, shutdown, and reset

```sh
docker compose logs --tail 100 frontend backend db
docker compose --profile '*' down
```

Normal shutdown preserves database data. In development, use the development `-f` argument for logs and shutdown so the command matches that setup:

```sh
docker compose -f infra/docker-compose.dev.yml logs -f frontend backend
docker compose -f infra/docker-compose.dev.yml --profile '*' down
```

Only to **deliberately erase this project's local database and development dependency volumes**:

```sh
docker compose -f infra/docker-compose.dev.yml --profile '*' down --volumes
```

### 7. Configuration and live data

Change `FRONTEND_PORT`, `BACKEND_PORT`, or `POSTGRES_PORT` in the root `.env` if a host port is occupied, then repeat your startup command. Internal service ports do not change.

`POSTGRES_DB`, `POSTGRES_USER`, and `POSTGRES_PASSWORD` initialize an empty volume. Changing them later does not rename an existing database or reset its password. Preserve existing values unless you are deliberately replacing a disposable database.

`VITE_DATA_MODE=demo` selects the frontend's fixture adapter. `VITE_DATA_MODE=api` selects HTTP requests without falling back to fixtures. Keep `VITE_API_BASE=/api` for this setup. These two settings are public and are embedded in compiled browser assets; never put secrets in `VITE_*` values. Rebuild the frontend after changing them. Vite's development proxy forwards the same `/api` paths to `backend:8000`.

The sample configuration sets `MIGRATE_ON_STARTUP=true` and `SEED_ON_STARTUP=true`. The entrypoint runs Alembic, then the backend's `python -m app.seed`, then starts FastAPI. A failure stops startup. The image prepares bronze/silver DuckDB snapshots from committed patient source for this command; it does not rely on host-generated database files. The older JSONL `patient_data.seed` command is not part of this runtime sequence. Existing environment files may still have initialization disabled; the setup script intentionally preserves them.

### 8. Run checks

Run application checks inside Docker:

```sh
docker compose --profile checks build checks frontend-checks
docker compose --profile checks run --rm checks
docker compose --profile checks run --rm frontend-checks
docker compose --profile checks rm -sf test-db
```

The Python checks use a separate disposable PostgreSQL database on an internal test network. Its passwordless temporary roles support permission tests; development PostgreSQL still requires its password.

With Python 3 available, run the compiled-stack HTTP and persistence checks in an isolated project:

```sh
python3 infra/scripts/verify_stack.py
```

That command builds the compiled frontend, checks assets, deep links and API forwarding, recreates containers, and verifies database persistence. It uses its own temporary ports and database volume, then removes them. Add `--database-only` to check PostgreSQL alone. These infrastructure checks do not replace the frontend's browser tests or prove a patient workflow against live API data.

[CI](../.github/workflows/ci.yml) runs the containerized checks and isolated verification. Hosted CI requires a published repository. [checklist.md](checklist.md) tracks remaining integration work.

### 9. Where the Docker files live

The root `docker-compose.yml` is a small entry point so the interviewer's normal command stays unchanged. Actual service configuration, Dockerfiles, nginx configuration, and helper scripts live here:

```text
infra/
  compose.yml                 # Shared services, ports, healthchecks and volumes
  compose.dev.yml             # Source mounts and hot-reload overrides
  docker-compose.dev.yml      # Development entry point combining both files
  docker/
    backend.Dockerfile
    frontend.Dockerfile
  nginx/
  scripts/
```

Both entry points use the project root for builds and the same Compose project name, so switching modes preserves the database volume. The root `.dockerignore` applies to that shared build context.
