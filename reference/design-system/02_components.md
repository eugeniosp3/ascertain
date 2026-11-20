# 02 · Components

Every reusable piece, with anatomy, measurements and states. **Marketing** components come from the site CSS (class names are the real Webflow classes, so you can find them). **Product** components come from the hero video and are described in detail in [04](04_product_ui_and_motion.md). Token names refer to [`tokens.css`](tokens.css).

---

## Part A · Marketing site components

### A1. Buttons
Three families. Pick by job, not by taste.

| Family | Class | Look | Use |
|---|---|---|---|
| **Primary** | `.primary-btn` | Rectangle, radius 10 px, padding `.8rem 1.5rem .7rem`, label 15 px, no border, no icon | Page CTAs |
| **Nav / pill CTA** | `.nav-btn-dark`, `.nav-btn` | Radius 8 px, padding .75 rem (.5 rem for the floating one), label plus a 24 px bordered arrow chip | "Request a demo" in header, floating bar, footer |
| **Text** | `.cookie-deny` | Text only, 15 px | Dismiss / reject |

**Primary variants**

| Variant | Fill | Label | Use |
|---|---|---|---|
| `.is-gray` | `#3b3a38` | paper | Hero CTA |
| `.is-black` | `#121212` | paper | Strong CTA on light or card |
| `.is-purple` | `#d4c1ff` | ink | CTA on a black section |
| `.is-white` | transparent, 1 px black border | ink | Secondary (outline) |
| `.is-light` | `#ffffff` | ink | On warm surfaces |
| default | black 10%, `blur(25px)` | paper | Glass, over imagery |

**States**
- Hover (nav button, submit): fill becomes violet `#d4c1ff`, text and arrow become `#3b3a38`, `0.3 s`.
- Primary buttons: the label is duplicated inside a 1.5 rem masked box so a "text roll" can run on hover (Webflow interaction; not in CSS).
- Submit button: full width, radius 16 px, `#121212`, border white 5%.
- Focus: not defined in the source. Use the ring in [05](05_accessibility_and_responsive.md).

**Icon buttons:** `.swiper-arrow` 4 rem square, white, hairline, radius 12 px, `blur(5px)`; round arrows 2.5 rem `#e1deda` (hover `#ccc9c5`); share buttons 2.5 rem, `#ddd` border, radius 8 px (hover black fill); play button 4 rem glass circle.

### A2. Navigation
```
Navbar (transparent, not sticky)
 ├─ Logo (wordmark with chevron glyph, 1.25 rem high)
 ├─ Links: Solution · Who we serve · Company · Resources · Careers   (16 px, padding 20 px)
 └─ CTA button "Request a demo" (dark, arrow chip)
Floating CTA pill: fixed, bottom 1 rem, centered, hidden ≤991
```
- Link color `#242322`, hover/current `#121212`, `0.2 s`.
- **Dark-mode variant:** links become paper at 60%; the nav flips automatically while a black section scrolls under it (a 1 px sentinel element drives it).
- **Collapse at ≤991:** logo plus a dark rounded-square hamburger (`#3b3a38`, radius 8 px). Open menu = paper sheet, bottom radius 32–48 px, vertical links, CTA at the end.
- **Announcement banner** (optional): fixed top, 2.75 rem high, `#242322`, paper text, lilac `#b392ff` link with a small arrow.
- Older style: floating glass nav (`#948b8b17`, `blur(25px)`, radius 10 px, 23 rem wide).

### A3. Footer
- Quiet, links only. Four columns: logo + live clock + date + demo button / site links / contact, LinkedIn, privacy / copyright.
- Light variant: gradient up from paper to `#b0aca7` 50%, height 50 vh (min 20 rem). Dark variant: gradient to near-black, 10 vh (min 15 rem), paper-60% links.
- Stacks to one column at ≤991.

### A4. Cards and surfaces
| Card | Spec | Use |
|---|---|---|
| **Glass box** `.box` | white 40%, hairline, radius 8 px, `blur(25px)` | Default container over imagery |
| **Solution card** `.box.is-solution` | `#f6f4f2`, radius 24 px, padding 2–3 rem | Feature blocks |
| **Violet card** `.box.with-gradient` | `#e1deda` → `#d4c1ff`, radius 8 px, image behind text | Featured CTA card |
| **Dark card** `.box.is-grey/.is-dark` | `#242322`, white text | Contrast cards on black |
| **Testimonial** `.testimonial_card` | `#242322`, white-5% border, radius 13 px. Top: logo tile (white 10%, radius 8) + 20 px quote. Divider. Bottom: 80 px square headshot (radius 5) + name (18 px/500) + role + company (14 px) | Customer quotes; 32% wide in a horizontal rail |
| **Agents card / stats card** | `#f6f4f2` or photo background, radius 24 px, padding 1.5–2 rem | Audience, results |
| **Callout** `.general-card` | `#f0eafc` body with a 0.5 rem violet (`#9a6eff`) left bar, radius 12 px | Article facts |
| **Author card** | `#f9fafb`, border `#e5e7eb`, radius 12 px, padding 28 px | Article bio |
| **CTA band** `.middle_cta-wrapper` | `#e7e2f3` + dot pattern, radius 12 px, padding 2.5 rem | Mid-page prompt |
| **Photo tile** `.scroll_item` | Photo, radius 12 px, frosted label chip, blur on hover | Sector tiles |
| **Media tile** `.video-div` | `#e1deda`, radius 8 px, holds product video | Product shots |
| **Resource card** `.resources_card` | 16:9 thumbnail radius 24 px, tag pill + date, 36 px serif title, 3-line clamped summary, avatar + author | Hub grid |

### A5. Tags, pills, chips
| Name | Spec |
|---|---|
| `.pill` (capability chip) | paper or white, hairline, radius 100 px, padding 1 × 1.5 rem, shadow `0 2px 40px #0000000d`; static ≤991 |
| `.tag` | brand blue 5% fill, blue 15 px/500 label, radius 8 px |
| `.tag_resources` | white, `#ddd` border, radius 50 px, 16 px |
| Eyebrow `.text-style-eyebrow` | white pill, `#ddd` border, 16 px |
| Filter pill `.radio_wrapper` | padding .5 × 1.5 rem, radius 8 px; selected = black fill, white text |
| Frosted chip `.item_tag` | white-on-grey glass, 20 px, radius 12 px |
| TOC badge | 12 px uppercase, +1 px tracking, `#6e30f7`, radius 4 px |

### A6. Forms
| Part | Spec |
|---|---|
| Text field `.form-field` | white, `1px black 10%`, radius 10 px, padding `1.5rem 1rem`, 16 px Neue Montreal, placeholder `#9b9a9ab3`, focus border violet |
| Textarea | radius 8 px, padding `1rem 1rem 1.5rem` |
| Select | 3.2 rem high, radius 10 px |
| Search `.input_search` | `#ddd` border, radius 12 px, 18 px text, magnifier at left, focus border ink |
| Submit `.submit-btn` | see A1 |
| Success message | white 20% panel, radius 10 px |
| Layout | single column, 1 rem gap; two columns for short pairs |

Known gap: the text color inherited by `.form-field` is near-white in CSS; always set it to ink.

### A7. Accordion (FAQ)
- Each row has **only a top hairline** (no card). Question at 16 px/400 on the left, a thin "+" circle icon on the right, grey (`#5e5a56`) answer below.
- Padding 1 rem 0. Rows toggle on click (Webflow interaction). Use `aria-expanded` when you rebuild it.
- The older plus icon is built from two 2 px bars (`.faq-icon-line-1/2`) 24 px long.

### A8. Tabs and filters
- `.tab-item`: white, hairline, radius 12 px; current = brand blue fill, paper text.
- `.tab_style`: warm `#f6f4f2` pill-rect, Inter 18 px, radius 8 px, padding 16 × 24 px; current = ink fill, white text.
- A 5 px violet progress bar (`.tab-progress-bar`) sits under auto-advancing tabs.

### A9. Media, sliders, marquees
- **Logo marquee:** 7 rem tall strip, logos 7 rem wide, forced to black/grey, edge fade to paper at 16% / 85%, 50 s linear loop, reversed.
- **Video carousel:** slides stacked, cross-fade 0.8 s; a row of 4 px progress bars (4 rem wide) under the video, the active one fills for the clip's duration; caption "1/7 Prior authorization" in grey 14 px.
- **Vertical photo column:** 650 px tall, 20 s loop, pauses on hover.
- **Product video frame:** radius 12 px (hero) or 8 px (tiles), always on warm `#e1deda`.
- **Lottie text ticker** inside a dark card.

### A10. Timeline (process)
A 1 px vertical rail (`#d3d0cd`) with a darker fill (`#5e5a56`) that grows on scroll. Four labels ("Listen, Configure, Deploy, Scale") as paper chips with a hairline and radius 10 px, 18 px text. 6 rem fade masks cover the rail ends. The right column holds the explanations.

### A11. Stat block
64 px light sans number (`-0.75 px` tracking, white on black) beside a 16 px/500 label and a grey description. Three in a stack, divided by space not lines. Card variant: 40 px/500 number.

### A12. Feature checklist
Hairline, then a 1.2 rem check icon plus a 16 px grey label, then hairline. Variant (benefit cell): check + 16 px/500 title, grey body below, no card or border. Two columns, `3rem` column gap, `6rem` row gap.

### A13. Cookie card
Fixed bottom-right, 25 rem wide, `#f1f1f199` with `blur(25px)`, radius 12 px, padding 2 rem. Title 16 px/500, body 14 px, buttons: black "Accept", text "Reject". Full width at ≤479.

### A14. Article template
- **Hero band:** lavender gradient, back link with arrow chip, tag pill + date + dot + "N mins read", serif H1 (48 px), author avatar (48 px) + name, four 40 px share buttons (copy, X, Facebook, LinkedIn).
- **Body:** sticky TOC card (390 px, `#f6f4f2`, radius 16 px, padding 28 px; current link violet `#6e30f7`) beside the text column.
- **Rich text:** see 01 §2.3. Quote card is dark. Links violet and underlined.
- **After:** author bio card, then "More Resources" (3-up grid).

### A15. Hub
Hero band with H1 "Resource Hub" and a 2-column featured item; list band with a segmented filter (All · Blogs · Case Studies · News) plus search, then a 3-up card grid (2 at ≤991, 1 at ≤767).

### A16. Team card (Company)
No card chrome: a square-cornered portrait (fixed 17.5 rem high, 20 rem at ≥1440, 22.5 rem ≤991, `object-fit: cover`), then name (16 px/500 ink), role (16 px grey), and a hover-revealed "LinkedIn ↗" row (grey, 1.2 rem arrow). 3 columns (32 px column gap, 48 px row gap), 2 at ≤991, 1 at ≤479. The whole card is a link.

### A17. Glass stat carousel (Who we serve hero)
Over a wide photo (radius 24 px), a vertical stack of translucent cards (`#0000001a`, `blur(28px)`, radius 16 px, padding 1 rem, white text): 40 px/500 number + 16 px label. The active card is sharp; inactive cards are `blur(2px)` (`filter .15s`). Hidden ≤991. Five stats: 95% · 350 → <10 · 67% · $1M+ · <90 days.

### A18. Agent card (Cardiology)
`#f6f4f2`, radius 24 px, padding 2 rem, 2×2 grid with 16 px gaps. Title in serif 28 px/400, grey 16 px description, then a product screenshot (PNG) anchored to the bottom. The first card has an elbow connector arrow (319 × 33 SVG) pointing to the next. A hidden uppercase kicker exists in the DOM ("Referral intake", "Scheduling"…).

### A19. Photo stat card (Cardiology black band)
Four across. Radius 24 px, padding 1.5 rem, blurred lavender-tinted photo background. Number in serif **80 px/400 `#673bcc`**, a 10 rem gap, then a 24 px light label in white. Wraps to two lines at 80 px ("8 weeks"), so allow for it.

### A20. Check tags and tab panel (Cardiology "Infrastructure")
Pill tabs (see A8) above one big card (`#f6f4f2`, radius 24 px, padding 3 rem, two columns, 4 rem gap). Left: 24 px serif title, grey paragraph, then wrapped **check tags** (white, `#e6e6e6` border, radius 8 px, padding 12 px, 14 px text, leading check icon, 12 px gap). Right: a product screenshot.

### A21. Quote layout (large testimonial)
Square portrait (radius 24 px) left; right: a violet quote-mark SVG, a 20 px/30 px quote, a 1 px `#b0aca7` rule, name in serif 24 px, title in grey 16 px. Two columns with 40 px gap; one column ≤991.

### A22. Integration logo grid
Six tiles on black, 3 × 2 (2 columns ≤479), 16 px gaps; each tile `#242322`, radius 8 px, padding 16 × 12 px, a centered SVG logo.

### A23. Investor logo row
Heading + grey copy in column one; three black logos (max 10 rem wide) in columns two to four. No tiles, no borders.

### A24. Embedded third-party UI (off-system)
- **Contact form** (HubSpot iframe): labels above fields; first/last name in one row; company name, company email, "How did you hear about us?" (select), "Which EHR are you currently on?*" (select); red asterisk on required; fields about 46 px high, fill a step darker than paper (`#e8e6e1`), 1 px `#d0cec9` border, radius 8 px; solid dark "Send Request" button. HubSpot styles it, not the site CSS, so keep it **visually matched to the A6 form spec** when you rebuild.
- **Careers** (Ashby embed): a white card, serif H1, a filter grid of four selects (Department, Employment Type, Location, Location Type), jobs grouped by department with the meta line `Department • Location • Full time • Remote`. Its font and link colors are off-system; restyle with the tokens.

---

## Part B · Product UI components (from the video)
Full detail, with measurements, states and motion, is in [04](04_product_ui_and_motion.md). Summary:

| Component | One-line spec |
|---|---|
| App window | Paper, radius ≈10 px, inside a 14 px frosted bezel on a mauve gradient |
| Sidebar | 173 px, seven items with 16 px line icons, active = 8 px-radius grey pill |
| Top bar | Logo + breadcrumb, bell with red dot |
| Case header | Name 18 px; label/value grid (10 px grey labels, 12 px ink values); assigned-to column |
| Tabs | Text tabs, 2 px ink underline on active |
| Wizard bar | Back · progress bar (ink, teal at 100%) · Next/Submit |
| Data table | 65 px rows, circular avatar, name + DOB, status pill, rounded outer border |
| Status pill | Tinted fill, darker text, fully rounded, 11 px (see 01 §1.6) |
| Coverage chip | White pill, green dot, "Active" |
| Stat tiles | 5-up strip, 28 px tinted icon chip, number, label, hairline dividers |
| Group row | Collapsible, tinted bar, count badge |
| Side panel (drawer) | ≈322 px, radius 10 px, scrim 35%, header with name/DOB/close, footer actions |
| Combobox | Input + chevron; list with name, kind label, domain; add-new row |
| Stepper | 4 bordered cells with connectors; done = teal check |
| Form field | Label above (asterisk if required), white input, 4 px radius, 28 px high |
| Buttons | Black solid (next action), grey-filled (secondary), text (back); 28 px high |
| Empty state | Grey folder, bold line, grey helper, black button |
| AI pill / AI orb | Lilac floating pill with sparkle; 60 px orb with rotating pastel ring that morphs to a teal check |

---

## Part C · Naming and structure advice (if you rebuild this)
The source mixes two naming eras (`global-*`, `.box`, `.primary-btn` and BEM-style `testimonial_card`) and has several clones (`global-wrapper-2`, `primary-btn-2`, `btn-txt-2`, `section-layer-3..7`). When rebuilding:
1. Use one convention (BEM or component-scoped) and one button component with `variant` and `size` props.
2. Replace the four `.box` flavors with a single `Card` with `tone` (`glass | warm | dark | violet`).
3. Build `Pill` once and give it `kind` (`chip | status | tag | filter`).
4. Build desktop and mobile once, not twice.
5. Put the status palette in tokens and map statuses to components in one place, not per page.
