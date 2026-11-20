"""Verify the compiled Compose stack in an isolated project with disposable data."""

import argparse
import json
import os
import re
import socket
import struct
import subprocess
import tempfile
import time
from html.parser import HTMLParser
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin, urlsplit
from urllib.request import urlopen
from uuid import UUID, uuid4

ROOT = Path(__file__).resolve().parents[2]


def require(condition: bool, message: str) -> None:
    if not condition:
        raise RuntimeError(message)


def response(url: str, expected_status: int = 200) -> tuple[bytes, str]:
    """Allow a bounded recovery window while nginx re-resolves a recreated API."""
    deadline = time.monotonic() + 20
    while True:
        try:
            try:
                result = urlopen(url, timeout=5)
            except HTTPError as error:
                result = error
            with result:
                status = result.status
                body = result.read()
                content_type = result.headers.get_content_type()
        except (URLError, TimeoutError, OSError) as error:
            if time.monotonic() >= deadline:
                raise RuntimeError(
                    f"HTTP endpoint did not become reachable: {url}"
                ) from error
        else:
            if status == expected_status:
                return body, content_type
            if expected_status != 200 or status not in {502, 503, 504}:
                raise RuntimeError(
                    f"{url}: expected HTTP {expected_status}, received {status}."
                )
            if time.monotonic() >= deadline:
                raise RuntimeError(
                    f"{url}: still returned HTTP {status} after recovery wait."
                )
        time.sleep(0.5)


class EntryAssets(HTMLParser):
    """Read the actual entry bundle URLs emitted by Vite, rather than guessing names."""

    def __init__(self) -> None:
        super().__init__()
        self.scripts: list[str] = []
        self.styles: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = dict(attrs)
        if tag == "script" and attributes.get("type") == "module":
            source = attributes.get("src")
            if source:
                self.scripts.append(source)
        if tag == "link" and "stylesheet" in (attributes.get("rel") or "").split():
            source = attributes.get("href")
            if source:
                self.styles.append(source)


def verify_http(frontend: str, backend: str) -> None:
    html, content_type = response(frontend + "/")
    require(
        content_type == "text/html" and b'id="root"' in html,
        "Missing React entry page.",
    )
    assets = EntryAssets()
    assets.feed(html.decode("utf-8"))
    require(bool(assets.scripts), "Entry page has no built JavaScript module.")
    require(bool(assets.styles), "Entry page has no built stylesheet.")
    for source, suffix, media_types in (
        *(
            (source, ".js", {"application/javascript", "text/javascript"})
            for source in assets.scripts
        ),
        *((source, ".css", {"text/css"}) for source in assets.styles),
    ):
        parsed = urlsplit(source)
        require(
            not parsed.scheme
            and not parsed.netloc
            and parsed.path.startswith("/assets/")
            and parsed.path.endswith(suffix),
            f"Expected a compiled local asset, got {source!r}.",
        )
        body, asset_type = response(urljoin(frontend + "/", source))
        require(
            bool(body) and asset_type in media_types,
            f"Invalid asset response: {source}",
        )
    deep_link, deep_type = response(frontend + "/patients/infra-verification")
    require(
        deep_type == "text/html" and deep_link == html,
        "Frontend deep-link fallback failed.",
    )
    response(frontend + "/assets/infra-missing-file.js", 404)
    for address, expected in (
        (backend + "/health", {"status": "ok"}),
        (backend + "/ready", {"status": "ready"}),
        (frontend + "/api/health", {"status": "ok"}),
        (frontend + "/api/ready", {"status": "ready"}),
    ):
        body, response_type = response(address)
        require(
            response_type == "application/json" and json.loads(body) == expected,
            f"Unexpected API response: {address}",
        )
    missing, missing_type = response(frontend + "/api/infra-missing-route", 404)
    require(
        missing_type == "application/json" and isinstance(json.loads(missing), dict),
        "Missing API route returned HTML instead of a JSON 404.",
    )
    docs, docs_type = response(backend + "/docs")
    require(
        docs_type == "text/html" and b"swagger" in docs.lower(),
        "API docs are unavailable.",
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--database-only",
        action="store_true",
        help="verify only PostgreSQL startup and persistence",
    )
    args = parser.parse_args()
    project = f"ascertain-verify-{uuid4().hex[:10]}"
    # Strip inherited Compose settings as well as every configurable project key.
    # Keep Docker connection settings so this uses the caller's selected engine.
    keys = set(
        re.findall(
            r"(?<!\$)\$\{([A-Z][A-Z0-9_]*)", (ROOT / "infra/compose.yml").read_text()
        )
    )
    environment = {
        **{
            key: value
            for key, value in os.environ.items()
            if key not in keys and not key.startswith("COMPOSE_")
        },
        "COMPOSE_PROJECT_NAME": project,
        "COMPOSE_PROFILES": "",
        "POSTGRES_USER": "infra_test",
        "POSTGRES_PASSWORD": "local_test_only",
        "POSTGRES_DB": "infra_test",
        "POSTGRES_PORT": "0",
        "BACKEND_PORT": "0",
        "FRONTEND_PORT": "0",
        "VITE_DATA_MODE": "demo",
        "VITE_API_BASE": "/api",
        "MIGRATE_ON_STARTUP": "false" if args.database_only else "true",
        "SEED_ON_STARTUP": "false" if args.database_only else "true",
    }
    with tempfile.TemporaryDirectory(prefix="ascertain-infra-") as temporary:
        empty_env = Path(temporary) / "empty.env"
        empty_env.touch()
        command = [
            "docker",
            "compose",
            "--project-name",
            project,
            "--env-file",
            str(empty_env),
            "--file",
            str(ROOT / "docker-compose.yml"),
        ]

        def compose(
            *args: str, sql: str | None = None, check: bool = True, timeout: int = 180
        ) -> str:
            result = subprocess.run(
                [*command, *args],
                cwd=ROOT,
                env=environment,
                input=sql,
                capture_output=True,
                text=True,
                timeout=timeout,
                check=False,
            )
            if check and result.returncode:
                print(result.stdout)
                print(result.stderr)
                raise RuntimeError(f"Compose {' '.join(args)} failed.")
            return result.stdout.strip()

        def query(sql: str) -> str:
            return compose(
                "exec",
                "-T",
                "db",
                "sh",
                "-c",
                'PGPASSWORD="$POSTGRES_PASSWORD" psql -h db -U "$POSTGRES_USER" '
                '-d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -At',
                sql=sql,
            )

        def verify_published_http() -> None:
            frontend = "http://" + compose("port", "frontend", "8080")
            backend = "http://" + compose("port", "backend", "8000")
            verify_http(frontend, backend)

        def patient_ids() -> set[str]:
            return {
                str(UUID(value))
                for value in query("SELECT id FROM patients ORDER BY id;").splitlines()
            }

        def seed_markers() -> list[dict[str, object]]:
            return json.loads(
                query(
                    "SELECT coalesce(jsonb_agg(to_jsonb(seed_runs) ORDER BY dataset_key), "
                    "'[]'::jsonb) FROM seed_runs;"
                )
            )

        def verify_seed_preserved(
            expected_ids: set[str],
            edited_id: str,
            deleted_id: str,
            original_markers: list[dict[str, object]],
        ) -> None:
            require(
                patient_ids() == expected_ids,
                "Restart changed patient identities or recreated deleted seed records.",
            )
            require(
                query(f"SELECT first_name FROM patients WHERE id = '{edited_id}';")
                == "InfraEdit",
                "Restart overwrote the deliberate patient edit.",
            )
            require(
                query(f"SELECT count(*) FROM patients WHERE id = '{deleted_id}';")
                == "0",
                "Restart restored the deliberately deleted patient.",
            )
            require(
                query("SELECT count(DISTINCT source_patient_id) FROM patients;")
                == "99",
                "Restart duplicated or lost imported source patient identities.",
            )
            require(
                seed_markers() == original_markers,
                "Restart duplicated, replaced, or modified completed seed markers.",
            )

        services = ["db"] if args.database_only else []
        try:
            compose(
                "up",
                "-d",
                "--build",
                "--wait",
                "--wait-timeout",
                "120",
                *services,
                timeout=600,
            )
            require(
                query("SELECT current_database();") == "infra_test",
                "Wrong verification database.",
            )
            if args.database_only:
                require(
                    query(
                        "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';"
                    )
                    == "0",
                    "Expected a fresh database with application migrations disabled.",
                )
            else:
                expected_revisions = {
                    line.split()[0]
                    for line in compose(
                        "exec", "-T", "backend", "alembic", "heads"
                    ).splitlines()
                    if "(head)" in line
                }
                require(
                    bool(expected_revisions)
                    and set(
                        query(
                            "SELECT version_num FROM alembic_version ORDER BY version_num;"
                        ).splitlines()
                    )
                    == expected_revisions,
                    "Automatic startup did not apply the current Alembic heads.",
                )
                initial_ids = patient_ids()
                require(
                    len(initial_ids) == 100
                    and query("SELECT count(DISTINCT source_patient_id) FROM patients;")
                    == "100",
                    "Automatic startup did not seed exactly 100 distinct source patients.",
                )
                require(
                    query(
                        "SELECT count(*) FROM seed_runs WHERE dataset_key LIKE 'patients-%' "
                        "AND completed_at IS NOT NULL AND row_counts->>'patients' = '100';"
                    )
                    == "1"
                    and query(
                        "SELECT count(*) FROM seed_runs WHERE completed_at IS NULL;"
                    )
                    == "0",
                    "Missing or incomplete patient seed completion marker.",
                )
                original_markers = seed_markers()
                require(
                    query(
                        "SELECT count(*) FROM patients p JOIN seed_runs s ON s.id = p.seed_run_id "
                        "WHERE s.dataset_key LIKE 'patients-%' AND s.completed_at IS NOT NULL;"
                    )
                    == "100",
                    "Seeded patients are not linked to their completed import marker.",
                )
                # UUID parsing constrains the only values interpolated into mutation SQL.
                # These edits affect only the random verification project's database.
                edited_id, deleted_id = [
                    str(UUID(value))
                    for value in query(
                        "SELECT id FROM patients ORDER BY source_patient_id DESC LIMIT 2;"
                    ).splitlines()
                ]
                query(
                    "BEGIN; "
                    f"UPDATE patients SET first_name = 'InfraEdit', updated_at = now() "
                    f"WHERE id = '{edited_id}'; "
                    f"DELETE FROM patients WHERE id = '{deleted_id}'; "
                    "COMMIT;"
                )
                expected_ids = initial_ids - {deleted_id}
                verify_seed_preserved(
                    expected_ids, edited_id, deleted_id, original_markers
                )
                print(
                    "PASS: automatic Alembic migration, 100 seeded patients and completed import markers.",
                    flush=True,
                )
            address = compose("port", "db", "5432")
            host, port = address.rsplit(":", 1)
            with socket.create_connection((host, int(port)), timeout=5) as connection:
                # PostgreSQL's SSL negotiation proves the published port reaches Postgres.
                connection.sendall(struct.pack("!II", 8, 80877103))
                require(
                    connection.recv(1) in {b"S", b"N"},
                    "Published port did not answer as PostgreSQL.",
                )
            query(
                "CREATE TABLE infra_probe (value text NOT NULL); INSERT INTO infra_probe VALUES ('retained');"
            )
            print(
                "PASS: fresh PostgreSQL, authenticated SQL and localhost port.",
                flush=True,
            )
            if not args.database_only:
                verify_published_http()
                print(
                    "PASS: compiled frontend, assets, deep links, API proxy and direct API docs.",
                    flush=True,
                )
                before = compose("ps", "-q", "backend")
                compose("restart", "backend")
                # Wait on the existing container: `up` may reconcile/recreate it.
                compose("start", "--wait", "--wait-timeout", "120", "backend")
                require(
                    compose("ps", "-q", "backend") == before,
                    "Expected an ordinary backend restart without container replacement.",
                )
                verify_seed_preserved(
                    expected_ids, edited_id, deleted_id, original_markers
                )
                verify_published_http()
                print(
                    "PASS: ordinary restart preserves the patient edit, deletion and seed markers.",
                    flush=True,
                )
                compose(
                    "up",
                    "-d",
                    "--no-deps",
                    "--force-recreate",
                    "--wait",
                    "--wait-timeout",
                    "120",
                    "backend",
                )
                require(
                    compose("ps", "-q", "backend") != before,
                    "Backend was not recreated.",
                )
                verify_seed_preserved(
                    expected_ids, edited_id, deleted_id, original_markers
                )
                verify_published_http()
                print(
                    "PASS: backend recreation preserves edited seed data and restores API forwarding.",
                    flush=True,
                )
            compose("down")
            compose("up", "-d", "--wait", "--wait-timeout", "120", *services)
            require(
                query("SELECT value FROM infra_probe;") == "retained",
                "Database data was not retained.",
            )
            if not args.database_only:
                verify_seed_preserved(
                    expected_ids, edited_id, deleted_id, original_markers
                )
                verify_published_http()
                print(
                    "PASS: full stack recreation preserves the edit, deletion, markers and HTTP availability.",
                    flush=True,
                )
            print("PASS: data survives container removal and recreation.", flush=True)
        except BaseException:
            try:
                print(
                    compose(
                        "logs", "--no-color", "--tail", "80", check=False, timeout=30
                    )
                )
            except (OSError, subprocess.TimeoutExpired):
                print("Container diagnostics could not be collected.", flush=True)
            raise
        finally:
            # This random project is created here; never delete the developer's volume.
            compose("down", "--volumes", "--remove-orphans")
            print(f"Removed disposable verification project {project}.", flush=True)


if __name__ == "__main__":
    main()
