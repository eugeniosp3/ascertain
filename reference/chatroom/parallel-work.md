# Parallel completion lanes

The latest user instruction is to finish the selected application features with **Claude Opus 5.5, effort Max, UltraCode**, then run one coordinated code-review and QA cycle. Existing useful work is retained when ownership transfers. A replacement starts only after the prior writer is stopped; completed reviews remain immutable.

## Current implementation ownership

| Lane | Owner and exclusive scope | Finish line |
| --- | --- | --- |
| Compact visual fixes | Frontend Opus Max continuation; saved visual edits retained | Finish F2/F3/F4/C1/A1–A3 and accepted styling items; `PatientResults` has now been explicitly released to restoration. |
| Assigned overview | Frontend Opus Max active: `cbc66d4c`; API/fixtures/projection/query keys | Complete assigned-cohort charts and recent patients, accurate user/count labels, A/B switching and global-directory tests. Presentation stays with the visual owner. |
| Measured restoration | Frontend Opus Max active: `3f28255c`; existing 41-test helper and prepared patch retained | Presentation-file ownership released; integrate and pass unchanged v2 anchor/visible-row checks and repeated history. Retain the original 82-pass/58-fail evidence. |
| Assignment API | Backend Opus Max continuation, private candidate only | Implement the agreed list/dashboard filter, read-only assignment metadata and creator assignment. |
| Assignment seed | Backend Opus Max continuation, private candidate only | Complete deterministic one-time roster assignment and rerun preservation. Backend parent owns model/migration/docs and isolated integration. |
| Cohort data oracle | Data owner; one disjoint Opus Max worker requested under `data/docs/workload/` | Independently calculate expected cohort membership and source-based chart values without changing data or duplicating the backend seed implementation. |
| Setup and integrated runner | Infra owner plus active Opus Max runner/evidence child | Freeze the new source, run the isolated compiled API stack, capture identities and browser reports, verify privacy/cache/persistence, then coordinate the default-mode cutover and publication. |
| Default User A | PM implementation complete; five files released back to frontend | Five actor units, 11 intercepted API browser checks, typecheck and scoped lint/format pass. Preserve saved valid choices; verify again in the final integrated candidate. |
| Final code review and QA | QA coordinator with one fresh serial Opus Max lead | Review the integrated candidate for correctness, visual quality, unnecessary abstractions, duplicate state, cache/race bugs and brittle tests. Close exact requirements from the new evidence. |

Backend assignment work is staged at `/tmp/ascertain-assignment-candidate-20261120T193503831862Z`; the shared watched backend source was restored to the prior verified snapshot and its API health/patient reads pass. Shared migration and lifecycle stay with infra. PM's user-facing http://127.0.0.1:8081 preview remains available against that shared API.

## Completed verification and review history

- Forms, navigation and theme/chart workers delivered their frozen-DEMO evidence under `qa/frontend/parallel/`; their private previews are stopped. Exact full/partial/failure decisions are in Opus pass 01.
- The visual and platform specialist reports are complete under `qa/lead/opus-visual-review/` and `qa/lead/opus-platform-review/`. Findings are routed in [review actions](review-actions.md).
- Styling-only accessibility documentation is complete under `qa/accessibility/`. The author does not implement production changes; accepted AST items belong to the frontend Opus owner.
- Backend fault workers completed their pre-OPR evidence. Pass 03 retains its source and timing limits; sustained-load LONG-002 remains NOT_RUN and is not a new release gate.
- Opus lead passes 01–03 are complete. QA is finishing already-authorized evidence exports; no new Codex/Sol production or review lanes are requested.
- Earlier live candidate-03 passed 16/16. That result does not accept later visual/restoration/assignment changes or bind the backend source retrospectively.

## Final handoff

Owners provide the exact changed-file list, source/build identity, commands/results, unresolved findings and cleanup. Infra combines stable frontend/backend inputs into one isolated candidate. QA reviews that candidate and any necessary focused repairs, preserving earlier failures and scope limits. The [integration plan](integration-coordination.md) and [Holepunch](../PROGRESS.md) track final acceptance; no extra broad review cycle is needed for documentation alone.

Frontend confirmed all three new lanes use Claude Opus 5.5 Max + UltraCode: assignment `cbc66d4c`, restoration `3f28255c`, visual continuation `ea1e9c52`. Prior active writers were cancelled before replacement and their edits retained. The former visual file hold is resolved. Backend confirmed its two Sol writers cancelled and two private-candidate Opus Max continuations active; infra confirmed one Opus Max runner child.
