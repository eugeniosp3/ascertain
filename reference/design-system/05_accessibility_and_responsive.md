# 05 · Accessibility and responsive behavior

Two halves: what the source site does (measured), and the rules this design system adopts so a copy does not inherit the gaps. Contrast ratios were computed with the WCAG relative-luminance formula.

## 1. Contrast: pairs that pass

| Pair | Ratio | Level |
|---|---|---|
| Ink `#121212` on paper `#f6f4f1` | 17.1 | AAA |
| Ink on white | 18.7 | AAA |
| White on ink / white on `#242322` | 18.7 / 15.7 | AAA |
| White on `#3b3a38` (dark button) | 11.4 | AAA |
| Secondary text `#5e5a56` on paper / white | 6.2 / 6.8 | AA |
| `#3b3a38` on violet `#d4c1ff` (button hover) | 7.0 | AA |
| Link blue `#002bba` on paper | 9.3 | AAA |
| TOC current `#6e30f7` on warm card | 5.6 | AA |

## 2. Contrast: pairs that fail (do not copy)

| Pair | Ratio | Fix in this system |
|---|---|---|
| Article link `#9a6eff` on white | 3.47 | Use `#6e30f7` (5.6) for text links |
| Muted `#9b9b9b` on white / paper | 2.8 / 2.5 | Text must be `#5e5a56` or darker; keep `#9b9b9b` for disabled only |
| Light grey `#b0aca7` on paper | 2.1 | Use only on black backgrounds (about 8 : 1) |
| `#ddd` border vs white (pill, search, share) | 1.4 | Add a `#767676` or darker border on controls that need a visible edge |
| Filter track `#f6f4f2` vs white | 1.1 | Add a hairline or a stronger fill |
| Legal link `#002bba` vs ink text, no underline | 1.8 | Underline links in running text |

## 3. Gaps measured on the source site

| Area | Finding | Rule adopted |
|---|---|---|
| Focus | No `:focus-visible` styles. A cookie embed sets `.w--redirected-focus { box-shadow: none !important }`, which removes the filter-tab ring. | Every interactive element gets a 2 px visible ring (see 4.1). Never remove focus with `!important`. |
| Motion | No `prefers-reduced-motion` query anywhere. Lenis, GSAP, parallax and a once-per-second footer clock always run. | Provide a reduced-motion mode (see 4.2). |
| Landmarks | No `<main>`, `<article>`, `<footer>`, `<time>`. `<header>` wraps a whole article. | Use real landmarks. |
| Names | Icon-only share links and the search field have no accessible name. Logo alt is "logo". | Every icon-only control needs `aria-label`; logo alt = "Ascertain". |
| Headings | A hidden template contains an `<h1>`. Legal pages style `<h3>` as body text. | One `<h1>` per page; visual size must follow heading level. |
| Language | `lang="en"` on German legal pages. | Set `lang` per page. |
| Skip link | None. | Add "Skip to content". |
| Cookie card | Not a dialog; Accept/Reject are `<a href="#">`; rendered last in the DOM. | Use `role="dialog"`, real buttons, focus management. |
| External links | `target="_blank"` without `rel`. | Add `rel="noopener"` and a visible cue. |
| Reading width | Article text about 100 characters per line at 1440 px. | Cap body text at 65–75 characters (about 40 rem at 18 px). |
| Color-only status | (Product) status is always color plus a word. | Keep this. It is the best practice in the system. |

## 4. Rules for new work

### 4.1 Focus ring
```css
:focus-visible {
  outline: 2px solid var(--ink);
  outline-offset: 2px;
  box-shadow: 0 0 0 4px var(--violet);
}
```
Works on paper, white and violet. On dark sections use `outline-color: var(--paper)`.

### 4.2 Reduced motion
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```
Also: turn off Lenis smooth scroll, pinned scroll scenes and parallax; stop marquees; replace the live clock with static text.

### 4.3 Touch and size
- Targets at least 44 × 44 px on touch screens (the site's 40 px share buttons and 28 px product buttons are below that).
- Body text at least 16 px on mobile; 18 px for long reading.
- The product's 10 px captions are for secondary labels only, never for required values.

### 4.4 Status and AI
- Status = tinted pill **plus** a word (and an icon on tiles). Never color alone.
- AI work is announced in a polite live region ("AI analyzing", then the result). The result must be visible text, not just the orb animation.

## 5. Responsive behavior

### 5.1 Breakpoints [site]
| Query | What changes |
|---|---|
| ≥1920 | Container 90 rem, nav container 100 rem |
| ≥1440 | Container 85 rem, nav container 90 rem |
| ≥1280 | Nav layout |
| ≤991 (tablet) | Nav collapses to a hamburger with a panel (bottom radius 48 px). 12-column grid becomes a stacked column. Sticky headings become static. Floating CTA pill disappears. Section padding 7 rem → 4 rem. Article table of contents is hidden. Hub grid 3 → 2 columns. |
| ≤767 | Featured item and filter tabs stack. Hub grid becomes one column. Testimonial cards 100% wide. |
| ≤479 | Type tokens shrink (48→32, 64→48, 36→28). Side padding 1.5 rem. Buttons stack. Cookie card full width. |

### 5.2 Patterns
- **Desktop and mobile are separate DOM trees** for the complex scroll scenes (`.vw-desktop`, `.vw-mobile`). Simpler: build once and let CSS reflow it.
- **Never collapses:** article body size (18 px), 16:9 thumbnails, product videos (they scale).
- **Product UI** is shown in a fixed-ratio frame (about 1.6 : 1); on mobile it scales down as a picture, not as a live layout.
- Hidden horizontal overflow: the page body sets `overflow-x: hidden`, which can mask layout bugs. Test with it off.

## 6. Checklist for any new screen
1. Text contrast ≥ 4.5 : 1 (3 : 1 for 24 px+ and UI edges).
2. Visible focus ring on everything clickable, tab order follows reading order.
3. One `<h1>`, headings in order, landmarks present, language set.
4. Reduced-motion mode tested.
5. Status never by color alone.
6. Icon-only buttons have names; images have meaningful `alt` or `alt=""` if decorative.
7. Works at 390 px wide with no horizontal scroll.
8. Line length 45–75 characters for body text.
