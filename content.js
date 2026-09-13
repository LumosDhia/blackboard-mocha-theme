// Blackboard Mocha — content script.
//
// Two jobs:
//   1. Push mocha.css into every *open* shadow root on the page (a plain
//      <link>/manifest CSS injection only reaches the light DOM).
//   2. Find course cards on the course list and give each one a generated
//      placeholder banner: a Catppuccin Mocha gradient with the course's
//      name drawn on it.
//
// Selectors below were read off a live, logged-in esprit.blackboard.com
// course list (Ultra, 2026-09), not guessed. Two things about that markup
// drive the implementation:
//
//   * A course card has NO <img>. The thumbnail is a CSS background-image
//     on `.course-banner` (Blackboard's own default banners are served
//     from cloudfront as .../default-banners/natureNN_thumb.jpg). So the
//     placeholder is applied by overriding background-image, not img.src.
//   * No shadow DOM is used on the course list — every card is in the
//     light DOM. The shadow-root walk is kept as a cheap safety net for
//     other Ultra pages that may differ.

(() => {
  // On the course list, courselist.js replaces the page outright with a UI
  // rendered from Blackboard's REST API, so there is no Blackboard markup
  // left here to reskin. boot.js sets this marker at document_start, before
  // either script runs, so the two never fight over the same DOM. Every
  // other page still goes through the reskin below.
  if (document.documentElement.classList.contains('bbm-takeover')) return;

  // article.element-card.course-element-card ... js-course-details
  const CARD_SELECTORS = [
    'article.course-element-card',
    '.course-element-card',
    '.js-course-details',
  ];

  // The banner div whose background-image is the course thumbnail.
  const BANNER_SELECTORS = ['.course-banner'];

  // h4.js-course-title-element, inside a.course-title
  const TITLE_SELECTORS = [
    'h4.js-course-title-element',
    '.js-course-title-element',
    '.course-title',
  ];

  // Course terms to hide from the course list, matched case-insensitively
  // against the `.course-card-term-name` header text. Matching by label
  // rather than by Blackboard's internal term class (`term-_12_1`), since
  // that id is account- and year-specific while the label is what's on
  // screen. Set to [] to show everything.
  const HIDDEN_TERM_PATTERNS = [/semestre\s*2/i];

  const CRUST = '#11111b';

  // Banner box on the real page is ~349x128 CSS px; draw at 2x for HiDPI.
  const BANNER_W = 698;
  const BANNER_H = 256;

  const processedCards = new WeakSet();
  const processedRoots = new WeakSet();
  let cssText = null;

  function wrapText(ctx, text, maxWidth) {
    const words = text.split(/\s+/).filter(Boolean);
    const lines = [];
    let line = '';
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    return lines.slice(0, 3);
  }

  function makePlaceholderDataUrl(label, width = BANNER_W, height = BANNER_H) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    const text = (label || 'Course').trim();
    const [c1, c2] = BBM_PALETTE.pairFor(text);

    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, c1);
    gradient.addColorStop(1, c2);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // Crust scrim behind the text so the title stays legible whichever two
    // accent colors the gradient picked.
    ctx.fillStyle = 'rgba(17, 17, 27, 0.35)';
    ctx.fillRect(0, height * 0.55, width, height * 0.45);

    ctx.fillStyle = CRUST;
    ctx.font = 'bold 38px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const lines = wrapText(ctx, text, width - 60);
    const lineHeight = 46;
    const startY = height - 34 - (lines.length - 1) * lineHeight - 14;
    lines.forEach((line, i) => {
      ctx.fillText(line, width / 2, startY + i * lineHeight);
    });

    return canvas.toDataURL('image/png');
  }

  function findTitle(card) {
    for (const sel of TITLE_SELECTORS) {
      const el = card.querySelector(sel);
      const text = el && el.textContent && el.textContent.trim();
      if (text) return text;
    }
    const aria = card.getAttribute('aria-label');
    if (aria && aria.trim()) return aria.trim();
    return 'Course';
  }

  function findBanner(card) {
    for (const sel of BANNER_SELECTORS) {
      const el = card.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  function applyPlaceholder(card) {
    if (processedCards.has(card)) return;
    // Skip cards in a hidden term. Each placeholder is a canvas
    // toDataURL('image/png') encode, which is not cheap — no point spending
    // one on a card that is display:none. hideTerms() runs first in
    // fullScan(), so the class is already set by the time we get here.
    if (card.closest('.bbm-hidden-term')) return;
    const banner = findBanner(card);
    if (!banner) return;

    const title = findTitle(card);
    // Bail until the SPA has actually rendered the title, otherwise every
    // card gets an identical "Course" placeholder on first paint.
    if (title === 'Course') return;

    banner.style.setProperty('background-image', `url("${makePlaceholderDataUrl(title)}")`, 'important');
    banner.style.setProperty('background-size', 'cover', 'important');
    banner.style.setProperty('background-position', 'center', 'important');
    banner.style.setProperty('background-repeat', 'no-repeat', 'important');
    banner.classList.add('bbm-thumb-placeholder');
    processedCards.add(card);
  }

  // The toolbar row above the course list: view toggle, search box, two
  // filter dropdowns, and a per-page picker. Everything except the search
  // box is hidden. The search field is identified by holding a real text
  // input — MUI's selects carry a hidden `.MuiSelect-nativeInput` that
  // would otherwise look like one — rather than by position, so reordering
  // or a locale change doesn't break it.
  const TOOLBAR_ROW_SELECTOR = '[class*="toolbarRow" i]';
  const SEARCH_FIELD_SELECTOR = 'input[type="text"]:not([class*="MuiSelect-nativeInput" i])';

  function hideToolbarExceptSearch(root) {
    const row = root.querySelector(TOOLBAR_ROW_SELECTOR);
    if (!row) return;
    for (const child of row.children) {
      const isSearch = !!child.querySelector(SEARCH_FIELD_SELECTOR);
      child.classList.toggle('bbm-hidden-control', !isSearch);
    }
  }

  // Sidebar footer links to hide: the legal trio (Confidentialite /
  // Conditions generales / Accessibilite) plus Deconnexion. Matched on link
  // text rather than class — they sit in a MUI list whose JSS suffixes
  // change between builds.
  //
  // NOTE: hiding Deconnexion removes the only sign-out control in the UI.
  // Drop `d[ee]connexion|sign out|log out` from this pattern to get the
  // button back; until then, sign out by clearing the site's cookies.
  const HIDDEN_SIDEBAR_LINK_RE = /^(confidentialit|conditions g[\u00e9e]n|accessibilit|privacy|terms of use|accessibility|d[\u00e9e]connexion|sign out|log out)/i;

  function hideSidebarLinks(root) {
    root.querySelectorAll('a').forEach((link) => {
      const text = link.textContent.trim();
      if (text.length > 40 || !HIDDEN_SIDEBAR_LINK_RE.test(text)) return;
      (link.closest('li') || link).classList.add('bbm-hidden-control');
    });
  }

  // Blackboard's "N resultats" chip. It is React/JSS — a different stack
  // from the AngularJS course list — so it keeps counting the courses we
  // hide. The JSS suffix (chipResultGroup-0-2-131) changes between builds,
  // so match the stable part only.
  const RESULT_COUNT_SELECTOR = '[class*="chipResultGroup" i]';
  // Digits plus the separators a localised number may use. Deliberately no
  // \s — that would swallow the space before "resultats" and render
  // "18resultats".
  const RESULT_NUMBER_RE = /\d+(?:[.,\u00a0\u202f]\d+)*/;

  let resultTotal = null; // Blackboard's own figure, before we touch it
  let resultTemplate = null; // its full string, so the label/locale survives
  let resultWritten = null; // what we last wrote, to spot a React re-render

  function hiddenCardCount() {
    return document.querySelectorAll(
      '.bbm-hidden-term .course-element-card, .bbm-hidden-term.course-element-card'
    ).length;
  }

  function updateResultCount() {
    const el = document.querySelector(RESULT_COUNT_SELECTOR);
    if (!el) return;

    const text = el.textContent;
    // Anything we didn't write is a fresh figure from Blackboard (first
    // paint, or a re-render after a filter change) — re-read the total.
    if (text !== resultWritten) {
      const match = text.match(RESULT_NUMBER_RE);
      if (!match) return;
      resultTotal = parseInt(match[0].replace(/\D/g, ''), 10);
      resultTemplate = text;
    }
    if (resultTotal === null) return;

    const visible = Math.max(0, resultTotal - hiddenCardCount());
    const next = resultTemplate.replace(RESULT_NUMBER_RE, String(visible));
    if (el.textContent !== next) el.textContent = next;
    resultWritten = next;
  }

  // The course list is a flat `.course-org-list`: a `.course-card-term-name`
  // header, then that term's cards as sibling `.default-group` divs, then
  // the next header. So a term is hidden by walking siblings from its header
  // up to the next header.
  function hideTerms(root) {
    root.querySelectorAll('.course-card-term-name').forEach((header) => {
      const label = header.textContent.trim();
      if (!label) return; // AngularJS hasn't bound the label yet
      if (!HIDDEN_TERM_PATTERNS.some((re) => re.test(label))) return;

      header.classList.add('bbm-hidden-term');
      let node = header.nextElementSibling;
      while (node && !node.classList.contains('course-card-term-name')) {
        node.classList.add('bbm-hidden-term');
        node = node.nextElementSibling;
      }
    });
  }

  function scanForCards(root) {
    for (const sel of CARD_SELECTORS) {
      root.querySelectorAll(sel).forEach(applyPlaceholder);
    }
  }

  async function getCssText() {
    if (cssText === null) {
      const url = browser.runtime.getURL('mocha.css');
      cssText = await fetch(url).then((r) => r.text());
    }
    return cssText;
  }

  async function injectIntoShadowRoot(root) {
    if (processedRoots.has(root)) return;
    processedRoots.add(root);
    const style = document.createElement('style');
    style.textContent = await getCssText();
    root.appendChild(style);
  }

  function walkForShadowRoots(node) {
    if (node.shadowRoot) {
      injectIntoShadowRoot(node.shadowRoot);
      scanForCards(node.shadowRoot);
      node.shadowRoot.querySelectorAll('*').forEach(walkForShadowRoots);
    }
    if (node.children) {
      for (const child of node.children) walkForShadowRoots(child);
    }
  }

  // The shadow-root walk recurses over every element on the page. Running it
  // on every mutation pegged the main thread hard enough to freeze the tab:
  // Blackboard's AngularJS mutates the DOM constantly (lazy card binding,
  // scrolling), so a debounce alone doesn't bound the work. The course list
  // has no shadow roots at all — the walk is a safety net for other Ultra
  // pages, so run it once at startup and keep the hot path to querySelectorAll.
  function fullScan() {
    hideTerms(document);
    scanForCards(document);
    hideToolbarExceptSearch(document);
    hideSidebarLinks(document);
    updateResultCount();
  }

  walkForShadowRoots(document.documentElement);
  fullScan();

  // Scope the observer to the course list once it exists. Watching
  // documentElement means every unrelated Angular update on the page wakes
  // the scan; the list container is the only subtree that matters here.
  function observedRoot() {
    return document.querySelector('.course-org-list') || document.documentElement;
  }

  let watched = null;
  const observer = new MutationObserver(() => {
    clearTimeout(observer._debounce);
    observer._debounce = setTimeout(() => {
      fullScan();
      // Angular can replace the list wrapper; re-target if that happened.
      const root = observedRoot();
      if (root !== watched) {
        watched = root;
        observer.disconnect();
        observer.observe(root, { childList: true, subtree: true });
      }
    }, 250);
  });
  watched = observedRoot();
  observer.observe(watched, { childList: true, subtree: true });

  // The toolbar and the count chip are React, live outside
  // `.course-org-list`, and share one container — so the observer above
  // never sees either re-render. Watch that small subtree for both. Our own
  // writes settle: the next fire recomputes the same values and changes
  // nothing.
  (function watchPageChrome() {
    const row = document.querySelector(TOOLBAR_ROW_SELECTOR);
    const chip = document.querySelector(RESULT_COUNT_SELECTOR);
    const host = (row && row.parentElement) || (chip && chip.parentElement);
    if (!host) return;
    const chromeObserver = new MutationObserver(() => {
      clearTimeout(chromeObserver._debounce);
      chromeObserver._debounce = setTimeout(() => {
        hideToolbarExceptSearch(document);
        updateResultCount();
      }, 100);
    });
    chromeObserver.observe(host, { childList: true, subtree: true, characterData: true });
  })();
})();
