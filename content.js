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

  const MOCHA_PAIRS = [
    ['#f38ba8', '#eba0ac'], // red -> maroon
    ['#fab387', '#f9e2af'], // peach -> yellow
    ['#a6e3a1', '#94e2d5'], // green -> teal
    ['#89dceb', '#74c7ec'], // sky -> sapphire
    ['#89b4fa', '#b4befe'], // blue -> lavender
    ['#cba6f7', '#f5c2e7'], // mauve -> pink
    ['#f2cdcd', '#f5e0dc'], // flamingo -> rosewater
  ];

  const CRUST = '#11111b';

  // Banner box on the real page is ~349x128 CSS px; draw at 2x for HiDPI.
  const BANNER_W = 698;
  const BANNER_H = 256;

  const processedCards = new WeakSet();
  const processedRoots = new WeakSet();
  let cssText = null;

  function hashString(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = (h << 5) - h + str.charCodeAt(i);
      h |= 0;
    }
    return Math.abs(h);
  }

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
    const [c1, c2] = MOCHA_PAIRS[hashString(text) % MOCHA_PAIRS.length];

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

  function fullScan() {
    scanForCards(document);
    walkForShadowRoots(document.documentElement);
  }

  fullScan();

  const observer = new MutationObserver(() => {
    clearTimeout(observer._debounce);
    observer._debounce = setTimeout(fullScan, 250);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
