# Code-quality review (anti-patterns and simplicity)

Scope: `frontend/src` on 2026-11-20, reviewed against the 24-item online checklist in
`study_mats/guide/checklists/frontend.md` (the online-research checklist kept with the local study notes), a
15-item baseline (effects, queries, stores, dead code, duplication, abstraction, memo, cleanup,
keys, URLs, types, env access, primitives) and the PM's code review. Accessibility is recorded
separately in [ACCESSIBILITY.md](ACCESSIBILITY.md). Rule for this pass: small, behavior-preserving
changes only, each verified in code first and covered by a test where behavior changed.

## Fixed in this pass

| Area | Change | Where |
|---|---|---|
| Bug: search spaces | A just-typed trailing space survives the debounced URL commit; the draft resync keys on the history index | `patient-list/PatientListScreen.tsx`, real-router test in `PatientListScreen.test.tsx` |
| Bug: malformed IDs | 404 and 422 both mean "not found" on the workspace, the note view and the edit route; no futile Retry | `PatientWorkspace.tsx`, `NoteView.tsx`, `PatientFormPage.tsx` |
| Bug: cached note | A failed background refetch no longer hides a cached note | `patient-detail/NoteView.tsx` |
| Focus | Cancelling a new note returns focus to Add note (`flushSync`) | `patient-detail/NotesPanel.tsx` |
| Checklist 2: query keys | Prefix helpers (`patientKeys.patient`, `patientKeys.allComments`, `notificationKeys`, `userKeys`) replace hand-typed keys | `app/query-keys.ts` and its callers |
| Checklist 3: runtime validation | Patient summary responses are validated (`llm` or `template`, optional model) like the notification summary | `api/dto.ts`, `api/client.ts` |
| Checklist 11: stable references | The list memoizes its context object and heading callback, so downstream memos hold | `PatientListScreen.tsx` |
| Dead code | Unused Badge and Separator primitives, an unused avatar prop, unused exports made private, a never-read query `meta` and its always-true condition | `components/ui`, `patient-list`, `api`, `app`, query files |
| Duplication | One `fieldMessage` in `utils/form-errors.ts`; shared `formatCount`; one `isAbortError`; shared `limits.*` in `api/validation.ts`; one `fullName` in the mock adapter | as listed |
| Needless abstraction | Removed a pass-through workspace route wrapper and a single-use query-options factory | `routes/patient-workspace.tsx`, `overview/queries.ts` |
| Pointless memo / effects | Three `useMemo` calls over at most 12 items removed; the media-query hook no longer re-subscribes every render | `overview/LatestVisitsChart.tsx`, `hooks/use-media-query.ts` |
| Contract parity | Backend date rules (birth date on or after 1900-01-01; last visit not before birth) mirrored in the form schema and demo validation | `patient-form/schema.ts`, `api/validation.ts` |

## Checked, no change needed

Checklist 14 (Zustand selectors are atomic), 19 (virtualizer instances read live values; each
`eslint-disable` has a reason), shadcn primitives keep Radix focus and ARIA wiring, no `any`, no
leftover `console.*`.

## Deferred, with reasons

| Checklist items | Why not in this pass |
|---|---|
| 1 error-before-data list branch, 5 effects deriving actor/search state, 18 setState during render | Behavior changes in working, heavily tested flows; each needs its own focused change and browser pass |
| 4 type-aware lint, 8 axe / jsx-a11y | Tooling and dependency changes; the next step for CI |
| 7 desktop rows not measured, 10 broad `form.Subscribe`, 12 route loaders, 13 context value, 16 `strict: false` hooks, 17 form validation plumbing | Refactors of working subsystems; measurable benefit is small at 100 patients |
| 15 unlayered CSS, 20 interpolated class strings | Cosmetic risk across about 2,700 lines of CSS; no current bug |
| 21 store reset between tests, 22–24 test-style items | Test hygiene; current suites are green and deterministic |
