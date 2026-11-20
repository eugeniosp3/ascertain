"""Configure container connections, then run a command or start the API."""

import os
import subprocess
import sys

from sqlalchemy.engine import URL


def enabled(name: str) -> bool:
    value = os.environ.get(name, "false").lower()
    if value not in {"true", "false"}:
        raise ValueError(f"{name} must be true or false.")
    return value == "true"


def main() -> int:
    # Construct the URL rather than interpolate it: passwords may contain @, / or :.
    if "POSTGRES_HOST" in os.environ:
        url = URL.create(
            "postgresql+psycopg",
            username=os.environ["POSTGRES_USER"],
            password=os.environ["POSTGRES_PASSWORD"],
            host=os.environ["POSTGRES_HOST"],
            port=5432,
            database=os.environ["POSTGRES_DB"],
        ).render_as_string(hide_password=False)
        os.environ["DATABASE_URL"] = url

    command = sys.argv[1:] or ["serve"]
    if command[0] == "serve":
        if command not in (["serve"], ["serve", "--reload"]):
            raise ValueError("Use serve or serve --reload.")
        reload = "--reload" in command
        migrate, seed = enabled("MIGRATE_ON_STARTUP"), enabled("SEED_ON_STARTUP")
        if seed and not migrate:
            raise ValueError("SEED_ON_STARTUP=true requires MIGRATE_ON_STARTUP=true.")
        if migrate:
            print("Applying backend migrations.", flush=True)
            subprocess.run(["alembic", "upgrade", "head"], check=True)
        if seed:
            print("Running the backend DuckDB seed command.", flush=True)
            subprocess.run([sys.executable, "-m", "app.seed"], check=True)
        if not migrate:
            print(
                "Starting API; automatic migrations and seeding are disabled.",
                flush=True,
            )
        command = [
            "uvicorn",
            "app.main:create_app",
            "--factory",
            "--no-access-log",
            "--host",
            "0.0.0.0",
            "--port",
            "8000",
        ]
        if reload:
            command.extend(
                [
                    "--reload",
                    "--reload-dir",
                    "/workspace/backend/app",
                    "--reload-dir",
                    "/workspace/data/src",
                ]
            )
    os.execvp(command[0], command)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except ValueError as error:
        print(f"Startup configuration error: {error}", file=sys.stderr)
        raise SystemExit(2) from None
    except subprocess.CalledProcessError as error:
        print(
            "Database initialization failed; the API was not started.", file=sys.stderr
        )
        raise SystemExit(error.returncode) from None
