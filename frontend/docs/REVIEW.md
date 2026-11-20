# Code-quality review (anti-patterns and simplicity)

Scope: `frontend/src` on 2026-11-20, reviewed against the 15-item refined checklist in
`study_mats/guide/checklists/frontend.md` (the online-research checklist kept with the local study notes), a
15-item baseline (effects, queries, stores, dead code, duplication, abstraction, memo, cleanup,
keys, URLs, types, env access, primitives) and the PM's code review. Accessibility is recorded
separately in [ACCESSIBILITY.md](ACCESSIBILITY.md). Rule: small, behavior-preserving changes
only, each verified in code first and covered by a test where behavior changed. Checklist numbers
below refer to the refined checklist.

## Fixed

| Area | Change | Where |
|---|---|---|
| Checklist 1: error before data | A failed background refetch keeps the rows and pagination and shows a polite "Couldn't refresh the patient list" notice with Retry; the full error panel is only for a failure with no data, or a 401/403 | `patient-list/PatientListScreen.tsx` |
| Checklist 2: announcement overload | The focused form summary is the single announcement (`role="group"`, no alert); inline errors are plain text bound by `aria-describedby` with a hidden "Error:" prefix (`FieldError`); failures of automatic work use an always-mounted polite `StatusNotice` with Retry beside it (list, overview, workspace, edit form, mark-as-read, note view, unread totals); "Comment posted." is announced once | `components/shared/FormField.tsx`, `StatusNotice.tsx`, `PatientForm.tsx`, `AllergiesEditor.tsx`, `NoteLinkPicker.tsx`, `DiscussionPanel.tsx`, `CommentForm.tsx` |
| Checklist 4: local "today" | One `localToday()` in `utils/dates.ts` for the schema, the date-input max, demo validation and demo ages; the birth-date input min is 1900-01-01 like the schema and backend | `utils/dates.ts`, `PersonalFields.tsx`, `api/validation.ts`, `api/mock-api.ts` |
| Mobile tooltip | Tooltips wrap at `min(20rem, 100vw - 2rem)` and keep 8px from the viewport edge, so the AI-summary hint no longer runs off a 390px screen | `components/ui/tooltip.tsx`, `e2e/visual-followup.spec.ts` |
| Bug: search spaces | A just-typed trailing space survives the debounced URL commit; the draft resync keys on the history index | `PatientListScreen.tsx`, real-router test |
| Bug: numeric deep links | A hand-typed or deep-linked `?q=12345` stays text: the router's default JSON search parser turned it into a number, which the list schema then cleared | `app/router.tsx` (`parseSearch`), `router-search.test.ts`, `e2e/deep-link-search.spec.ts` |
| Bug: malformed IDs | 404 and 422 both mean "not found" on the workspace, the note view and the edit route; no futile Retry | `PatientWorkspace.tsx`, `NoteView.tsx`, `PatientFormPage.tsx` |
| Bug: cached note / focus | A failed background refetch no longer hides a cached note; cancelling a new note returns focus to Add note | `NoteView.tsx`, `NotesPanel.tsx` |
| Checklist 7 (partly): query keys | Prefix helpers (`patientKeys.patient`, `patientKeys.allComments`, `notificationKeys`, `userKeys`) replace hand-typed keys | `app/query-keys.ts` and its callers |
| Checklist 3 (partly): runtime validation | Patient summary responses (`llm` or `template`, optional model) and the notification summary are validated; other DTOs remain typed casts by design for now | `api/dto.ts`, `api/client.ts` |
| Stable references | The list memoizes its context object and heading callback, so downstream memos hold | `PatientListScreen.tsx` |
| Dead code, duplication, abstraction | Unused Badge and Separator, an unused prop and exports, a never-read query `meta`; one `fieldMessage`, shared `formatCount`, `isAbortError`, `limits.*` and `fullName`; a pass-through route wrapper and a single-use options factory removed; pointless `useMemo` calls removed; a stable media-query subscription | as listed in the commit |
| Contract parity | Backend date rules (birth date on or after 1900-01-01; last visit not before birth) mirrored in the schema and demo validation | `patient-form/schema.ts`, `api/validation.ts` |

## Checked, no change needed

Zustand selectors are atomic; virtualizer instances read live values and each `eslint-disable`
has a reason; shadcn primitives keep Radix focus and ARIA wiring; no `any`; no leftover `console.*`.

## Deferred, with reasons

| Checklist items | Why not now |
|---|---|
| 3 Zod DTO parsing at the API boundary | Deliberate follow-up: generate or write DTO schemas once the OpenAPI contract is frozen |
| 5 axe and jsx-a11y, 11 type-aware lint | Tooling and dependency changes; the next step for CI |
| 6 broad `form.Subscribe`, 8 desktop rows not measured, 9 route loaders, 10 scroll writes to the store, 13 form validation plumbing | Refactors of working subsystems; the measurable benefit is small at 100 patients |
| 14 unlayered CSS | Cosmetic risk across about 2,700 lines of CSS; no current bug |
| 12 Playwright one-shot reads and CSS locators, 15 component-test style | Test hygiene; the suites are green and deterministic |
| 2 (rest) loading statuses mounted with their text | Loading text in the workspace, notes, summary and pickers still mounts with its region; announcing arrivals needs one always-mounted region per panel |
