# 04 · Product UI and motion (from the hero video)

Source: the 38-second hero video `Ascertain Hero.mp4` (1148×720, 30 fps, 1,140 frames). The clip has 1,140 frames; looking at each one is not practical, so it was checked by sampling: scene-change detection (it found **no hard cuts**, so the clip is one continuous camera move through seven screens), 76 frames at 0.5 s spacing on contact sheets, and 10 full-size key frames. At 0.5 s spacing, anything shorter than that (such as a quick hover) can be missed. Colors below were **sampled from pixels** of a compressed video, so treat hex values as close (±4 per channel), not exact. The marketing-site tokens in `01_foundations.md` come from the real CSS and win wherever both exist.

## 1. The staging (how the product is presented)

| Layer | What it is | Value |
|---|---|---|
| Backdrop | Mauve gradient, light at top and right, dark plum pooling at the lower left | `#b2a8ba` top, `#a499a4` top-right, `#787185` bottom-right, `#352d3b` bottom-left |
| Bezel | A translucent lilac frame (about 14 px) around the app window, like frosted glass | `#c6bdcf` / `#bcb2bc`, outer radius about 28 px |
| Window | The app, flat, no drop shadow on the window itself | paper `#f4f3ef`, inner radius about 10 px |
| Camera | Slow push-in (about 1.5× zoom) on the area that matters, easing back out between screens | see section 5 |

Why it matters: the product is always shown inside this lilac frame on a mauve wash. It ties the product to the brand violet `#d4c1ff` without using it as a fill inside the app.

## 2. Screen-by-screen breakdown (timeline)

| Time | Screen | What happens |
|---|---|---|
| 0.0–1.5 s | **All Cases table** | The window is already open. Rows fade in one after another (about 0.15 s apart), top to bottom. |
| 1.5–4.5 s | Table, zoomed | Camera pushes in and pans right. The "Christopher Lewis" row shows `checking...` in Coverage and `Draft` in Status. The floating **AI analyzing** pill appears at about 2.5 s. |
| 4.5–6.0 s | Case detail, Overview | Cross-fade to the patient case. Header, tabs and the empty "Tasks" state load in. The Benefit card (right) shows Coverage `Active`, Prior Auth `No auth required`, Last checked. |
| 6.0–8.5 s | **Benefit check** side panel | A panel slides in from the right, with a darkened page behind it: Plan status, Financials (deductible, out-of-pocket max), and a grey footnote "Last check: … By: System (auto)". The fields appear one at a time. |
| 8.5–11.5 s | **Details** tab, step 1–2 | Progress bar at about 30%. "Prior Authorization Details": primary insurance fields, then Diagnosis rows (Diagnosis, ICD Code, Primary checkbox, trash), then Service Information, then Requesting Provider. The form auto-scrolls. |
| 12.0–17.5 s | **Documents** tab, Attachment | A file chip `1560-74620-ProgressNote.pdf` is already attached. A second file is dragged in (a ghost chip follows a cursor), drops, and snaps into a row. The AI pill pulses at the top right. |
| 17.5–20.0 s | **Recipient** step | Progress bar reaches about 85%. Fax is the default destination. An "Other Recipients" search opens a list: NextGen, UHC, Availity, each tagged "Portal" with a domain, plus "+ Add new recipient". UHC is chosen. |
| 20.0–21.0 s | Ready to submit | The progress bar turns teal and the `Submit` button turns from grey to black. Status chip changes to `Submitting...` (amber). |
| 21.5–24.0 s | **Progress stepper** | A four-step stepper replaces the form: New Case → Submit in portal → In review → Decision. Steps tick green in sequence (about 0.8 s apart). |
| 24.5–26.0 s | Zoom, cross-fade | Camera pushes in on the header and sidebar. The nav highlight moves from "Cases" to "Statuses" while the page dissolves. |
| 26.0–28.5 s | **Cases statuses** | Five count tiles (Needs Review, Request for info, Denials, Pending, Approvals), then rows grouped by status. The "Need Review" group is tinted amber. |
| 28.5–30.0 s | Case drawer opens | A right drawer slides in with the patient name, DOB, case facts, and a Portal / Manual tab pair. |
| 30.0–33.0 s | Portal status check | `UHC` row with an "Open portal" link. The AI pill floats over the drawer. Buttons: ghost `Back to details`, black `Run check now`. |
| 33.0–35.0 s | **Running** | The UHC row shows a blue `Running...` chip. An AI "orb" (white disc, rainbow-pastel spinning ring, violet sparkle) sits mid-panel. |
| 35.0–38.0 s | **Approved** | The chip turns mint `Approved`. The orb turns into a teal circle-check with a soft halo. The primary button becomes a full-width black `Back to details`. Hold to the end. |

## 3. Visual system seen in the product

### 3.1 Layout skeleton (all measurements at 1148 px frame width)
- **Top bar:** logo at the left (`>—` chevron mark plus "Ascertain" wordmark), then breadcrumb `All Cases / Christopher Lewis`. The current crumb is darker and slightly heavier. A bell with a **red dot** sits at the far right. Height about 64 px, a 1 px hairline under it.
- **Sidebar:** about 173 px wide. Seven items: Statuses, Inbox, Cases, Recipients, Providers, Locations, Rules. Each is a 16 px line icon plus a 13 px label. The active item is a rounded (8 px) grey pill `#e7e6e2`. Items are spaced about 34 px apart. A vertical hairline divides sidebar and content.
- **Case header:** patient name at about 18 px, with "Patient name" as a 10 px grey caption underneath. To the right, a grid of small label/value pairs (label 10 px grey, value 12 px ink): Prior Auth for, Status, DOB, MRN, Service Date, Location, Insurance. A second column holds "Assigned to / Team 2" with a kebab menu.
- **Tabs:** Overview / Details / Documents. Active tab is ink text with a 2 px ink underline; inactive is grey.
- **Wizard bar:** `Back` (ghost) · progress bar · `Next`/`Submit` (black). The progress track is `#e0dfdb`; the fill is ink black, then **teal** when the form is complete.
- **Cards:** content sits in a bordered card on the paper background. Card title (18 px) on the left, a small grey `Download all` button on the right, a hairline under the header.

### 3.2 Color in the product (sampled)

| Role | Value | Where |
|---|---|---|
| Paper | `#f4f3ef` (CSS token: `#f6f4f1`) | window and sidebar |
| Selected / hover fill | `#e7e6e2`, `#e8e7e4` | active nav, benefit card, file chips |
| Table row | `#efefef` with `#e2e2e2` row lines | All Cases table |
| Ink / primary button | `#141414` | `Next`, `Submit`, `Add task`, `Run check now` |
| Empty-state folder | `#d1d0cc` | Tasks empty state |
| AI accent text | `#703fe4` | "AI analyzing", sparkle icon |
| AI pill fill | `#ece8f8` → `#f0e4f8` (lilac wash) | the floating pill |
| Progress complete | teal `#2aa88a` area | bar, stepper ticks |

### 3.3 Status language (the key new addition)
Status is the product's most important data. Every status uses a **soft tinted pill** (light fill, darker same-hue text, fully rounded, 11 px). The same hue family repeats on stat tiles, group headers and count badges.

| Status | Pill fill | Pill text | Icon tile | Group header |
|---|---|---|---|---|
| Approved | `#d8f4ec` mint | teal `#1f9e7a` | check-circle, mint | mint |
| Needs Review | `#f4e4ac` straw | olive `#8a6d12` | flag, amber `#f4e4ac` | amber-tinted row, count badge `#736130` with white number |
| Denied | `#f4d0d4` rose | crimson `#b3203a` | ban, rose | count badge `#8c111f` |
| Pending / In review | `#d8ecfc` sky | blue `#2f7fb5` | refresh, sky | count badge sky `#2f9bd8` |
| Request for info | `#e8d8fc` lilac | violet `#6b4fd0` | info, lilac | lilac |
| No Auth | `#e8d8fc` lilac | violet | n/a | n/a |
| Draft | `#dcdcdc` grey | grey `#666` | n/a | n/a |
| Submitting / Running | `#f8e8c4` / `#d8ecfc` | amber / blue, with a leading dot | n/a | n/a |

Rule: **never convey status by color alone.** The video always pairs color with a word, and on tiles with an icon.

**Coverage chip** is separate: white pill, 6 px green dot, text `Active` (or grey `checking...` before the answer arrives).

### 3.4 Typography in the product
A neutral grotesque (Neue Haas / Helvetica-like), the same family as the site body. No serif appears inside the app; the serif is reserved for marketing headlines. Observed scale: page title 18 px, card title 18 px, section title 16 px, body/table 12–13 px, labels and DOB captions 10 px (grey). Weight is Regular for body, Medium for names and column headers. Column headers are the same size as body but heavier. Dates are `MM/DD/YYYY`; there are no ellipses in cells, long values wrap to two lines (insurance names, case types).

### 3.5 Components seen
1. **Data table:** avatar (circle, 24 px, photo) + name + `DOB:` caption; columns Patient, Authorization Types, Service Date, Location, Insurance, Assigned to, Coverage, Status. Row height about 65 px, with a rounded outer border and a sticky header.
2. **Filter tabs above the table:** All Cases (bold + underline) / Needs Review / Draft / Submitted / Approved / Denied / No Auth. Right side: three grey dropdown buttons (Case Type, Insurance, Service date), a search field, `Track Schedule`, and a black `+ New cases`.
3. **Pills / chips** (section 3.3) and **source tags** such as `Payer portal` (white pill with a globe icon) and `Fax to payer` (printer icon in violet).
4. **Form fields:** a label above (13 px, asterisk on required), a white input with a 1 px grey border and a 4 px radius, 28 px high; a calendar icon inside date fields; a checkbox for Primary; a ghost trash button.
5. **Buttons:** black solid (primary), grey-filled ghost (secondary, e.g. `Download all`, `Add attachments`, `Show more`), outline-less text button (`Back`). All small (28 px high), 4–6 px radius, 12 px text.
6. **Side panel / drawer:** about 322 px wide, 10 px radius, 14 px from the window edge, paper fill, a scrim (about 35% black) behind it. Header: name (16 px), DOB caption, close X. Footer holds the two actions.
7. **Combobox:** text field with a chevron; the open menu is a white card with a 1 px border; each option has a name, a small grey kind label ("Portal") and a grey domain line underneath; the focused option has a grey fill; the last row is a centered `+ Add new recipient`.
8. **Stepper:** four bordered cells with a label, a trailing icon, and a round chevron connector between cells. Done = filled teal circle with a white check.
9. **Group header rows:** collapsible (chevron), a tinted full-width bar with label and a count badge.
10. **Stat tiles:** a 5-across strip. Each tile has a 28 px rounded-square icon chip, the large number, and a label. Tiles are separated by hairlines, not shadows.
11. **Empty state:** a grey open-folder illustration, a bold sentence ("Create tasks to track case progress"), one grey helper line, and a black button.
12. **AI affordances:** (a) the **AI analyzing pill** and (b) the **AI orb**. See below.

### 3.6 The AI language
AI is shown as a *transient, separate layer*, not as part of the data.
- **AI analyzing pill:** fully rounded, lilac wash fill, violet text 14 px Medium, a two-star sparkle icon on the left, a soft violet-tinted glow shadow (visible halo, exact blur not measurable from video). It floats and is **never docked**; it moves to wherever the system is working (below the Benefit card, at the top right of the case header, at the bottom of the sidebar, over the drawer). It fades in for about 0.4 s, holds 1.5–3 s, fades out.
- **AI orb:** a 60 px white disc with a violet sparkle and a 4 px ring whose gradient is pastel rainbow (pink, peach, blue, lilac), rotating. It replaces the content area during a long action, then morphs to a teal check.
- **Rule:** AI never changes the result silently. The result appears in a normal pill (`Running...` → `Approved`) and the human still presses the black button.

## 4. Style rules this adds to the system
1. Black solid buttons are for the one next action; everything else is grey-filled or text-only.
2. Warm paper surfaces only (no pure white backgrounds) except form fields, chips and menus, which are white to stand out.
3. Structure comes from hairlines and tints, not shadows. Shadow is reserved for floating things (the AI pill, drawers, menus).
4. Status = tinted pill + word. One hue family per status, reused on tiles, rows and badges.
5. Very small type (10–13 px) is normal in the product, but labels are always grey and values always ink, so the pair is readable at a glance.
6. Progress is told twice: a bar (how far) and a named stepper (where).
7. The AI layer is violet, floating and temporary.

## 5. Motion choreography

| Move | Duration | Easing (observed) | Notes |
|---|---|---|---|
| Row fade-in | about 0.35 s each, 0.15 s stagger | ease-out | rows fade in (a slight upward drift is possible but not measurable at this resolution) |
| Camera push-in | about 1.2 s | ease-in-out | 1.0× → 1.5×, pans to the area of interest |
| Screen change | about 0.5 s cross-fade | linear | the nav highlight moves during the fade |
| Drawer / side panel | about 0.4 s | ease-out | slides from the right while the scrim fades to about 35% |
| Field reveal | about 0.2 s each | ease-out | text fades in line by line |
| Progress bar | smooth, tied to steps | linear | color changes black → teal at 100% |
| AI pill | in 0.4 s, hold, out 0.4 s | ease | glow brightens as it appears |
| Orb spin | about 1.2 s per turn | linear | continuous |
| Check morph | about 0.5 s | ease-out with a small overshoot | halo expands and fades |
| Stepper ticks | about 0.8 s apart | ease | circle fills, then the check draws |

Everything is slow and calm. There is no bounce, shake or flashing. Durations and easing are estimates read from frame spacing at 30 fps (1 frame ≈ 33 ms); they describe the feel, not the exact CSS curves.

## 6. What this adds to the marketing-site system

| Gap in the site CSS | What the video supplies |
|---|---|
| No semantic status colors (only brand blue, violet, mint, a stray red) | The full tinted-pill status palette (section 3.3) |
| No data-dense components (the site has cards and marquees) | Table, drawer, stepper, combobox, wizard bar, stat tiles |
| No small type scale below 14 px | The 10–13 px product scale |
| No AI affordance | The pill and the orb |
| Mint `#d4f3f0` appears only in one hero gradient | Mint becomes the **success** hue, so it is promoted from decoration to meaning |
| Violet `#d4c1ff` is decoration and hover | Violet also means **AI** and "information requested" |

## 7. Caveats
- Hex values are sampled from H.264 video, so chroma is slightly smeared. The site CSS values are authoritative where they overlap.
- Fonts cannot be identified from video; the grotesque matches the site's `neue-haas-unica` visually, but this is an inference.
- Sizes are measured in pixels of the 1148 px frame. The real app likely renders at a larger size and was scaled down, so use the **ratios** (type steps, row heights) rather than the raw pixels.
- Patient names and data in the video are demo data.
