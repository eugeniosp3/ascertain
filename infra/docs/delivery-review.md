# Infrastructure review — 2026-11-20

Scope: Dockerfiles, Compose entry points, nginx, setup, verification scripts and GitHub Actions. The review started from published commit `80c9dab`; any changes described below remain local until separately published.

## Hosted CI result

[Run 44811327552](https://github.com/eugeniosp3/ascertain/actions/runs/44811327552) finished **failed** on `80c9dab971e3e59eaf9dca40999bfa02f373410a`.

- Demo and intercepted-contract regressions passed.
- Container builds and application lint/format/type/unit checks passed.
- All 16 real API browser cases passed, including disposable-record cleanup.
- Both infrastructure jobs then failed in the stopped-backend privacy probe: it required HTTP `502`, while nginx returned `504`. Earlier seed, asset, proxy, restart and replacement checks passed. This is a verifier assumption to correct, not evidence that the entire run passed.

## Simplicity decisions

| Area checked | Finding and decision |
| --- | --- |
| Compose file count | Retain one shared service definition, a development override and its short entry point. The root wrapper preserves the standard command. Flattening must account for `include` path resolution, environment precedence, bind paths and project/volume identity; fewer filenames alone is not a sufficient benefit. |
| Long verifier | Keep its explicit lifecycle sequence and independent SQL/HTTP checks. Preserve ordinary-restart versus replacement assertions, bounded recovery and final cleanup. Restrict changes to demonstrated defects or repeated mechanics; do not replace the script with a new framework. |
| Multi-stage images | Dependencies precede source copies; final frontend contains compiled assets, while checks/development stages remain separate. Python runtime copies application/data inputs explicitly and uses non-root `app`; frontend uses non-root `nginx`. |
| Setup behavior | Existing `.env`, selected Docker context and database volume are preserved. The script validates configuration and prints resolved ports. It does not reset data or silently change a deliberately selected engine. |
| nginx routing/cache/privacy | API requests have a dedicated proxy location; SPA fallbacks return entry HTML; missing assets stay 404. Entry HTML revalidates, fingerprinted assets cache, and access summaries omit URLs. Suppressed API upstream error detail is an explicit diagnostic trade-off. |
| CI authority and isolation | Read-only workflow permissions, SHA-pinned actions, non-persisted checkout credentials, bounded jobs, explicit data modes, separate disposable PostgreSQL and project-scoped cleanup. No production deployment credentials or privileged `pull_request_target` checkout. |

## Small follow-ups

The stopped-backend probe now accepts only `502` or `504`, with a 15-second client timeout that outlasts nginx's 5-second connect timeout. The ordinary `response()` helper and marker/patient-ID log assertions are unchanged. The review worker's local HTTP fixture passed 12 checks: accepted both gateway statuses (including a delayed 504), rejected 200/404/503, rejected an unreachable frontend, and retained the ordinary helper's strict behavior.

The parent ran `python3 infra/scripts/verify_stack.py` end to end after the correction: **PASS**, exit 0. Fresh migration/100-patient seed, assets/cache/proxy/deep links, ordinary restart, backend replacement, full recreation, strict request-log privacy and edit/deletion/seed-marker preservation all passed. Disposable project `ascertain-verify-461d6c1b41` was removed. This local ordinary-mode pass does not replace the required hosted rerun after publication.

The new summary configuration is runtime-only: `SUMMARY_PROVIDER=llm`, `LLM_BASE_URL=https://api.llm7.io/v1`, `LLM_MODEL=gemma-3-27b`, and `LLM_TIMEOUT_SECONDS=10`. The sample uses the requested keyless endpoint with fictional data. CI, the Compose checks service and the verifier explicitly select `template`. Nine worker configuration checks passed, including conflicting inherited provider settings and preservation of the dev project/volume.

The root Compose include gained a comment explaining its `.env.example` fallback: removing it can let a local `.env` fill gaps even when an isolated caller supplies `--env-file`. No Compose files were merged. Deferred low-impact changes are deduplicating verifier mechanics, pruning owned verification images after runs, narrowing the runtime script copy, adding BuildKit dependency-cache mounts, and giving old Compose versions a more specific setup error. These are not prerequisites for the current behavior-preserving correction.

## Validation and references

Final local checks passed: both Compose configurations (including ports `10050`–`10052`, migration/seed defaults, internal test network, stable volume identity and summary defaults/template overrides), CI YAML parsing, shell syntax, isolated Ruff lint/format for `infra/scripts`, documentation links and diff whitespace. The ordinary end-to-end verifier passed as recorded above. Hosted CI still needs to rerun the local changes after publication.

Reviewed primary guidance: [Docker build practices](https://docs.docker.com/build/building/best-practices/), [Compose startup order](https://docs.docker.com/compose/how-tos/startup-order/), [Compose include and path resolution](https://docs.docker.com/reference/compose-file/include/), [nginx proxy URI handling](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_pass), and [GitHub Actions secure use](https://docs.github.com/en/actions/reference/security/secure-use).

## Research checklist reconciliation

All 21 research items were checked against the current files. “Deferred” means an identified improvement or limitation remains; it is not a claim that the item passed.

| Item | Disposition and reason |
| --- | --- |
| 1 — Redirect exposes internal port | Fixed with nginx `absolute_redirect off`. The verifier now inspects `/api` without following redirects and requires status 308 plus relative `Location: /api/`. |
| 2 — Frozen export accepts stale metadata | Fixed all four Docker exports to `--locked`. This exposed stale `patient-data` metadata in the backend lock; the backend owner removed four obsolete dependency lines without upgrading versions. Application lockfiles remain owned by their respective teams. |
| 3 — PostgreSQL 18 volume change | Not a current defect: the digest-pinned image is PostgreSQL 17, whose data path matches this volume. README now states that major upgrades require a backup/restore or upgrade plan and compatible volume layout. No database/image major upgrade was attempted. |
| 4 — No compression | Deferred performance enhancement. Introduce gzip/precompression with response/header tests and measurements; existing cache behavior remains unchanged. |
| 5 — No dependency bytecode compilation | Deferred build/startup optimization. Measure startup and image-size effects before changing installation behavior. |
| 6 — Frequent health polling | Deferred: fast-start/slow-steady polling introduces a newer Engine requirement. Preserve current cross-machine behavior rather than silently raise prerequisites. |
| 7 — Duplicated Compose defaults | Partly addressed: CI now validates the development entry point too. Defaults and wrappers remain because direct fresh Compose commands and existing `.env` behavior are supported; the root sample fallback protects isolated runs. No rename or required-variable migration. |
| 8 — Repeated security header | Retained: explicit `nosniff` repetition is necessary under current inheritance and passes runtime checks. A future central security-header policy may adopt `add_header_inherit merge`; no headers were silently removed. |
| 9 — Missing CSP/frame/referrer policy | Deferred coordinated hardening. CSP must account for the inline theme script and browser behavior; it is not safe to invent a hash or claim a tested policy in this small delivery pass. |
| 10 — No download cache mounts | Deferred build-speed optimization. Runtime correctness is unaffected; add cache mounts with appropriate CI cache persistence when measuring rebuild cost. |
| 11 — Recursive ownership changes | Deferred dev/check-image optimization. Replacing it requires validating ownership of dependency, source and tool-cache paths; runtime users already run non-root. |
| 12 — Broad source copies | Deferred build-context/runtime-size cleanup. Current ignore rules exclude secrets and host-generated data; narrowing copies needs an explicit input list and checks-stage coverage. |
| 13 — Repeated uncached CI builds | Deferred CI performance work. Adding Bake/cache transport changes the build mechanism; current independent jobs remain explicit and reproducible. |
| 14 — Repeated branch conditions | Retained to follow the repository's actual default branch dynamically. Hardcoding `main` in triggers changes that behavior; only three jobs currently repeat the condition. |
| 15 — Repeated frontend tool setup | Deferred a composite action/tool-version extraction. Two visible sequences are understandable; dependency-version changes should update their pins together until that refactor is separately validated. |
| 16 — Proxy prefix and generated URLs | Known limitation: docs are supported on the direct API port; canonical frontend API paths work. `/api/docs` and backend-generated slash redirects need a backend/proxy contract change, outside this infra-only behavior-preserving pass. |
| 17 — Shell scripts lack CI checks | Partly addressed: CI runs `sh -n` separately on setup and both helper scripts. Full ShellCheck and cross-platform setup smoke tests remain deferred; syntax checking is not advertised as those tests. |
| 18 — No automated pin updates | Deferred dependency-maintenance policy. Existing digests and action SHAs remain pinned; automated update grouping and PostgreSQL-major handling need a deliberate repository policy. |
| 19 — No Dockerfile validation | Fixed: both Dockerfiles enable `# check=error=true`; explicit BuildKit checks passed with no warnings. |
| 20 — No workflow-hardening linter | Existing least-privilege permissions, SHA pins, safe checkout and absence of untrusted shell interpolation checked. Additional actionlint/zizmor tooling is deferred to avoid expanding the final CI toolchain. |
| 21 — Host port exposure | Satisfied: every application mapping binds `127.0.0.1`; test-db publishes no port and uses the internal checks network. Both configurations were inspected. |

The post-checklist verifier rerun initially stopped at the newly detected stale lock before containers started; its isolated project was cleaned up. The lock metadata was refreshed, and the complete rerun, including the clean-room live browser run, passed on the final tree. Additional checks include [nginx relative redirects](https://nginx.org/en/docs/http/ngx_http_core_module.html#absolute_redirect), [uv lock validation](https://docs.astral.sh/uv/concepts/projects/sync/), and [Docker build checks](https://docs.docker.com/build/checks/).

Production gaps remain explicit: authentication/authorization, TLS, managed secrets, controlled migrations, backup/restore drills, monitored releases, dependency scanning/update policy and reviewed external-provider data handling. The local Compose application does not claim these operational guarantees.
