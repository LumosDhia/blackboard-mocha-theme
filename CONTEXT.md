# Context / where this is at

Working notes so this can be picked up from any machine. Not needed to just
*use* the extension — see README.md for that. This is for continuing the
build with Claude.

## Goal

A Firefox extension that reskins Esprit's Blackboard Learn
(`https://esprit.blackboard.com/`) in Catppuccin Mocha, and replaces course
card thumbnails with generated placeholders (course name drawn on a
Mocha-gradient canvas image).

## What's done

- `manifest.json`, `mocha.css`, `content.js`, `README.md` — a working
  Manifest V3 Firefox extension. Loadable via
  `about:debugging#/runtime/this-firefox` → Load Temporary Add-on →
  `manifest.json`.
- **Selectors are now real.** They were verified against a live, logged-in
  `esprit.blackboard.com` course list (Ultra, Sept 2026) — see below.
- `mocha.css` recolors via broad `[class*="..." i]` selectors, plus a
  pinned section for the exact Blackboard/Material-UI/JSS class names that
  the broad rules missed.
- `content.js` gives each course card a generated Mocha placeholder banner,
  re-scanning on DOM mutation (debounced) since Ultra is an SPA.

## The open problem — SOLVED

The old note here said every selector was a best-effort guess made without
ever seeing the real logged-in markup. They have now been read off the live
page, and two of the guesses were flat wrong:

1. **A course card contains no `<img>` at all.** The thumbnail is a CSS
   `background-image` on `div.course-banner` (Blackboard's defaults come
   from `cloudfront.../default-banners/natureNN_thumb.jpg`). The old
   `content.js` looked for an `<img>` and set `img.src`, so on the real site
   it silently did nothing. Placeholders are now applied by overriding
   `background-image` on the banner div.
2. **No shadow DOM on the course list.** Every card is light DOM
   (`shadowHosts === 0`). The shadow-root walk is kept only as a safety net
   for other Ultra pages.

The real structure:

```
article.element-card.course-element-card.js-course-details.course-color-N
├── div.course-banner              <- background-image = thumbnail
│   ├── div.image-div
│   └── div.guidance-overflow-wrapper
└── div.element-details.summary
    ├── div.small-12
    ├── a.course-title.ellipsis
    │   └── h4.js-course-title-element     <- course name
    ├── div.multi-column-course-id
    └── div.course-status
```

Contrast bugs found and fixed while verifying (audited by scanning every
visible element for text luminance < 110 against the dark background):

- `bdi.makeStylesbaseText-0-2-191` ×20 — JSS, hardcoded `rgb(38,38,38)`.
  `bdi` was not in the stylesheet's text-element list. The numeric suffix
  changes between Blackboard builds, so `mocha.css` matches the stable
  `[class*="makeStyles" i]` prefix instead.
- `div.MuiSelect-select.MuiInputBase-input` ×2 — Material-UI renders selects
  as `<div>`, so `body select { }` never reached them.

After those rules the audit reports **0** dark-on-dark elements.

## Dead end — no longer a dead end

The earlier attempt to use the "Claude in Chrome" extension to inspect the
live page failed on the original machine (Windows on ARM64): the tools never
became available, and no native-messaging host was ever registered. That was
flagged as likely an ARM64 Windows packaging gap.

**Retried on a Linux x86_64 machine with Brave 153 — it works.** Confirmed
via `navigator.brave.isBrave === true` and UA-CH brands reporting
`Brave 153 / Chromium 153`. That is how the selectors above were recovered,
so the manual DevTools-console-snippet route in the old notes is no longer
needed. If picking this up on the Windows ARM64 machine again, expect the
old failure and use a Linux/x64 box instead.

## Still untested

- The extension has only been verified by injecting its CSS/JS into a live
  page through browser automation, i.e. in a Chromium browser. It has not
  been loaded as an actual Firefox temporary add-on against the live site.
  `content.js` uses `browser.runtime.getURL`, which is Firefox-correct but
  was stubbed out during that verification.
- Only the course-list page (`/ultra/course`) was inspected. The
  institution page, course interiors, Calendar, Messages and Grades are
  unverified.
- List view (the list/grid toggle at the top left of the course list) was
  not checked — it may not render `.course-banner` at all.

## Repo / account notes

- GitHub: `LumosDhia/blackboard-mocha-theme`, pushed to `main`.
- Lives under `~/Github/LumosDhia/blackboard-mocha-theme` — gh/git are
  scoped to the `LumosDhia` account automatically for anything under
  `~/Github/LumosDhia/` (see that folder's own CLAUDE.md: 5-word max commit
  subjects, never open a PR, commit straight to `main`).
