# Blackboard Mocha

A Firefox extension that reskins [Esprit's Blackboard Learn](https://esprit.blackboard.com/)
in [Catppuccin Mocha](https://github.com/catppuccin/catppuccin) and replaces
course card thumbnails with generated placeholders. Runs entirely client-side
in your own browser — it doesn't talk to any server and doesn't touch anyone
else's view of the site.

## Install (temporary, for development/personal use)

1. Open Firefox and go to `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on…**.
3. Select `manifest.json` from this folder.

This lasts until Firefox restarts. To make it permanent, either:
- Package it as a signed `.xpi` via [addons.mozilla.org](https://addons.mozilla.org)
  (can be unlisted/self-distributed), or
- Use `web-ext run` (from the `web-ext` npm package) during development, which
  reloads automatically on file changes.

## What it does

- `mocha.css` — recolors common page elements (headers, nav, cards, buttons,
  links, form fields, alerts) using the Catppuccin Mocha palette. Selectors
  are broad substring/attribute matches (e.g. `[class*="card" i]`) rather
  than exact class names, since this was built without a logged-in session
  to inspect Blackboard's real markup against.
- `content.js` —
  - Injects the same stylesheet into every **open** shadow root it can find
    on the page (a plain content-script stylesheet only reaches the light
    DOM).
  - Finds course cards and replaces their thumbnail `<img>` with a generated
    PNG: a Mocha-colored gradient with the course name drawn on it, plus a
    small "placeholder thumbnail" label.
  - Re-scans on every DOM mutation (debounced), since Blackboard Ultra loads
    course cards asynchronously as an SPA.

## Known limitations

- **Closed shadow DOM.** If any part of Blackboard Ultra's UI uses *closed*
  shadow roots, neither `mocha.css` nor `content.js` can reach inside them —
  this is a hard platform limitation, not a bug here.
- **Selectors are best-effort.** The exact class names in `CARD_SELECTORS`,
  `IMAGE_SELECTORS`, and `TITLE_SELECTORS` at the top of `content.js` were
  guessed from common Blackboard Ultra patterns, not read off the live site.
  If a course card isn't picked up, or the wrong title text is drawn: open
  Firefox DevTools on the real page, inspect a course card, and adjust those
  selector lists.

## Using your own thumbnail images instead of generated ones

Replace the body of `makePlaceholderDataUrl()` in `content.js` with logic
that returns a URL to one of your own bundled images (e.g.
`browser.runtime.getURL('thumbnails/course-1.png')`), or extend it to pick
an image based on the course name/code.
