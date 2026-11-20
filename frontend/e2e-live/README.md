# Live browser integration journeys

These eight journeys run against an existing **compiled API-mode frontend** and
its real FastAPI/PostgreSQL service through the frontend's same-origin `/api`.
They are separate from `e2e/` (demo) and `e2e-api/` (intercepted HTTP contracts).

From `frontend/`, after the stack owner supplies its ready frontend URL:

```sh
PLAYWRIGHT_LIVE_BASE_URL='https://your-running-frontend.example' npm run e2e:live -- --workers=1
```

The `e2e:live` package script points to
`playwright test --config playwright.live.config.ts`. To invoke the same config
directly, without relying on that script:

```sh
PLAYWRIGHT_LIVE_BASE_URL='https://your-running-frontend.example' ./node_modules/.bin/playwright test --config playwright.live.config.ts --workers=1
```

Use `--project=desktop-chrome` or `--project=mobile-chrome` to select one project.
Both use installed Chrome: desktop 1440×960; mobile 390×844 with touch. Each test
gets a fresh browser context, with America/New_York used for editable clinical
timestamps. Workers default to one and retries to zero. No credentials or reset
environment variables are needed.

Unset, malformed, non-HTTP(S), credential-bearing, query-bearing and fragment-bearing
base URLs fail during config loading. The suite neither guesses a localhost port
nor starts, stops or resets a server. A frontend showing `Demo workspace` fails
the explicit API-mode gate before any patient creation. Browser domain requests
must actually reach `/api`; there is no fixture fallback, request interception,
mock server, service worker or private application-state access.

## Coverage

| Journey | Real-stack assertions |
| --- | --- |
| Directory | API-derived baseline source identifier without opening seed records; unique search; status; sort; page size; Next; empty results; virtual-list scroll and focus return. |
| Row/card actions | Plain age, status and blank areas open Overview; Notes/Discussion child links and keyboard Enter preserve a single history entry; desktop Escape/mobile Back restore focus. |
| Profile | Invalid UI draft does not POST; all 17 writable fields create and persist through reload; full PUT retains middle/visit/source context and clears nullable values; a fresh browser context reload verifies the saved edit; delete Cancel then Confirm; API 404. |
| Clinical | UI-entered timestamp/content/author persisted by API; note URL reload; template summary; browser-created note link; note delete/410; linked tombstone and count/summary refresh. |
| Two viewers | UI comment author; own comments are not unread; API-derived global badge and `unread_only` queue; Overview/Notes do not acknowledge; exact server-issued `{through}`; actor isolation; reload; own edit/delete; disappearing-queue focus. |
| Cursor snapshot | Thirteen API fixture comments; only first ten displayed/acknowledged; opaque cursor continuation after earlier deletion; unshown suffix remains unread; Refresh of an earlier acknowledged prefix does not advance the receipt; new arrival stays unread until subsequent display. |
| Real failures | Actual 422 phone/state validation; foreign-parent note GET 404 and comment link 422; other-author comment PUT/DELETE and note DELETE 403; persisted content/counts unchanged; browser note-404 route. |
| Deep routes | Direct and refreshed Overview/Notes/Summary/Discussion/note URLs through compiled SPA/proxy; real patient/note GETs; missing-patient route; desktop/mobile document overflow, horizontal/vertical modal bounds and on-screen close controls/tab containers. |

`api.ts` owns wire types, same-origin API calls, generated patient names, mutation
ownership guards and cleanup. `ui.ts` owns accessible UI actions and passive
browser request/response observation. `fixtures.ts` owns actor discovery, the
API-mode preflight and failure-safe per-test teardown. Specs use these small
helpers directly; no application code or demo helper is imported.

## Isolation and artifacts

Actors are discovered from `GET /api/users`, sorted by UUID and selected through
the UI by their returned display names. No mock UUID/name, fixed seed total or
preexisting unread total is assumed. Existing patients are only read for baseline
list/source assertions; their notes/discussion are never opened or acknowledged.

Each project/test creates uniquely named `Integration` patients. Successful API
and UI creates register returned UUIDs immediately. Mutating API helpers reject
IDs outside that test's tracked set. A `finally` teardown deletes only those IDs,
accepts 404 for a patient already deleted through the UI, and GET-verifies every
ID is absent. An `afterAll` fallback retries only outstanding tracked IDs. Owned
notes, comments, links and read state cascade with their patient. Actor records,
seed profiles, existing study comments and global read watermarks are untouched.
An externally killed process or unreachable service can interrupt cleanup; any
normal cleanup failure reports only the affected created UUIDs.

Traces for every case, failure screenshots and durable per-test `live-cleanup.json`
UUID/count receipts go under `e2e-live/results/` (the parent owns its ignore entries).
The live config also writes `e2e-live/results/report.json`; set the optional
`PLAYWRIGHT_JSON_OUTPUT_FILE` to preserve a report beside an isolated run directory.
The strict scroll matrix has been deferred; it is not part of the normal completion checks.
The deep-route cases also save `workspace-geometry.json` with viewport, modal and
close-control coordinates. Directory cases save `scroll-restoration.json` with raw
scroll offsets/heights and visible row/link rectangles. Restoration keeps the
visible anchor and distance from the end within two pixels; virtual spacer
remeasurement may change raw `scrollTop` without moving the visible content.
Archive this directory before each rerun, because
Playwright replaces the current results. The fixture also
attaches the failing screen before closing its active page for cleanup. Error
messages report statuses/error codes; helpers do not print complete patient
payloads, response bodies or secrets. No arbitrary sleeps are used.

## Validation and boundaries

Without a supplied ready live URL, run static checks only:

```sh
./node_modules/.bin/eslint playwright.live.config.ts e2e-live/*.ts --max-warnings 0
./node_modules/.bin/prettier --check playwright.live.config.ts e2e-live/*.ts e2e-live/README.md
./node_modules/.bin/tsc --ignoreConfig --noEmit --strict --noUncheckedIndexedAccess --noUnusedLocals --noUnusedParameters --target ES2023 --lib ES2023,DOM --module ESNext --moduleResolution bundler --types node --skipLibCheck playwright.live.config.ts e2e-live/*.ts
PLAYWRIGHT_LIVE_BASE_URL=https://live-suite.invalid ./node_modules/.bin/playwright test --config playwright.live.config.ts --list
```

The `.invalid` URL above is **collection only**; it is never a suggested test
target. Live execution requires a real ready URL. Directory filter/sort/page response
waits match their intended query parameters; returning to a fresh cached all-status
query asserts its restored UI result without requiring a redundant HTTP request.
The API-mode check reads the modal's description while the background shell is inert.

These tests establish UI/API persistence across browser reload, not across a
container restart. Infrastructure owns restart/seed-preservation verification.
Outages are not simulated by stopping shared services or replacing requests;
network/503 handling remains in the separate HTTP-contract suite. This suite
does not force equal database timestamps or edit PostgreSQL directly: exact
microsecond boundaries/equal-time groups remain backend regression coverage
(coordination handoff reports 27 focused / 196 full backend tests). Source
provenance retention is checked on created records, whose imported context is
null; editing imported seed profiles is intentionally outside this suite.
