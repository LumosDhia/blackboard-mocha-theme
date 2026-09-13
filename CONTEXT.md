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
  Manifest V3 Firefox extension. Loadable now via
  `about:debugging#/runtime/this-firefox` → Load Temporary Add-on →
  `manifest.json`.
- `mocha.css` recolors common elements (headers, nav, cards, buttons, links,
  forms, alerts) using broad `[class*="..." i]` substring selectors.
- `content.js` finds course cards, draws a placeholder thumbnail per card
  (Mocha gradient + course name text, via `<canvas>` → data URL), and
  injects `mocha.css` into any *open* shadow roots it finds. Re-scans on
  DOM mutation (debounced) since Blackboard Ultra is an SPA.

## The one open problem

All the selectors in `content.js` (`CARD_SELECTORS`, `IMAGE_SELECTORS`,
`TITLE_SELECTORS`) are **best-effort guesses** — built without ever seeing
the real, logged-in Blackboard Ultra markup. They may not match the actual
course cards on `esprit.blackboard.com`.

**To fix this**, we need the real class names. The plan (in progress):

1. Log into `esprit.blackboard.com`, go to the course list.
2. Open DevTools console (`F12`), paste this snippet (only extracts tag
   names + CSS classes — no course names/personal data):

   ```js
   (function () {
     const seen = new Set();
     const out = [];
     document.querySelectorAll('img').forEach((img) => {
       const card = img.closest('li, article, [class*="card" i], [class*="tile" i], div');
       if (!card || seen.has(card)) return;
       seen.add(card);
       const title = card.querySelector('h1,h2,h3,h4,[class*="title" i],[class*="name" i]');
       out.push({
         cardTag: card.tagName,
         cardClass: card.className,
         imgTag: img.tagName,
         imgClass: img.className,
         titleTag: title ? title.tagName : null,
         titleClass: title ? title.className : null,
       });
     });
     console.log(JSON.stringify(out.slice(0, 8), null, 2));
   })();
   ```

3. Give the printed JSON to Claude. It gets used only to hand-edit the
   selector arrays at the top of `content.js` — the raw JSON itself is
   never saved as a file or committed.

## Dead end already ruled out (this machine)

Tried using the "Claude in Chrome" extension (in Brave) to have Claude
inspect the live page directly instead of the manual console-snippet route.
Installed + enabled the extension, ran `/chrome` several times including
after a full Claude Code restart — no browser-automation tools ever became
available. Checked the Windows registry
(`HKCU\Software\{BraveSoftware\Brave-Browser,Google\Chrome}\NativeMessagingHosts`)
and found no Anthropic/Claude entry was ever registered.

This machine is **Windows on ARM64** (reports AMD64 for app compatibility,
but the actual CPU/OS is ARM64) — likely cause is the native-messaging-host
connector binary not being shipped for ARM64 Windows (unconfirmed/
undocumented, flagged as feedback). **Worth retrying on an x64 machine** —
it may just work there. If it does, that's a faster path to fixing the
selectors than the manual console-snippet route above.

## Repo / account notes

- GitHub: `LumosDhia/blackboard-mocha-theme`, pushed to `main`.
- On the original machine, this lives under
  `~/Github/LumosDhia/blackboard-mocha-theme` — gh/git are scoped to the
  `LumosDhia` GitHub account automatically for anything under
  `~/Github/LumosDhia/` (see that folder's own CLAUDE.md for the account
  rules: 5-word max commit subjects, never open a PR, commit straight to
  `main`).
