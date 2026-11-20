# Ascertain design system

A design system abstracted from **https://www.ascertain.com** (every live page) and the **hero product video**. Open [`index.html`](index.html) for the visual version; the Markdown files hold the same content in text form.

| File | What it holds |
|---|---|
| [`index.html`](index.html) | Live specimens: colors, type, spacing, shape, motion, buttons, cards, status pills, product screens, AI layer, voice, accessibility |
| [`tokens.css`](tokens.css) | Every token as a CSS variable. `index.html` is built on it. |
| [`01_foundations.md`](01_foundations.md) | Color, typography, spacing, breakpoints, radius, shadow, motion |
| [`02_components.md`](02_components.md) | 24 marketing components (A1–A24), product components (B), rebuild advice (C) |
| [`03_layouts_imagery_and_voice.md`](03_layouts_imagery_and_voice.md) | Page skeleton, 12 layout patterns, recipes per page, imagery rules, voice, copy limits |
| [`04_product_ui_and_motion.md`](04_product_ui_and_motion.md) | Frame-by-frame breakdown of the hero video: 7 screens, status language, AI layer, motion |
| [`05_accessibility_and_responsive.md`](05_accessibility_and_responsive.md) | Contrast audit, gaps found, rules adopted, breakpoints, checklist |

## The system in six lines
1. **Canvas:** warm paper `#f6f4f1`, ink `#121212`, one lilac accent `#d4c1ff`.
2. **Type:** Rhetorik Serif (light) for headlines, Neue Haas Unica for everything else, tight tracking.
3. **Surfaces:** flat. Hairlines (black 5%) and glass blur instead of shadows. Radius 8 / 10 / 12 / 24 / pill.
4. **Layout:** 80 rem container, 12 columns, a sticky heading beside scrolling content, light and dark bands alternating.
5. **Product:** status as soft tinted pills with a word; AI as a floating lilac layer; one black button for the next action.
6. **Voice:** short, declarative, numbers as proof, "Request a demo".

## How this was made
- **Site:** every live page in the sitemap (Home, Solution, Who we serve, Cardiology, Company, Contact, Careers, Resource hub, 4 articles, legal and thank-you pages) was downloaded together with the shared 177 KB Webflow stylesheet. The sitemap's leftover Webflow template pages (`/readme/*`) and old German magazine posts were skipped. Four sub-agents each took a slice: (A) every value in the stylesheet, (B) Home and Solution, (C) Company, Who we serve, Cardiology, Contact, Careers, (D) Resource hub, articles, legal, shared parts and accessibility. Each wrote findings with the real class names and CSS rules.
- **Video:** the 38 s, 30 fps clip (1,140 frames) was sampled, not read frame by frame: scene-change detection, 76 frames at 0.5 s spacing on contact sheets, and 10 full-size key frames. Scene detection found no hard cuts. Colors were sampled from pixels.
- Everything was merged by hand into the files above, resolving conflicts in favor of the real CSS.

## Source tags used in the docs
**[site]** read from the real stylesheet · **[video]** sampled from the video, approximate · **[new]** a name or grouping added here.

## Caveats
- **Fonts are licensed.** Rhetorik Serif and PP Neue Montreal are commercial; neue-haas-unica comes via Adobe Fonts. `index.html` falls back to Georgia and system sans. Buy or license them before shipping a product that must look identical.
- **Video colors and sizes are approximate.** H.264 smears chroma (±4 per channel) and the clip is scaled. Use the ratios, not the raw pixels. Motion timings and easing are estimates from frame spacing.
- **Interactions are not in the CSS.** Accordion open/close, the button text roll, sticky cross-fades and scroll scenes run in Webflow Interactions and JS. They are described, not measured.
- **True 390 px mobile screenshots could not be captured** (headless Chrome stops near 500 px). Mobile behavior comes from the CSS media queries.
- **The site has defects** (placeholder FAQ answers, a 404 hub URL, a legal page with another company's text, contrast and focus gaps). They are listed in 03 §4.5 and 05 so a copy does not inherit them.
- This is an independent analysis of a public website for study. It is not an official Ascertain brand guide, and the Ascertain name, logo, copy and photography belong to their owner.
