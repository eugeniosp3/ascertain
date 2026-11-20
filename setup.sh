#!/bin/sh
# One-command setup: checks Docker, prepares .env, builds and starts the stack,
# waits for health checks, then prints where everything is running.
set -eu

usage() {
    printf 'Usage: ./setup.sh [--dev]\n\n'
    printf 'Default: build and start the compiled application.\n'
    printf -- '--dev:   start Vite and FastAPI with hot reload.\n'
}

# Styling only when writing to an interactive terminal.
if [ -t 1 ]; then
    bold=$(printf '\033[1m') green=$(printf '\033[32m') red=$(printf '\033[31m') reset=$(printf '\033[0m')
else
    bold='' green='' red='' reset=''
fi

total_steps=5
step() { printf '\n%s[%s/%s] %s%s\n' "$bold" "$1" "$total_steps" "$2" "$reset"; }
ok() { printf '      %s✔%s %s\n' "$green" "$reset" "$1"; }
fail() {
    printf '\n%s✘ Setup failed:%s %s\n' "$red" "$reset" "$1" >&2
    exit 1
}

mode=compiled
case "${1:-}" in
    '') ;;
    --dev) mode=development ;;
    --help|-h) usage; exit 0 ;;
    *) usage >&2; exit 2 ;;
esac
[ "$#" -le 1 ] || { usage >&2; exit 2; }

repo_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$repo_dir"

compose_file=docker-compose.yml
compose_cmd='docker compose'
if [ "$mode" = development ]; then
    compose_file=infra/docker-compose.dev.yml
    compose_cmd='docker compose -f infra/docker-compose.dev.yml'
fi

printf '%sAscertain patient dashboard: %s setup%s\n' "$bold" "$mode" "$reset"

step 1 'Checking Docker'
# Desktop may need to start before its Docker CLI becomes available in WSL.
. "$repo_dir/infra/scripts/ensure-docker.sh"
ensure_docker
command -v docker >/dev/null 2>&1 || fail 'Install Docker Desktop: https://docs.docker.com/get-docker/'
docker compose version >/dev/null 2>&1 || fail 'Docker Compose 2.20 or newer is required. See infra/README.md.'
ok "Docker $(docker version --format '{{.Server.Version}}' 2>/dev/null || printf 'engine') with Compose $(docker compose version --short 2>/dev/null || printf 'v2')"

step 2 'Preparing configuration'
if [ ! -e .env ] && [ ! -L .env ]; then
    [ -r .env.example ] || fail 'The .env.example template is missing or unreadable.'
    # Noclobber also protects an .env created concurrently by another process.
    (umask 077; set -C; cat .env.example > .env) || fail 'Could not create .env; existing files were not overwritten.'
    ok 'Created .env from .env.example'
else
    [ -f .env ] && [ -r .env ] || fail '.env exists but is not a readable file.'
    ok 'Using your existing .env (left unchanged)'
fi
docker compose -f "$compose_file" config --quiet || fail 'Compose configuration is invalid. Check the message above and your .env.'
ok 'Compose configuration is valid'

step 3 'Building images (the first run downloads dependencies and can take a few minutes)'
docker compose -f "$compose_file" build || fail 'The image build failed. See the output above.'
ok 'Images built'

step 4 'Starting services and waiting for health checks'
if ! docker compose -f "$compose_file" up -d --wait --wait-timeout 180; then
    docker compose -f "$compose_file" ps >&2 || true
    printf '\nInspect the logs with: %s logs --tail 100\n' "$compose_cmd" >&2
    fail 'The application did not start successfully. Your database volume was preserved.'
fi
ok 'All services are healthy'

step 5 'Ready'
frontend_port=$(docker compose -f "$compose_file" port frontend 8080)
backend_port=$(docker compose -f "$compose_file" port backend 8000)
database_port=$(docker compose -f "$compose_file" port db 5432)
frontend_port=${frontend_port##*:} backend_port=${backend_port##*:} database_port=${database_port##*:}
db_user=$(sed -n 's/^POSTGRES_USER=//p' .env | tail -n 1)
db_name=$(sed -n 's/^POSTGRES_DB=//p' .env | tail -n 1)

printf '\n%s%s✔ Ascertain is running.%s Open it in your browser:\n\n' "$bold" "$green" "$reset"
printf '    Dashboard     http://localhost:%s\n' "$frontend_port"
printf '    API docs      http://localhost:%s/docs\n' "$backend_port"
printf '    API health    http://localhost:%s/health\n' "$backend_port"
printf '    PostgreSQL    localhost:%s  (user %s, database %s)\n' "$database_port" "${db_user:-see .env}" "${db_name:-see .env}"
if [ "$mode" = development ]; then
    printf '\n    Hot reload is on: frontend and Python edits apply without rebuilding.\n'
fi

printf '\n%sServices%s\n' "$bold" "$reset"
services=$(docker compose -f "$compose_file" ps --format 'table {{.Service}}\t{{.State}}\t{{.Status}}' 2>/dev/null) \
    || services=$(docker compose -f "$compose_file" ps)
printf '%s\n' "$services" | sed 's/^/    /'

printf '\n%sUseful commands%s\n' "$bold" "$reset"
printf '    Follow logs   %s logs -f\n' "$compose_cmd"
printf '    Stop          %s down        (keeps your data)\n' "$compose_cmd"
printf '    Reset data    %s down -v     (deletes the database volume)\n' "$compose_cmd"
