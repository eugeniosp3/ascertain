# Assigned patient workload

Each patient has one nullable `assigned_user_id` pointing to an application user. This is workload membership, separate from note/comment authorship. All users can still browse and edit the shared patient directory; the demo selector is not authentication or RBAC.

## Wire contract

| Request | Result |
| --- | --- |
| `GET /patients` | All patients, including unassigned patients |
| `GET /patients?assigned_to=me` | Selected actor's cohort, filtered before totals, sorting, and pagination |
| `GET /dashboard/overview` or `?scope=global` | Global totals/previews; `scope: "global"`, `assigned_user: null` |
| `GET /dashboard/overview?scope=assigned` | Selected actor's totals/previews; `scope: "assigned"`, `assigned_user: {id, display_name, display_role}` |
| `POST /patients` | Selected actor becomes assignee; absent actor means unassigned |
| `PUT /patients/{id}` | Replaces the same 17 editable fields and preserves assignment |

Assigned queries require a valid active `X-Demo-User-ID`; missing/invalid/inactive identity returns 401. Unsupported query values return 422; disabled demo mode keeps its existing 503 behavior. List/detail and dashboard preview rows expose read-only `assigned_user_id: UUID | null`. Write bodies cannot set this field. There is no new reassignment endpoint in this scope.

All dashboard totals refer to the requested patient cohort. `clinical_notes` counts active notes on those patients, regardless of author. Unread notification totals remain global for the viewer; assignments do not alter comment cursors, read watermarks, or `is_unread`.

## Deterministic synthetic seed

This assignment is an application demonstration fixture, not a source clinical fact. The fixed roster order is:

1. Demo Clinician: `dbb2a520-ebc6-5d4e-a8f5-3f078475bdf9`.
2. Demo Coordinator: `16473cca-a94f-5f5c-b71e-c09f6a466e49`.

Hash the exact validated `source_patient_id` UTF-8 bytes with SHA-256. Interpret the first eight digest bytes as an unsigned big-endian integer, then take modulo two for the zero-based roster index. Equivalently, use `digest[7] & 1`. Do not trim, case-fold, renumber, hash a pipeline UUID, or use Python's process-dependent `hash()`.

For the pristine validated 100-patient source, this yields 52 Clinician and 48 Coordinator patients. Membership is durable; counts can change through application use. Source clinical facts, status, visits, identifiers, and lineage remain intact. Initial `active` status is the existing synthetic application default. `last_visit` starts from `pcp_last_visit_date`. Age uses today's UTC date and completed years; a leap-day birthday advances on March 1 in a non-leap year.

`demo-assignments-v1` is a separate completion marker. Fresh seeding and an upgrade of a previously completed import both apply assignments in the seed transaction under the existing advisory lock. The first backfill touches only surviving imported patients with null assignments and preserves existing non-null assignments. It never assigns API-created patients or recreates deleted patients. After completion, reruns preserve reassignments, explicit unassignments, and deletions. `--check-only` performs no writes.

## Migration and release order

Revision `20261120_0002` adds a nullable foreign key (`ON DELETE SET NULL`) and an `(assigned_user_id, id)` index. Migration alone leaves existing patients unassigned. No table or clinical field is added beyond this assignment column, and the original 0001 migration remains unchanged.

On the coordinated target: apply `alembic upgrade head`, run `python -m app.seed`, then start the matching API build. Development bind mounts use automatic reload; copy the candidate into watched source only as part of infra's coordinated cutover.

Frontend charts and recent patients use one complete paged assigned projection, cached by actor and scope. Labels state `Assigned to <display_name>` and `<N> assigned patients`. The directory remains global. Equal metric values across different workloads can occur naturally; no chart values are fabricated to distinguish them.
