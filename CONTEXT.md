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

## Term hiding

`content.js` hides whole terms via `HIDDEN_TERM_PATTERNS` (currently
Semestre 2). The course list is a flat `.course-org-list`:

```
div.course-card-term-name        <- "Semestre2"
div.default-group.term-_12_1     <- x11 course cards
div.course-card-term-name        <- "Semestre 1"
div.default-group.term-_11_1     <- x18 course cards
```

so a term is hidden by walking siblings from its header to the next header
and adding `.bbm-hidden-term`. Verified live: 12 elements hidden, 18 cards
left visible.

## Gotcha: AngularJS binds late

The course list is AngularJS (`ng-bind="baseCourses.getCourseName(membership)"`).
Immediately after navigation the cards exist but every `h4.js-course-title-element`
is **empty** — all 29 titles were blank on first paint. `applyPlaceholder`
bails when the title is still empty (otherwise every card gets an identical
"Course" placeholder) and the MutationObserver re-applies once Angular binds.
`hideTerms` does the same for empty term labels.

Cards also bind lazily: only the ~11 on-screen cards had titles at first;
the rest bound while scrolling. Anything testing this needs to wait for
binding, not just for the elements to exist.

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

## The REST API route (verified live, 13 Sept 2026)

The alternative to restyling Blackboard's DOM: stop reading their markup and
read their JSON instead, rendering a UI of our own. Probed against a live
logged-in `esprit.blackboard.com` session to see whether that is even
possible from a student account. **It is.**

### Authentication: just the session cookie

No developer key, no OAuth secret, no institution admin approval. A content
script runs on `esprit.blackboard.com`, so `credentials: 'include'` sends the
existing `JSESSIONID` and the server cannot tell the request apart from the
SPA's own:

```js
fetch('https://esprit.blackboard.com/learn/api/public/v1/users/me',
      {credentials:'include', headers:{Accept:'application/json'}})
```

The official route (register at `developer.blackboard.com`, then have an
Esprit admin enable the application ID against the instance) is closed to a
student and is not worth pursuing.

### Gotcha: use absolute URLs, never relative

The page carries `<base href="https://dmuwut6e40u5o.cloudfront.net/">`, so a
relative `/learn/api/...` in `fetch()` resolves against the **CloudFront CDN**,
goes cross-origin, and fails CORS as a bare `TypeError: Failed to fetch` —
no status, no CORS message. This looks exactly like an auth failure and is
not one. Always write the full `https://esprit.blackboard.com` origin.

### What answers (all 200, cookie only)

| Endpoint | Returns |
| --- | --- |
| `public/v1/users/me` | profile: id, username, student id, roles |
| `public/v1/users/me/courses?expand=course&limit=100` | all 29 courses in one call — name, course code, term id |
| `public/v1/courses/{id}/users` | roster (30 for the course tested) |
| `v1/terms` | terms with real date ranges |
| `v1/users/me?expand=systemRoles,insRoles` | roles, landing page, preferences |
| `public/v1/calendars/items?since=…&until=…` | 200; `since`/`until` may not span more than 16 weeks |

That is already everything the current course-list reskin needs — names,
codes and terms — so the list page can be rebuilt from JSON today.

### What is empty — and why it is *not* a permission wall

`contents`, `announcements` and `gradebook/columns` return `200 {"results":[]}`
for every one of the 10 courses scanned. That reads like a student
restriction. It is not:

- Blackboard's **own** UI shows the same course outline as empty — just the
  nav tabs, no items.
- The private endpoint reports `paging.count: 0` plus a `permissions` block,
  and it is the identical call the Ultra SPA makes.
- Every course was created `2026-09-12`. The semester has not started.

So those endpoints are **unproven, not blocked**, and should fill in as
teachers upload material. Re-probe before building content/grades views.

### Two APIs, not one

`/learn/api/v1/` (private, undocumented) is what the Ultra SPA itself calls,
and it is richer than `/learn/api/public/v1/` — it returns a `permissions`
object and `paging.count` alongside `results`. Same cookie, no extra work.
Prefer public v1 where it suffices, drop to private v1 where it does not.

Endpoints the course page itself hits, for reference:

```
/learn/api/v1/courses/{id}?expand=instructorsMembership,+effectiveAvailability
/learn/api/v1/courses/{id}/contents?expand=children
/learn/api/v1/courses/{id}/gradebook/columns
/learn/api/v1/courses/{id}/tools
/learn/api/v1/courses/{id}/announcements/counts
/learn/api/v1/courses/{id}/gradebook/unreadGradesCount
/learn/api/v1/terms
```

### Untested

- `v1/streams/ultra` (the activity stream) returns 405 on GET — it is a POST
  endpoint. Read-only in effect, but not exercised.
- Anything requiring a write. The whole idea stays read-only; submissions,
  quizzes, the rich editor and login/SSO should hand off to real Blackboard
  via an escape hatch that turns the takeover off.

### Why this beats the current approach

Everything in the sections above about JSS suffixes (`makeStylesbaseText-0-2-191`),
the shadow-root walk, AngularJS binding titles late, and the dark-on-dark
contrast audit is the tax on styling someone else's DOM. Rendering from JSON
removes that category entirely — Blackboard's REST shapes are versioned and
far more stable than its CSS.

## Repo / account notes

- GitHub: `LumosDhia/blackboard-mocha-theme`, pushed to `main`.
- Lives under `~/Github/LumosDhia/blackboard-mocha-theme` — gh/git are
  scoped to the `LumosDhia` account automatically for anything under
  `~/Github/LumosDhia/` (see that folder's own CLAUDE.md: 5-word max commit
  subjects, never open a PR, commit straight to `main`).
