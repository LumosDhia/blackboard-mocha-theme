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

After editing any file, press **Reload** next to the add-on on that page —
a temporary add-on does not pick up changes on its own, and the page will
keep running the version you first loaded.

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

The page heading is `おかえり『LumosDhia』` — "welcome back", with the handle
in Japanese corner brackets — mirroring rose-startpage's `ようこそ『Rose』`,
down to the font stack and the mauve. The handle is the `HANDLE` constant in
`courselist.js`. There is no course count and no name line.

`fonts/JetBrainsMonoNLNerdFontMono-Regular.subset.woff2` is copied from that
project. Be aware it is a **subset of 70 codepoints** — Latin, digits and a
few symbols. It carries no Japanese and not even the 『』 brackets, so those
characters come from the generic `monospace` fallback and only the handle
renders in JetBrains Mono. That is not a defect in the subset: JetBrains Mono
has no CJK coverage at all, so rose-startpage resolves them the same way. If
you want the kana in a specific face, add it to the stack ahead of
`monospace` — re-subsetting this file cannot help.

What the page gives you: courses split into four columns by subject. An entry
is the course's full name and nothing else — no
thumbnail, no code chip, no last-accessed line. The name is never truncated;
a long one wraps and the card grows. Clicking a course is a real navigation
into the real Blackboard UI.

The one thing an entry will show besides the name is an "Indisponible" tag,
since otherwise it would be a link that quietly goes nowhere.

Note the displayed name has Esprit's `__4CCE14` class-group suffix stripped
(`BBM.splitGroup` in `shared.js`). Drop that call in `courseCard` if you want
Blackboard's raw name instead.

### The four columns

Esprit encodes the category in the course code — `ESE.CCE-03`, `ESE.SCI-M01`,
`ESE.SH-104` — and nothing in the API exposes it as a field. So the columns
come from the code prefix (`CATEGORIES` in `courselist.js`), which is stable,
rather than from the course name, which is free text and contains at least
one typo of Esprit's own ("Cyber Defense - Systems & Netowrks").

| Column | Prefixes | Courses this semester |
| --- | --- | --- |
| Spécialité | `CCE`, `WIN`, `AC`, `INFRES` | 5 |
| Tronc commun | `SCI-M` | 4 |
| Technique | `BD`, `AS`, `SR`, `MS`, `DS`, `INFDEV`, `INFWEB` | 5 |
| Autres | everything else | 4 |

The last column is the catch-all, so a prefix nobody has seen before lands
somewhere visible instead of disappearing.

The type scale is rose-startpage's: `--bbm-base` is its `--font-size-base`
(25px), the heading is `2em` of it, and group titles and entries inherit it
outright — the startpage sets no font-size on either. That one variable is
the page's scale; turn it down if four columns at 25px wrap too hard.

`body.bbm-takeover-body::after` is the startpage's CRT dot-grid overlay
copied across: 1px dots on a 20px grid at 4% opacity, fixed and
`pointer-events: none`. Its z-index clears this page's own fixed chrome
rather than using the startpage's 9999, so the dots fall over the dock and
the task drawer too.

Spacing follows rose-startpage: columns 1.5em apart, and each group title
carrying the gap beneath it in its own `line-height` (2) rather than in a
margin. That is what makes a title read as the head of its list instead of as
a separate band, so there is no uppercase, no letter-spacing and no rule
under it — weight and the rosewater accent carry it, exactly as
`li:first-child` does on the startpage. Term filtering still applies
first — hiding Semestre 2 is a separate setting, and grouping by subject
doesn't change which semester you want on screen.

Every colour in this UI is set `!important`. `mocha.css` has a generic text
layer — `body h1..h6 { color: lavender !important }`, `body p, body span
{ color: text !important }`, `body a { color: blue !important }` — and an
!important declaration beats a non-important one whatever the specificity, so
without it every heading came out lavender, every entry blue, and the hover
colour never appeared at all. The same applies to `body header` and
`body nav`, which were painting a surface behind the page header and the
dock.

Entries are plain text lines, not cards — the startpage's `li > a`
treatment. No background, no border; hovering slides a mauve `> ` marker in
from the left and nudges the row 4px across, and the whole page is set in the
JetBrains Mono stack rather than just the heading.

The marker sits at `right: 100%` so it hangs in the 1em of indent on the
column body instead of reflowing the text when it appears. One deliberate
departure: course names **wrap**, where the startpage's short link labels are
`white-space: nowrap` — "access control and identity management" in a
quarter-width column has to break somewhere.

`BBM.pairFor` is now used only by `content.js`, for the reskinned pages.

### Navigation rail

`rail.js` puts Blackboard's primary navigation down the left edge as a
vertical dock, so the taken-over page still has a way out to Calendrier,
Messages, Notes and the rest.

Icons only, on the page background with no surface of its own. Each label
appears beside its icon on hover — the label gets a small pill because it
overlays the course columns, where bare text would be unreadable. The current
page is the one accent: a mauve icon.

**Magnification** is macOS-dock style, in `magnifier()`. Rather than scaling
each icon in place — which makes them overlap — the rows are re-stacked at
their magnified heights and each is offset to its new position, so
neighbours are pushed apart the way the real dock pushes them. The row
nearest the cursor is then re-anchored to where it started, or the whole
column visibly slides as the stack grows.

Two knobs at the top of `rail.js`: `MAX_SCALE` (1.75) and `RADIUS` (118px of
influence either side of the cursor); `FALLOFF` above 1 tightens the peak.

Two details worth keeping if you edit it:

- The dock has **56px of top padding purely as headroom**. Magnifying a row
  near the top shifts the rows above it upward by up to half the column's
  total growth — about 36px — and with less padding the first icon is pushed
  off the top of the viewport. The art's `margin-top` is the same idea at the
  other end.
- Scales are computed against each row's **untransformed** `offsetTop`, which
  transforms do not affect. That is what stops the effect oscillating: a
  magnified row moving out from under the cursor cannot feed back into the
  next frame's measurement.

Magnification is skipped outright under `prefers-reduced-motion`.

Every href was read off the live page rather than inferred from the label —
most are guessable, but **Assist is `/ultra/integration/bbAssist`**, which is
not, and a guess there would have produced a link that silently 404s.

Déconnexion is deliberately absent, matching `content.js`'s existing choice
to hide it (see below). Add an entry to `ITEMS` in `rail.js` if you want it.

### Rail artwork

`rail-art.jpg` fills whatever the nav list leaves at the bottom of the rail,
fading into the page background along its top edge. It is decorative only —
`aria-hidden`, not a link, not in the tab order — and it is hidden entirely
on the collapsed icon rail, where 62px is too narrow for it to read as
anything.

The Catppuccin Mocha grade is **baked into the JPEG**, not applied in CSS. A
CSS `filter` on `.bbm-rail-art` would also filter its own `::after` and dim
the top fade along with the picture, and a `mix-blend-mode` tint would need
an extra isolated layer to blend against. Grading the file once is both more
controllable and free at runtime.

To swap in a different picture:

```sh
python3 tools/grade-art.py ~/Pictures/whatever.jpg
```

That resizes to 2× the rail width and maps luminance through a
base → surface1 → mauve → lavender → rosewater ramp, keeping 18% of the
original so warm accents don't flatten out. It autocontrasts first — a dark
source otherwise only ever reaches the bottom of the ramp and comes out
nearly black.

**Provenance:** the bundled image is someone else's artwork (signed "Enzo
Japhet"), found on Pinterest and used here for a personal, unpublished
extension. If this ever gets distributed, replace it with something you have
the rights to.

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

**Reaching the page.** The takeover runs both on a direct load of
`/ultra/course` and on an SPA route change into it — clicking "Cours" in
Blackboard's own sidebar from another Ultra page. The second case needs a
URL poll rather than a `history.pushState` patch: Firefox content scripts run
in an isolated world, so patching `pushState` from `courselist.js` would only
patch our own wrapper and never see Blackboard's own calls.

**Escape hatch.** The "Blackboard d'origine" button reloads the page with the
takeover off, so the original course list comes back reskinned as before. It
sets `sessionStorage['bbm.bypass'] = '1'` and lasts until the tab is closed.
If the API call fails, the page shows the error plus the same button rather
than leaving you stranded.

**And back again.** While the bypass is on, a "Revenir à Mocha" button sits
in the bottom-left of Blackboard's own course list; it clears the flag and
reloads. Without it the bypass is a one-way door — the button that *sets* it
lives on a page that no longer renders, and the flag survives reloads, so
there is nothing on screen to say what happened or how to undo it. Closing
the tab also clears it, since sessionStorage is per-tab.

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
