# 03 · Layouts, imagery and voice

How the pieces combine into pages, what the pictures look like, and how the words sound. Pages scanned: Home, Solution, Who we serve, Cardiology, Company, Contact, Careers, Resource hub, articles, legal. Class names are the real Webflow classes. Component specs are in [02](02_components.md).

---

## 1. The page skeleton
```
body (paper #f6f4f1, overflow-x hidden)
 ├─ banner (optional, hidden today)
 ├─ navbar
 ├─ floating CTA pill ("Request a demo", fixed bottom center, hidden ≤991)
 ├─ main-content
 │    └─ section × N      = .default-section > .global-wrapper > content
 ├─ footer (light gradient, or dark variant after a black section)
 └─ cookie card (fixed bottom right)
```
A **section** is a full-width flex column with a background; its **wrapper** holds the content at 80 rem max, 7 rem top and bottom, 2 rem sides. Section backgrounds, in the order you will use them:

| Variant | Fill | Typical use |
|---|---|---|
| default | paper `#f6f4f1` | Most sections |
| `.is-white` / `.is-pure-white` | `#f8f6f4` / `#fff` | Alternate bands, lists, FAQ |
| `.bg-gradient` / `.is-resources` | lavender wash | Hero of hub, article, Who we serve, Cardiology |
| `.hero-gradient` | mint or violet up from paper | Solution hero |
| `.is-black` | `#121212` | Stats, mission, testimonials, integrations |
| `.bg-violet` | `#d4c1ff` + dotted texture | Final CTA |
| `.h-100` | 100 vh, min 50 rem | Full-screen heroes |

**Rhythm:** alternate light and dark bands (light hero → light content → black proof → violet or light CTA → footer). Never two violet bands in a row.

---

## 2. Layout patterns (the vocabulary)

| # | Pattern | Anatomy | Where used |
|---|---|---|---|
| 1 | **Sticky heading, scrolling content** | 12-col grid. Left ≈ 5 cols: heading sticks at `top: 15vh`. Right: content scrolls. | Home story, stats, Solution benefits and FAQ, Company, Who we serve, Cardiology FAQ |
| 2 | **Centered statement** | Max-width 30–45 rem, centered, H2 + grey paragraph | Hero text, "Connect. Automate. Scale." |
| 3 | **Split hero** | 62/38 (home: product video left, copy right), 30/70 (Who we serve), 50/50 (Cardiology) | Heroes |
| 4 | **Cross-fading text layers** | 7 absolutely stacked text blocks on the sticky side that swap as the right-side images scroll | Home triplet, Who we serve segments |
| 5 | **Pinned scene** | 300 vh wrapper, 100 vh sticky inner; elements animate in while pinned | Capability pill cloud |
| 6 | **Horizontal rail** | Pinned heading; cards slide sideways on scroll | Testimonials |
| 7 | **Card grid** | 2×2 (agent cards), 3-up (resources, team), 4-up (stats), 3×2 (integration logos); 16 px gaps (team 32 / 48) | Cardiology, Company, Hub |
| 8 | **Process timeline** | Rail in the middle, labels on the rail, copy on the right | Solution |
| 9 | **Tabs with panels** | Pill tabs above one big warm card: text + check tags left, screenshot right | Cardiology "Infrastructure" |
| 10 | **Two-tone headline** | Black clause + grey clause, or white + lilac clause, or purple + black | Everywhere |
| 11 | **Hairline list** | Divider, check + label, divider | Feature checklists |
| 12 | **CTA band** | Violet block (radius 24 px, 100 px padding) with a headline and a light button; or a lavender strip with text left and button right | Page endings |

### Page recipes
| Page | Sequence |
|---|---|
| **Home** | Split hero (product video) → value statement → logo marquee → 3-part sticky story + video carousel → "Connect. Automate. Scale." pinned cloud → black stats → black "Made by healthcare teams" (scrolling photo column) → black card pair → testimonial rail → dark footer |
| **Solution** | Gradient hero (no CTA) → process timeline → benefits grid (6 cells) → FAQ (10 rows) → footer |
| **Who we serve** | Lavender split hero with glass stat carousel → centered intro → 7 segments (sticky text, photo column) → mid CTA strip → black results → violet CTA box → footer |
| **Cardiology** | Lavender 50/50 hero (photo with product card) → "Four agents" 2×2 cards → black stat cards → testimonial (portrait + quote) → tabbed "Infrastructure" → black integrations → FAQ → violet CTA |
| **Company** | Full-bleed photo hero with scrim → sticky statement → manifesto in serif → leadership grid → investor logos → careers CTA → footer |
| **Contact** | Two columns: two-tone H1 left, HubSpot form right. No hero image. |
| **Careers** | Plain H1 and an embedded job board |
| **Hub / article** | Lavender hero → filter + search + card grid / article with sticky TOC → author card → related grid |

---

## 3. Imagery

### 3.1 Rules of thumb
1. **Show the product.** Hero and feature visuals are screen recordings of the real UI (rounded 8–12 px, on warm stone `#e1deda`), not abstract illustration.
2. **Photography is quiet.** Natural-light clinicians and patients, warm neutral grade, no duotone, no heavy overlay. The only scrim is 45% black on the Company hero.
3. **Logos are monochrome.** Forced to black or grey with CSS filters; shown without tiles on light, on `#242322` tiles on black.
4. **Icons are thin-stroke and monochrome:** check (1.2 rem), plus-in-circle (1.5 rem, 50% opacity), arrow, arrow-up-right. Always in the text color.
5. **Decoration is soft:** a blurred violet blob, a large ellipse sticker, a dotted-line texture, an "aura" video behind the hero.

### 3.2 Formats and wrappers
- Photos AVIF; people WebP; product screenshots PNG; icons and logos SVG; clips MP4 + WebM + poster.
- **Aspect-ratio box pattern:** a wrapper with `padding-bottom: N%` and an inner `img` with `position: absolute; inset: 0; object-fit: cover`.

| Use | Ratio | Radius |
|---|---|---|
| Home hero video | 1606 : 1008 | 12 px |
| Media tile / carousel | 3 : 2 | 8 px |
| Who we serve banner | ≈ 2.5 : 1 | 24 px |
| Segment photo | ≈ 1.5 : 1 | 8 px |
| Cardiology hero | ≈ 1.2 : 1 | ≈ 24 px |
| Agent screenshot | ≈ 2.2 : 1 | none (on card) |
| Testimonial portrait | ≈ 1 : 1 | 24 px |
| Resource thumbnail | 16 : 9 | 24 px |
| Team photo | 228 × 320 (fixed height 17.5 rem) | none (square) |
| Headshot (testimonial card) | 80 × 80 | 5 px |
| Avatar | 48–64 px | circle |

### 3.3 Product screenshot treatment
White UI on a warm card, with pastel chips and green checks; baked into photos where needed (Cardiology hero). The hero video (see [04](04_product_ui_and_motion.md)) places the app in a frosted lilac bezel on a mauve gradient.

---

## 4. Voice

### 4.1 Principles
1. **Short and declarative.** Headlines are 3–8 words, sentence case, usually a full stop.
2. **Benefit first, proof close behind.** "ROI in months, not years." followed by "…in under 90 days."
3. **Rhythm in fragments.** "Connect. Automate. Scale." "100+ clinics. Under 8 weeks. ROI in 90 days."
4. **"X, not Y."** Contrast the problem with the outcome ("focus on patients, not paperwork").
5. **Numbers are the proof.** 95%, 67%, 350 → <10 hours, under 90 days, 4–6 weeks.
6. **Domain-specific in the body** (NYHA class, PCI, DOAC, step therapy, FQHC); plain in the headline.
7. **Active verbs for the agents:** ingests, books, drafts, triages, flags.
8. **Second-person plural** for the customer ("your teams", "your clinicians"), third person for the product ("Ascertain runs…").
9. **Calm confidence.** No exclamation marks, no emoji, no hype words, no "Get started".

### 4.2 Patterns with verbatim examples
| Pattern | Examples |
|---|---|
| Value statement | "Automate the work that slows healthcare down" · "ROI in months, not years." · "Patient access, automated." |
| Fragment triplet | "Connect. Automate. Scale." · "Simplify operations / Empower care teams / Engineered for trust" |
| Proof line | "Making a measurable impact on efficiency, morale, and care delivery." · "What cardiology teams see in 90 days." |
| Identity | "Made by healthcare teams." · "Shaped by leaders in healthcare" |
| Problem line | "Every admin delay is a missed moment for quality care." |
| Capability | "Four agents, one cardiology workflow." · "Meets you inside the tools you already run." |
| Trust | "Built for clinical-grade work." · "HIPAA and SOC 2 Type II, by default." |
| Candid FAQ | "Why not just offshore the automation?" · "How quickly can Ascertain be deployed?" |

### 4.3 Calls to action
| Role | Label |
|---|---|
| Primary (everywhere) | **Request a demo** |
| Secondary | Learn more · Our mission · Open Roles · Get your custom ROI analysis |
| Soft, segment-specific | Talk to us about your setting |
| Form submit | Send Request |

Rules: verb first, sentence case ("Request a demo", not "Request a Demo"), one primary CTA per view.

### 4.4 Labels, eyebrows and microcopy
- Eyebrow pills are 1–3 words: "Who we serve", "For cardiology", "Agentic AI", "Expert agents", "Infrastructure", "Integrations", "Results from the field".
- Navigation: Solution · Who we serve · Company · Resources · Careers.
- Product microcopy: "AI analyzing", "Running...", "Approved", "No auth required", "Create tasks to track case progress", "Back to details", "Run check now".
- Dates: "Jul 20, 2026" on the site; `MM/DD/YYYY` in the product.

### 4.5 Source copy defects (do not copy)
Placeholder FAQ answers ("This is some text inside of a div block." ×4), "Request a Demo" capitalisation drift, "audibility" for "auditability", desktop and mobile copy that disagree, a stat that is 95% in one place and 85% in another, "Coming Soon" labels only in the mobile build, footer "© 2025", legal pages containing another company's German text and a "DOMAIN EINFÜGEN" placeholder, and the German-titled "Danke" page.

---

## 5. Content slots (for writing new pages)
| Slot | Limit |
|---|---|
| H1 / H2 (serif 48) | ≤ 8 words, ≤ 2 lines |
| H2 (serif 36) | ≤ 10 words |
| Subline (grey 16) | ≤ 30 words, max 30 rem wide |
| Card title (serif 28) | ≤ 4 words |
| Card body (16) | ≤ 40 words |
| Stat label | ≤ 6 words |
| Eyebrow pill | ≤ 3 words |
| Button label | ≤ 4 words |
| Testimonial quote | ≤ 60 words (the Cardiology one is 90 and reads long) |
