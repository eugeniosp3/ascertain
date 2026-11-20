"""Verify the compiled Compose stack in an isolated project with disposable data."""

import argparse
import json
import os
import re
import shutil
import signal
import socket
import struct
import subprocess
import tempfile
import time
from html.parser import HTMLParser
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin, urlsplit
from urllib.request import Request, urlopen
from uuid import UUID, uuid4

ROOT = Path(__file__).resolve().parents[2]


def require(condition: bool, message: str) -> None:
    if not condition:
        raise RuntimeError(message)


def response(
    url: str, expected_status: int = 200, *, recovery_timeout: float = 20
) -> tuple[bytes, str]:
    """Allow a bounded recovery window while nginx re-resolves a recreated API."""
    deadline = time.monotonic() + recovery_timeout
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


def cache_directives(url: str, expected_status: int = 200) -> set[str]:
    try:
        result = urlopen(Request(url, method="HEAD"), timeout=5)
    except HTTPError as error:
        result = error
    with result:
        require(
            result.status == expected_status, f"Unexpected cache-probe status: {url}"
        )
        require(
            result.headers.get("X-Content-Type-Options") == "nosniff",
            "Cache configuration dropped the content-type protection header.",
        )
        return {
            directive.strip().lower()
            for directive in result.headers.get("Cache-Control", "").split(",")
            if directive.strip()
        }


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
    for route in ("/", "/index.html", "/patients/infra-verification"):
        require(
            "no-cache" in cache_directives(frontend + route),
            f"Entry HTML must be revalidated: {route}",
        )
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
        require(
            {"public", "max-age=31536000", "immutable"}
            <= cache_directives(urljoin(frontend + "/", source)),
            f"Fingerprinted asset is missing its immutable cache policy: {source}",
        )
    deep_link, deep_type = response(frontend + "/patients/infra-verification")
    require(
        deep_type == "text/html" and deep_link == html,
        "Frontend deep-link fallback failed.",
    )
    response(frontend + "/assets/infra-missing-file.js", 404)
    require(
        "immutable"
        not in cache_directives(frontend + "/assets/infra-missing-file.js", 404),
        "Missing assets must not be cached as immutable.",
    )
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


def run_live_browser(frontend: str, environment: dict[str, str]) -> None:
    """Run the frontend-owned suite and stop its process group before stack teardown."""
    command = ["npm", "run", "e2e:live", "--", "--workers=1"]
    with subprocess.Popen(
        command,
        cwd=ROOT / "frontend",
        env={**environment, "PLAYWRIGHT_LIVE_BASE_URL": frontend},
        start_new_session=True,
    ) as process:
        try:
            return_code = process.wait(timeout=900)
        except BaseException:
            try:
                os.killpg(process.pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                try:
                    os.killpg(process.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                process.wait(timeout=10)
            raise
        if return_code:
            raise subprocess.CalledProcessError(return_code, command)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument(
        "--database-only",
        action="store_true",
        help="verify only PostgreSQL startup and persistence",
    )
    modes.add_argument(
        "--live-browser",
        action="store_true",
        help="run the frontend live browser suite against an isolated API-mode build",
    )
    args = parser.parse_args()
    if args.live_browser:
        require(
            os.name == "posix",
            "Run live browser verification in macOS/Linux or a WSL 2 terminal.",
        )
        manifest = json.loads((ROOT / "frontend/package.json").read_text())
        require(
            bool(manifest.get("scripts", {}).get("e2e:live"))
            and (ROOT / "frontend/playwright.live.config.ts").is_file()
            and (ROOT / "frontend/e2e-live").is_dir(),
            "Frontend live test handoff is missing: e2e:live, playwright.live.config.ts and e2e-live/ are required.",
        )
        require(
            shutil.which("npm") is not None,
            "Live browser verification needs Node/npm, frontend dependencies and installed Chrome.",
        )
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
            if key not in keys
            and not key.startswith("COMPOSE_")
            and not key.startswith("PLAYWRIGHT_")
        },
        "COMPOSE_PROJECT_NAME": project,
        "COMPOSE_PROFILES": "",
        "POSTGRES_USER": "infra_test",
        "POSTGRES_PASSWORD": "local_test_only",
        "POSTGRES_DB": "infra_test",
        "POSTGRES_PORT": "0",
        "BACKEND_PORT": "0",
        "FRONTEND_PORT": "0",
        "VITE_DATA_MODE": "api" if args.live_browser else "demo",
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

        def verify_proxy_log_privacy() -> None:
            frontend = "http://" + compose("port", "frontend", "8080")
            marker = "infra-private-search-" + uuid4().hex
            patient_id = str(
                UUID(query("SELECT id FROM patients ORDER BY id LIMIT 1;"))
            )
            response(frontend + "/api/patients?q=" + marker)
            response(frontend + "/api/patients/" + patient_id)
            # An upstream failure can also put raw request URLs in nginx error
            # logs. Exercise it only in this random disposable Compose project.
            try:
                compose("stop", "backend")
                response(frontend + "/api/patients?q=" + marker, 502)
            finally:
                compose("start", "backend")
                backend = "http://" + compose("port", "backend", "8000")
                ready, ready_type = response(backend + "/ready", recovery_timeout=120)
                require(
                    ready_type == "application/json"
                    and json.loads(ready) == {"status": "ready"},
                    "Backend did not recover after the isolated log-privacy probe.",
                )
            logs = compose("logs", "--no-color", "frontend", "backend")
            require(
                marker not in logs and patient_id not in logs,
                "An API search value or patient identifier appeared in service logs.",
            )
            print(
                "PASS: API search/entity/upstream-failure logs omit request values and patient IDs.",
                flush=True,
            )

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

        def seed_patient_fingerprint() -> str:
            # Return only a digest, never patient contents in the verification log.
            return query(
                "SELECT md5(coalesce(jsonb_agg(to_jsonb(p) ORDER BY id), '[]'::jsonb)::text) "
                "FROM patients p WHERE source_patient_id IS NOT NULL;"
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
                if args.live_browser:
                    original_patient_fingerprint = seed_patient_fingerprint()
                    verify_published_http()
                    frontend_address = "http://" + compose("port", "frontend", "8080")
                    print(
                        f"Running live browser tests against isolated API frontend: {frontend_address}",
                        flush=True,
                    )
                    # The frontend owns the tests. They use real same-origin /api
                    # calls, create unique patients, and clean up only their own IDs.
                    run_live_browser(frontend_address, environment)
                    require(
                        patient_ids() == initial_ids,
                        "Live browser tests changed the seed patient set or left disposable patients behind.",
                    )
                    require(
                        seed_markers() == original_markers,
                        "Live browser tests modified completed seed markers.",
                    )
                    require(
                        seed_patient_fingerprint() == original_patient_fingerprint,
                        "Live browser tests modified seed patient profiles.",
                    )
                    print(
                        "PASS: real frontend/API browser journeys and disposable-patient cleanup.",
                        flush=True,
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
                # Poll the API without reconciling containers or requiring newer
                # Compose `start --wait` support. Serving begins after seeding.
                backend_address = "http://" + compose("port", "backend", "8000")
                ready, ready_type = response(
                    backend_address + "/ready", recovery_timeout=120
                )
                require(
                    ready_type == "application/json"
                    and json.loads(ready) == {"status": "ready"},
                    "Restarted backend did not become ready.",
                )
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
                verify_proxy_log_privacy()
                verify_seed_preserved(
                    expected_ids, edited_id, deleted_id, original_markers
                )
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
