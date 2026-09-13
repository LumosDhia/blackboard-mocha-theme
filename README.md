# Blackboard Mocha

A Firefox extension for [Esprit's Blackboard Learn](https://esprit.blackboard.com/)
in [Catppuccin Mocha](https://github.com/catppuccin/catppuccin). It does two
different things:

- **The course list is rebuilt, not restyled.** That page is replaced with a
  UI rendered from Blackboard's own REST API — none of Blackboard's markup is
  left on it.
- **Every other page is reskinned**, the usual way: a stylesheet over
  Blackboard's DOM, plus generated placeholder thumbnails.

Runs entirely client-side in your own browser — it doesn't talk to any server
of its own and doesn't touch anyone else's view of the site.

## Install (temporary, for development/personal use)

1. Open Firefox and go to `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on…**.
3. Select `manifest.json` from this folder.

This lasts until Firefox restarts. To make it permanent, either:
- Package it as a signed `.xpi` via [addons.mozilla.org](https://addons.mozilla.org)
  (can be unlisted/self-distributed), or
- Use `web-ext run` (from the `web-ext` npm package) during development, which
  reloads automatically on file changes.

## The course list

`courselist.js` takes over `https://esprit.blackboard.com/ultra/course` and
draws it from JSON instead of from the DOM:

```js
fetch('https://esprit.blackboard.com/learn/api/public/v1/users/me/courses?expand=course&limit=200',
      {credentials: 'include'})
```

Because the script runs on `esprit.blackboard.com`, `credentials: 'include'`
sends the session cookie the browser already has. No developer key, no OAuth
secret, no institution admin approval — the server can't tell these calls
apart from Blackboard's own frontend. The endpoint probe behind this is
written up in `CONTEXT.md`.

Why bother, when a stylesheet already worked: reading JSON sidesteps the
whole class of problems the reskin fights — JSS class suffixes that change
per Blackboard build, AngularJS binding course titles after first paint, the
dark-on-dark contrast audit. The REST shapes are versioned and move far more
slowly than the markup.

What the page gives you: courses grouped by term, a live search box, the
course code and class group as separate chips, and a "consulté il y a…" line
from each membership's `lastAccessed` (which Blackboard's own card grid never
shows). Clicking a course is a real navigation into the real Blackboard UI.

### Navigation rail

`rail.js` puts Blackboard's primary navigation down the left edge, so the
taken-over page still has a way out to Calendrier, Messages, Notes and the
rest. Always visible; below 900px it collapses to an icon-only rail, with the
labels kept in the DOM for screen readers rather than dropped.

It has no background, border or row separators of its own — it sits on the
page background and is held together by spacing and text weight, so the eye
goes to the course grid rather than to a slab of chrome down the side. The
current page is the one accent: bolder label, mauve icon.

Every href was read off the live page rather than inferred from the label —
most are guessable, but **Assist is `/ultra/integration/bbAssist`**, which is
not, and a guess there would have produced a link that silently 404s.

Déconnexion is deliberately absent, matching `content.js`'s existing choice
to hide it (see below). Add an entry to `ITEMS` in `rail.js` if you want it.

### Task drawer

Blackboard's "Tâches à accomplir" panel, rebuilt and docked to the right
edge. It stays off-screen until the cursor reaches the edge, then slides out;
clicking the handle pins it open (for touch and keyboard). The three sections
— En retard / À rendre aujourd'hui / À rendre bientôt — collapse
independently.

The handle carries a bubble with the number of items you have not seen. Seen
ids live in `localStorage['bbm.tasks.seen']`, and an item counts as seen once
the drawer has been *held* open for 600ms, so brushing past the edge on the
way somewhere else doesn't silently clear the badge.

Data is `GET /learn/api/public/v1/calendars/items` over a ±7 day window (the
endpoint refuses spans over 16 weeks). Items with no date at all are dropped.

⚠️ **The field mapping is unverified against real data.** Every course on
this account is new and nothing is due yet, so the endpoint returns an empty
list. The buckets, empty states and badge were exercised with synthetic
items, but `dueDate → endDate → startDate` and `calendarName`-as-course come
from Blackboard's published schema, not from a response. Check them the first
time something is actually due.

**Escape hatch.** The "Blackboard d'origine" button reloads the page with the
takeover off, so the original course list comes back reskinned as before. It
sets `sessionStorage['bbm.bypass'] = '1'` and lasts until the tab is closed.
If the API call fails, the page shows the error plus the same button rather
than leaving you stranded.

Only the course list is taken over. Course interiors, Calendar, Messages,
Grades and login are Blackboard's, and stay that way.

## What it does elsewhere

- `mocha.css` — recolors common page elements (headers, nav, cards, buttons,
  links, form fields, alerts) using the Catppuccin Mocha palette. Selectors
  are broad substring/attribute matches (e.g. `[class*="card" i]`) rather
  than exact class names, since this was built without a logged-in session
  to inspect Blackboard's real markup against.
- `content.js` —
  - Injects the same stylesheet into every **open** shadow root it can find
    on the page (a plain content-script stylesheet only reaches the light
    DOM).
  - Finds course cards and replaces their banner thumbnail with a generated
    PNG: a Mocha-colored gradient with the course name drawn on it. The
    thumbnail is a CSS `background-image` on `div.course-banner`, not an
    `<img>`, so the placeholder is applied by overriding that background.
  - Re-scans on every DOM mutation (debounced), since Blackboard Ultra loads
    course cards asynchronously as an SPA.

## Hiding a term (semester)

Both paths hide Semestre 2 out of the box, and each keeps its own copy of the
rule — `courselist.js` for the rebuilt list, `content.js` for the reskinned
one. Change both, or the two views disagree:

```js
const HIDDEN_TERM_PATTERNS = [/semestre\s*2/i];
```

Each entry is matched case-insensitively against the term header text on the
course list (`.course-card-term-name`). The header and every course card
under it are hidden, down to the next header. Set the array to `[]` to show
everything again, or add another pattern to hide more.

Matching is on the visible label rather than Blackboard's internal term
class (`term-_12_1`), because that id is specific to an account and year
while the label is what you actually see. Note that Blackboard's own
"N résultats" counter above the list is its own and still counts hidden
courses.

## Toolbar

Only relevant when the takeover is off (via the escape hatch) — otherwise
Blackboard's toolbar isn't on the page at all.

Only the search box is kept in the course list's toolbar row. The view
toggle, the "Périodes de cours" and "Filtres" dropdowns, and the per-page
picker are hidden (`hideToolbarExceptSearch` in `content.js`). Delete that
call in `fullScan()` to get them back.

The results count next to it is rewritten to exclude hidden courses, so it
reports what you can actually see rather than Blackboard's own total.

## Sidebar

`hideSidebarLinks` in `content.js` hides the sidebar footer links:
Confidentialité, Conditions générales, Accessibilité — and **Déconnexion**.

Hiding Déconnexion removes the only sign-out control in the UI. Drop
`d[ée]connexion|sign out|log out` from `HIDDEN_SIDEBAR_LINK_RE` to get the
button back; until then, sign out by clearing the site's cookies.

## Known limitations

- **The takeover only applies on a full page load.** Content scripts are
  injected on navigation, not on an SPA route change, so reaching the course
  list by clicking "Cours" in Blackboard's own sidebar from another Ultra page
  gives you Blackboard's list, reskinned the old way. Loading
  `/ultra/course` directly, or reloading, gets the rebuilt one. Fixing this
  means watching for `pushState` and running the takeover on demand.
- **Closed shadow DOM.** If any part of Blackboard Ultra's UI uses *closed*
  shadow roots, neither `mocha.css` nor `content.js` can reach inside them —
  this is a hard platform limitation, not a bug here.
- **Selectors are verified, but only for the course list.** The class names
  in `CARD_SELECTORS`, `BANNER_SELECTORS`, and `TITLE_SELECTORS` at the top
  of `content.js` were read off a live, logged-in `esprit.blackboard.com`
  course list (Ultra, Sept 2026). Other pages — the institution page, course
  interiors, Calendar, Messages, Grades — have not been checked, and neither
  has the course list's list-view toggle. If a card isn't picked up, open
  Firefox DevTools on that page, inspect it, and adjust those lists.
- **Blackboard's own class names will drift.** The stylesheet pins a few
  exact names, but Blackboard Ultra's Material-UI and JSS classes carry
  generated suffixes (`makeStylesbaseText-0-2-191`) that change between
  builds, so `mocha.css` matches stable prefixes rather than full names.
- **Not yet run as a real Firefox add-on against the live site.** It was
  verified by injecting the CSS and script into the live page via browser
  automation; loading it through `about:debugging` on the real site is the
  remaining check.

## Using your own thumbnail images instead of generated ones

Replace the body of `makePlaceholderDataUrl()` in `content.js` with logic
that returns a URL to one of your own bundled images (e.g.
`browser.runtime.getURL('thumbnails/course-1.png')`), or extend it to pick
an image based on the course name/code.
