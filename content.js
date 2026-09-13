// Blackboard Mocha — content script.
//
// Two jobs:
//   1. Push mocha.css into every *open* shadow root on the page (a plain
//      <link>/manifest CSS injection only reaches the light DOM; Blackboard
//      Ultra's custom elements may use shadow DOM, open or closed — closed
//      roots are simply unreachable from a content script, no way around it).
//   2. Find course cards on the dashboard/course-list and replace their
//      thumbnail image with a generated placeholder: a Catppuccin Mocha
//      gradient with the course's name drawn on it.
//
// Blackboard's exact markup wasn't inspected against a live logged-in
// session, so every selector below is a broad, case-insensitive substring
// match rather than an exact class name. If a real course card isn't
// picked up, inspect it in Firefox DevTools and add/adjust a selector in
// CARD_SELECTORS or IMAGE_SELECTORS below.

(() => {
  const CARD_SELECTORS = [
    '[class*="course-card" i]',
    '[class*="coursecard" i]',
    '[data-testid*="course-card" i]',
    '[data-testid*="course_card" i]',
    '[class*="course-list" i] li',
    '[class*="course-tile" i]',
  ];

  const IMAGE_SELECTORS = [
    'img[class*="thumbnail" i]',
    'img[class*="banner" i]',
    'img[class*="cover" i]',
    'img',
  ];

  const TITLE_SELECTORS = [
    '[class*="title" i]',
    '[class*="name" i]',
    'h1',
    'h2',
    'h3',
    'h4',
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
  const TEXT = '#cdd6f4';

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

  function makePlaceholderDataUrl(label, width = 480, height = 270) {
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

    // Subtle base/crust panel behind the text for contrast, regardless of
    // which two accent colors the gradient picked.
    ctx.fillStyle = 'rgba(17, 17, 27, 0.35)';
    ctx.fillRect(0, height * 0.62, width, height * 0.38);

    ctx.fillStyle = CRUST;
    ctx.font = 'bold 28px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const lines = wrapText(ctx, text, width - 40);
    const lineHeight = 34;
    const startY = height - 24 - (lines.length - 1) * lineHeight - 12;
    lines.forEach((line, i) => {
      ctx.fillText(line, width / 2, startY + i * lineHeight);
    });

    ctx.fillStyle = TEXT;
    ctx.font = '600 14px "Segoe UI", sans-serif';
    ctx.fillText('placeholder thumbnail', width / 2, 22);

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
    const text = card.textContent && card.textContent.trim();
    return text ? text.slice(0, 60) : 'Course';
  }

  function findImage(card) {
    for (const sel of IMAGE_SELECTORS) {
      const img = card.querySelector(sel);
      if (img) return img;
    }
    return null;
  }

  function applyPlaceholder(card) {
    if (processedCards.has(card)) return;
    const img = findImage(card);
    if (!img) return;

    const title = findTitle(card);
    img.src = makePlaceholderDataUrl(title);
    img.srcset = '';
    img.classList.add('bbm-thumb-placeholder');
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
