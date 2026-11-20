#!/bin/sh
# One-command setup. Opens an installed Docker Desktop when needed.
set -eu

usage() {
    printf 'Usage: ./setup.sh [--dev]\n\n'
    printf 'Default: build and start the compiled application.\n'
    printf -- '--dev:   start Vite and FastAPI with hot reload.\n'
}

fail() {
    printf 'Setup failed: %s\n' "$1" >&2
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

# Desktop may need to start before its Docker CLI becomes available in WSL.
. "$repo_dir/infra/scripts/ensure-docker.sh"
ensure_docker
command -v docker >/dev/null 2>&1 || fail 'Install Docker Desktop: https://docs.docker.com/get-docker/'
docker compose version >/dev/null 2>&1 || fail 'Docker Compose 2.20 or newer is required. See infra/README.md.'

if [ ! -e .env ] && [ ! -L .env ]; then
    [ -r .env.example ] || fail 'The .env.example template is missing or unreadable.'
    # Noclobber also protects an .env created concurrently by another process.
    (umask 077; set -C; cat .env.example > .env) || fail 'Could not create .env; existing files were not overwritten.'
    printf 'Created .env from the sample configuration.\n'
else
    [ -f .env ] && [ -r .env ] || fail '.env exists but is not a readable file.'
    printf 'Keeping your existing .env unchanged.\n'
fi

compose_file=docker-compose.yml
if [ "$mode" = development ]; then
    compose_file=infra/docker-compose.dev.yml
fi

docker compose -f "$compose_file" config --quiet || fail 'Compose configuration is invalid. Check the message above and your .env.'
printf 'Building and starting the %s setup...\n' "$mode"
if ! docker compose -f "$compose_file" up -d --build --wait --wait-timeout 180; then
    printf 'Inspect service logs with: docker compose -f %s logs --tail 100\n' "$compose_file" >&2
    fail 'The application did not start successfully. Your database volume was preserved.'
fi

frontend_address=$(docker compose -f "$compose_file" port frontend 8080)
backend_address=$(docker compose -f "$compose_file" port backend 8000)
database_address=$(docker compose -f "$compose_file" port db 5432)
printf '\nApplication started.\n'
printf 'Frontend:   http://%s\n' "$frontend_address"
printf 'API docs:   http://%s/docs\n' "$backend_address"
printf 'PostgreSQL: %s\n' "$database_address"
if [ "$mode" = development ]; then
    printf 'Hot reload is enabled for frontend and Python source edits.\n'
fi
