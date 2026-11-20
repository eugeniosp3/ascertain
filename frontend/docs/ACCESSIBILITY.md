# Accessibility

Target: WCAG 2.2 AA in both resolved themes (default Dark; saved Light / Dark / System). This file
records where each styling-level requirement is implemented and how it was checked. It is not a
conformance claim for the whole application.

Contrast method: WCAG relative luminance (sRGB, 0.04045 breakpoint), `(L1 + .05) / (L2 + .05)`,
computed from the token values in `src/styles/globals.css`. Transparent colors are composited over
their real surface first (the visit area fill is `--ac-violet-marker` at 10% over the card).
Thresholds: 4.5:1 for text (the 11-16px UI text is normal-size text), 3:1 for necessary control,
state, focus and chart marks. Decorative hairlines (`--ac-hairline`, 1.29:1 Light / 1.51:1 Dark)
are intentionally quiet; controls use `--ac-control-border` instead.

## WCAG 2.2 AA items

| Item | Implemented in | Verified by |
|---|---|---|
| 1.4.3 Text contrast | Token pairs in `src/styles/globals.css`; `status-pill.tsx`, `count-pill.tsx`, `tooltip.tsx` | Measured. Lowest text pair: Light Active pill 4.66:1; Dark Inactive pill 6.53:1 |
| 1.4.11 Non-text contrast | `--ac-control-border`; nav marker and filter bar in `src/styles/workspace.css`; chart marks in `src/features/overview/overview.css`; note-link edge in `src/features/patient-detail/workspace.css` | Measured. Lowest: Light violet mark on track/lilac 3.06:1; Dark unavailable mark on track 3.39:1 |
| 1.4.1 Use of color | Status pills carry words; counts carry numbers; selected nav, tabs, filters and ranges add an ink bar plus weight; chart legends carry labels, counts and shares | Source inspection; e2e suites select these by visible role and name |
| 2.4.7 Focus visible | Unlayered `:focus-visible` in `globals.css`: 2px ink outline, 2px offset, 4px violet halo; inset variant for workspace tabs; `:focus-within` ring on the visit plot (`overview.css`); same ring in `patient-form.css` | Measured: outline 16.87 / 18.73 / 15.00:1 Light on canvas / card / selected, 14.82 / 13.27 / 10.23:1 Dark. Utilities cannot remove it because they are layered |
| 2.5.8 Target size (plus local 44px touch rule) | `globals.css` `(width < 48rem), (pointer: coarse)` minimums; component overrides in `overview.css`, `patient-detail/workspace.css`, `styles/workspace.css` (rail) | Source inspection: every explicit small `min-height` on a control has a coarse-pointer 44px override; fine-pointer desktop sizes unchanged |
| 1.4.4 Resize text, 1.4.10 Reflow | `index.html` viewport does not block zoom; `html, body { min-width: 320px }`; phone rules below 48rem; chart tooltip wraps below a 22rem container | `e2e/visual-followup.spec.ts` at 375x667 and 390x844 (whole cards, unclipped page-size values, tabs without a scrolling strip). Rendered 320px / 400% check outstanding (AST-008) |
| 1.4.12 Text spacing | Wrapping rows instead of fixed heights (filters, mobile sort, chart tooltip band) | Rendered check outstanding (AST-008) |
| 1.4.13 Content on hover or focus | Radix tooltips (`tooltip.tsx`) for navigation labels: hoverable and dismissed with Escape (Radix defaults), no arrow; they wrap at `min(20rem, 100vw - 2rem)` and keep 8px from the viewport edge. The AI-summary hint is a popover (`popover.tsx`) instead, because tooltips never open on touch | `ThemeControl.test.tsx` covers show and hide; `e2e/visual-followup.spec.ts` taps the AI-summary hint open and closed inside a 390px screen |
| Reduced motion (2.3.3 is AAA; kept as a baseline) | Global `prefers-reduced-motion: reduce` rule in `globals.css` (animations, transitions, smooth scroll); spinner stop in `styles/workspace.css` | Source inspection |
| Forced colors | `overview.css` keeps chart lines and marks visible with `CanvasText` | Source inspection |
| 1.3.1 / 3.3.1 / 3.3.2 Labels and errors | `FormField.tsx`: label `htmlFor`, `${id}-description`, and `FieldError` (`${id}-error`): plain text with a hidden "Error:" prefix, bound by `aria-describedby` + `aria-invalid`; the focused summary is the single announcement on submit | `PatientFormPage.test.tsx` (accessible descriptions and errors), `e2e/form-recovery.spec.ts` |
| 3.1.1 Language, 2.4.2 Page titled | `index.html`: `lang="en"`, document title | Source inspection |

## Styling review items (AST-001 to AST-010)

| ID | Status | What changed |
|---|---|---|
| AST-001 | Done | Persistent 3px ink marker on the current nav item (`styles/workspace.css`), 16.87:1 Light / 14.82:1 Dark against the rail |
| AST-002 | Done | Visit guide is an opaque 1px dashed `--ac-control-border` line: 4.54 / 4.07:1 Light on card / area fill, 4.38 / 3.67:1 Dark |
| AST-003 | Resolved | The unused Badge primitive (the only place with the failing Dark variants) was deleted; unread counts use the CountPill pair (8.64:1 Light / 8.97:1 Dark) |
| AST-004 | Documented | Reference status pairs below; product statuses stay Active / Inactive / Unknown |
| AST-005 | Done | 2px ink bar inside the selected status filter (18.73 / 13.27:1) and visit range (15.58 / 11.09:1 on lilac); no size change; focus remains the perimeter ring |
| AST-006 | Done | Directory metadata 12px desktop / 14px phones (10.5px squeeze removed); "Rows per page" 13px on phones; tooltips 12px to 13px; form descriptions and errors 16px below 48rem; workspace fact values 13px to 14px |
| AST-007 | Done | Coarse-pointer 44px minimums for visit ranges, the monthly-count toggle, note links and the rail (side padding 12px to 10px inside the same 64px rail) |
| AST-008 | Partial | Narrow chart tooltip stacks and wraps in a taller band. Rendered 320px, 200% zoom and text-spacing checks still need a Playwright pass |
| AST-009 | Done | Note-link resting edge uses `--ac-control-border`: 3.78:1 Light / 3.66:1 Dark on the lilac fill (was 1.44 / 2.51). Deleted references stay dashed on the card |
| AST-010 | Kept | Chart palette passes (Light violet 3.68:1 card, 3.06:1 track and lilac). 2px gaps, 8px bars and visible labels/values kept; a darker Light marker is optional |

## Reference status tokens (AST-004)

`reference/design-system/tokens.css` status colors are sampled observations, not safe small-text
defaults. Adopt only the corrected pairs (Light, measured at 12px text):

| Reference label | Sampled fg / fill | Ratio | Safe fg on the same fill | Ratio |
|---|---|---:|---|---:|
| Approved | `#1f9e7a` / `#d8f4ec` | 2.90 | `#17785c` | 4.66 |
| Needs review | `#8a6d12` / `#f4e4ac` | 3.87 | `#785e0f` | 4.86 |
| Pending | `#2f7fb5` / `#d8ecfc` | 3.59 | `#24638e` | 5.33 |
| Request for info | `#6b4fd0` / `#e8d8fc` | 4.29 | `#6042bf` | 5.17 |
| Draft | `#666666` / `#dcdcdc` | 4.19 | `#5f5f5f` | 4.66 |
| Submitting | `#8a6d12` / `#f8e8c4` | 4.05 | `#785e0f` | 5.09 |
| Denied | `#b3203a` / `#f4d0d4` | 4.65 | unchanged | 4.65 |
| AI | `#703fe4` / `#ece8f8` | 4.96 | unchanged | 4.96 |

The reference has no Dark status palette. Safe pairs the product uses in both themes:

| Pair | Light | Dark |
|---|---|---|
| Active pill | `#17785c` / `#d8f4ec` 4.66 | `#94d9bc` / `#203d34` 7.26 |
| Inactive pill | `#5f5f5f` / `#ebeae6` 5.30 | `#c7c1ba` / `#3b3834` 6.53 |
| Unknown pill (secondary on card) | `#5e5a56` / `#ffffff` 6.83 | `#c0bab3` / `#282624` 7.84 |
| Unread count | `#ffffff` / `#4f3a9e` 8.64 | `#302438` / `#d4c1ff` 8.97 |
| New pill | `#4f3a9e` / `#d4c1ff` 5.29 | `#302438` / `#d4c1ff` 8.97 |
| Error text on error wash | `#b3203a` / `#fbeef0` 5.84 | `#ff9ca9` / `#45292f` 6.57 |

A Dark counterpart for a reference status must be measured (>= 4.5:1 at its real size) before it is
adopted. Keep the visible word with every tint.

## Component-level items

| Item | Implemented in | Verified by |
|---|---|---|
| 2.4.1 Bypass, 2.4.2 Page titled, landmarks | `AppShell.tsx`: skip link to `#main-content`, header / nav / main, a document title per route; unknown routes say "Page not found" with no `aria-current` link | `AppShell.test.tsx` |
| 1.3.1 Table and list semantics | `PatientResults.tsx`: captioned table, sort buttons in column headers, `aria-rowindex` on the header row; phone cards are a list with `aria-setsize` / `aria-posinset` for virtualized items | `PatientResults.test.tsx`, `e2e/directory.spec.ts` |
| 4.1.3 Status messages | One status region per async state (list count; skeletons are `aria-hidden`); polite regions announce "Note saved / deleted" (`NotesPanel.tsx`) and "Comment posted / saved / deleted" once (`DiscussionPanel.tsx`); failures of automatic work (list, overview, workspace and edit-form refresh, mark-as-read, note refetch, unread totals) use the always-mounted polite `StatusNotice` with Retry beside it, never an alert | `notes.test.tsx`, `discussion.test.tsx`, `PatientListScreen.test.tsx`, `OverviewCharts.test.tsx`, `workspace.test.tsx` |
| 2.4.3 Focus order and return | Closing the workspace refocuses the originating row action; removing the last allergy or condition focuses its Add button; closing a comment editor refocuses Edit; leaving a note focuses the "Clinical notes" heading; cancelling a new note refocuses Add note | `PatientFormPage.test.tsx`, `discussion.test.tsx`, `notes.test.tsx`, `e2e/history-focus.spec.ts` |
| 2.1.1 Keyboard | Row links and arrow-key row movement; the AI-summary sparkles is a real button ("About AI summaries", `aria-expanded`) that toggles its popover on click, tap or Enter and closes on Escape or an outside click; an invalid note or comment submit moves focus to the first invalid field so its error is read; the visit chart's month input and data-table toggle | `profile.test.tsx`, `e2e/visual-followup.spec.ts` |
| 1.1.1 Chart alternatives | Overview figures have names, visible values and legends with counts and shares; the visit chart has a data-table toggle | `OverviewCharts.test.tsx`, `e2e/visual-followup.spec.ts` |
| 3.3.1 / 3.3.3 Error recovery | Invalid submit focuses the error summary; inputs use `aria-invalid` + `aria-describedby`; malformed or missing IDs (404 / 422) show not-found with a way back and no futile retry; route errors link to all patients | `PatientFormPage.test.tsx`, `workspace.test.tsx`, `e2e/form-recovery.spec.ts` |

Known gaps: loading text in the workspace, notes, summary and pickers still mounts together with its
status region; there is no automated axe scan yet; the rendered 320px, 400% zoom and text-spacing
checks (AST-008) are outstanding; a pending delete disables the focused confirm button.
