# 01 · Foundations

The raw ingredients: color, type, space, shape, depth, motion. Every value is in [`tokens.css`](tokens.css) under the name shown here.

**Source tags:** **[site]** read from the real stylesheet (authoritative) · **[video]** sampled from the hero video (approximate) · **[new]** a name or grouping added by this document.

## The idea in one paragraph
Warm paper, near-black ink, and one lilac accent. A literary serif for headlines, a quiet grotesque for everything else. Flat surfaces separated by hairlines and soft glass blur instead of shadows. Calm, scroll-driven motion. The product is shown as real UI, not illustration. The effect is "serious software that is kind to tired people."

---

## 1. Color

### 1.1 Core palette [site]
| Token | Value | Role |
|---|---|---|
| `--paper` | `#f6f4f1` | Page background. Warm off-white, never pure white. |
| `--ink` | `#121212` | Body text, dark sections, the primary button. |
| `--white` | `#ffffff` | Cards, inputs, chips (things that must stand out from paper). |
| `--violet` | `#d4c1ff` | The single brand accent: hover fill, CTA fill, focus border, blob, headline word on dark. |
| `--brand-blue` | `#002bba` | Links, tag text, active tab. Used sparingly (7 uses). |
| `--surface-dark` | `#242322` | Dark cards, announcement banner, testimonial cards. |
| `--neutral-800` | `#3b3a38` | Dark button fill, mobile menu button. |
| `--neutral-900` | `#302f2e` | Text on a violet hover. |
| `--text-secondary` | `#5e5a56` | Grey paragraphs on light. |
| `--text-muted` | `#9b9b9b` | Tertiary text (fails contrast, see 05). |

### 1.2 Surfaces and lines [site]
| Token | Value | Used for |
|---|---|---|
| `--surface-warm` | `#f6f4f2` | Tab pills, TOC card, agent cards |
| `--surface-stone` | `#e1deda` | Media tiles, round arrow buttons |
| `--surface-lavender-top/bottom` | `#f0eafc` → `#f4f1f4` | Hero bands, callouts |
| `--mint` | `#d4f3f0` | Solution hero gradient |
| `--line-hairline` | black 5% | Card and glass borders (the standard) |
| `--line-input` | black 10% | Input borders |
| `--line-divider` | `#e4e4e4` | 1 px list dividers |
| `--line-pill` | `#ddd` | Pills, search, share buttons |

### 1.3 Gradients [site]
| Name | Value |
|---|---|
| Lavender wash | `linear-gradient(#f0eafc, #f4f1f4)` |
| Violet card | `linear-gradient(#e1deda, #d4c1ff)` |
| Mint hero | `linear-gradient(0deg, #d4f3f0, #f6f4f1)` |
| Violet hero | `linear-gradient(0deg, #d4c1ff, #f6f4f1)` |
| Light footer | `linear-gradient(0deg, #b0aca780, #f6f4f1)` |
| Dark footer | `linear-gradient(0deg, #000000d9, #121212)` |
| Blurred blob | not a gradient: a 30 rem `#d4c1ff` circle, `blur(50px)`, 40% opacity |

### 1.4 Glass fills [site]
White 40% (`#fff6`) on boxes, 80% (`#fffc`) on the nav bar, 25% (`#ffffff40`) nav blur layer, grey 10% (`#9894901a`) on default buttons, black 60% (`#1d1d1d99`) on the dark button variant. All sit on `backdrop-filter: blur(25px)`.

### 1.5 Accent words inside headlines [site]
One word per headline is colored: `#814aff` on light, `#d4c1ff` on black. Two-tone variants also exist: black sentence then grey (`#5e5a56`) sentence.

### 1.6 Status colors (product) [video] [new]
The site CSS has no status colors; the hero video does. Soft tinted pill, darker same-hue text.

| Status | Fill | Text |
|---|---|---|
| Approved | `#d8f4ec` | `#1f9e7a` |
| Needs review | `#f4e4ac` | `#8a6d12` |
| Denied | `#f4d0d4` | `#b3203a` |
| Pending / In review | `#d8ecfc` | `#2f7fb5` |
| Request for info / No auth | `#e8d8fc` | `#6b4fd0` |
| Draft | `#dcdcdc` | `#666666` |
| Submitting | `#f8e8c4` | `#8a6d12` |

AI is lilac: text `#703fe4` on `#ece8f8`. See [04](04_product_ui_and_motion.md).

### 1.7 Color rules
1. Page = paper. Pure white appears only inside things (cards, inputs, chips).
2. Dark sections are `#121212`; dark cards are `#242322` so they lift off the black.
3. One accent. Violet means *brand*, *hover*, and in the product, *AI*. Do not add a second brand color.
4. Mint is decoration on the site, and meaning (success) in the product.
5. Text colors by background: on paper use `#121212` / `#5e5a56`; on black use `#f6f4f1` / `#b0aca7`; on violet use `#302f2e`.

---

## 2. Typography

### 2.1 Families [site]
| Role | Family | Weights | Source |
|---|---|---|---|
| Display (headlines) | **Rhetorik Serif** | 300, 400, 500 + italics | Self-hosted OTF, `font-display: swap` |
| Body and UI | **neue-haas-unica** | 300, 400, 500 | Adobe Fonts (Typekit) |
| Controls (buttons, form fields, tags) | **Neue Montreal** (PP) | 300, 400, 500, 600 | Self-hosted OTF |
| Utility | **Inter** | 300, 400 | Google Fonts |

Smoothing: `-webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility`.

### 2.2 Type scale [site]
| Style | Family | Size | Weight | Line | Tracking |
|---|---|---|---|---|---|
| Headline XL | neue-haas | 80 px | 300 | 1.0 | -0.75 px |
| Headline L (stat numbers) | neue-haas | 64 px (48 mobile) | 300 | 1.0 | -0.75 px |
| **Headline M** (page titles) | Rhetorik Serif | 48 px (32 mobile) | 300 (400 left-aligned hero) | 1.1 | -0.5 px |
| **Headline S** (section titles) | Rhetorik Serif | 36 px (28 mobile) | 300 | 1.2 | -0.5 px |
| Headline XXS | Rhetorik Serif | 28 px | 400 | 1.2 | -0.5 px |
| Headline XS | neue-haas | 18 px | 400 / 500 | 1.5 | -0.25 px |
| Copy | neue-haas | 16 px | 400 (500 "semi") | 1.5 | 0 |
| Copy small | neue-haas | 14 px | 400 | 1.3 | 0 |
| Button label | Neue Montreal 16 / neue-haas 15 | 15–16 px | 400 | 1.4 | 0 |
| Tag | Neue Montreal | 15 px | 500 | 1.3 | 0 |
| Stat number (card) | neue-haas | 40 px | 500 | 1.1 | -0.2 px |
| Eyebrow badge | system | 12 px, uppercase | 500 | | +1 px |

### 2.3 Long-form text [site]
| Element | Spec |
|---|---|
| Article h2 | Rhetorik Serif 40 px / 400 (line-height unset, so 36 px; set it to 1.2) |
| Article h3 | Rhetorik Serif 28 px / 400 / 1.2 |
| Paragraph | neue-haas 18 px / 1.4, 20 px bottom margin |
| List item | 18 px / 1.3, 24 px bottom margin |
| Quote card | 24 px / 1.2 on `#242322`, white text, radius 12 px, padding 28 px |
| Link | `#9a6eff`, underlined, hover `#3b3a38` |

### 2.4 Type rules
1. **Serif for headlines, sans for everything else.** Never set body in the serif.
2. Headlines are *light* (300). Heavier weights are for labels (500) only.
3. Headlines are tight: line-height 1.0–1.2 and negative tracking.
4. Sentence case everywhere. Title Case appears only in a few card titles.
5. Mobile: size tokens drop (48→32, 64→48, 36→28) at 479 px. The 80 px XL does not shrink (a source quirk; cap it yourself).
6. Product UI is sans-only and much smaller (10–13 px). See [04](04_product_ui_and_motion.md).

---

## 3. Spacing [site]
Scale in rem: **0.25 · 0.5 · 1 · 2 · 3 · 4 · 5 · 6 · 7 · 8** (`--space-025` … `--space-8`). Common in-between values: 0.75, 1.25, 1.5, 1.75, 2.5.

| Pattern | Value |
|---|---|
| Section vertical padding | 7 rem (4 rem at ≤991) |
| Section side padding | 2 rem (1.5 rem at ≤479) |
| Container max width | 80 rem; 85 rem at ≥1440; 90 rem at ≥1920 |
| First section top padding | 10 rem (7 rem at ≤479) |
| Grid | 12 columns, 1 rem gap |
| Card padding | 1–2 rem (feature cards 2–3 rem; hero card 5 rem top) |
| Stack gaps | headline → body 1 rem; body → button 2 rem; block → block 4–5 rem |
| Width helpers | `max-width` 15–80 rem in 5 rem steps (e.g. 30 rem for hero subline) |

### Breakpoints [site]
Webflow defaults. Max-width: **991** (tablet), **767** (mobile landscape), **479** (mobile portrait). Min-width: **1280**, **1440**, **1920**.

---

## 4. Shape and depth

### Radius scale [site]
| Token | Value | Used on |
|---|---|---|
| `--radius-xs` | 4 px | small icon buttons, product inputs |
| `--radius-s` | 8 px | tags, media tiles, nav button, glass box |
| `--radius-btn` | 10 px | primary buttons, form fields, timeline labels |
| `--radius-m` | 12 px | cards, tabs, search field |
| `--radius-l` | 16 px | submit button, cookie card (mobile) |
| `--radius-xl` | 24 px | feature cards, thumbnails, video frames |
| `--radius-pill` | 100 px | pills, eyebrow badges, round arrows |
| circle | 100% | avatars, play button |

### Borders and shadows [site]
- Hairline `1px solid black 5%` is the default card edge. Inputs use black 10%. Dark cards use white 5%.
- Only **two real shadows** exist: `0 2px 40px #0000000d` (floating pills) and `0 4px 1rem #2629260d` (cookie card).
- Depth comes from **glass**: `backdrop-filter: blur(25px)` on buttons and boxes, 30 px on the nav, 5 px on small chips.
- Greyscale logos: `filter: saturate(0%)` and `invert() brightness(0%)`.

### Z-index [site]
Content 1–3, sticky headers 3, banner and floating nav 10, preloader 11, cookie card 100.

---

## 5. Motion

### Vocabulary [site]
| Use | Value |
|---|---|
| Hover and color shifts | `all 0.2s` (default), `0.3s` (nav button, search), `0.4s` (image scale) |
| Custom easing | `cubic-bezier(0.25, 0.46, 0.45, 0.94)` (ease-out-quad), only on the cookie deny link |
| Carousel slide fade | `opacity 0.8s ease-in-out` |
| Caption fade | `opacity 0.4s ease` |
| Logo marquee | 50 s linear, infinite, reversed |
| Vertical photo column | 20 s linear, infinite, pauses on hover; items blur 8 px on hover |
| Spinner | 0.8 s linear |
| Hover scale | `transform: scale(1.05)`, 0.4 s |

### Behavior patterns [site]
- **Sticky heading, scrolling content** (the dominant two-column pattern).
- **Pinned scroll scene:** a 300 vh wrapper with a 100 vh sticky inner (the "Connect. Automate. Scale." pill cloud).
- **Horizontal rail:** a pinned heading while testimonial cards slide sideways.
- **Scroll-fill timeline:** a 1 px rail that fills as you scroll.
- **Parallax photos:** images 120% tall (135% on mobile).
- **Text reveal:** line-by-line rise on headlines.
- **Nav mode switch:** a 1 px sentinel flips the nav to dark when a black section is in view.
- Stack: Lenis smooth scroll, GSAP and ScrollTrigger, Webflow Interactions, Lottie.

### Motion rules
1. Calm and slow: 0.2–0.4 s for UI, long loops for ambient motion. No bounce, shake or flash.
2. Color shifts on hover (grey → ink, grey → violet). Scale only on imagery.
3. Ambient motion (marquees) must pause on hover.
4. Honor `prefers-reduced-motion` (the source does not; see 05).

The product's motion (camera push, drawer slide, AI orb, check morph) is in [04](04_product_ui_and_motion.md).
