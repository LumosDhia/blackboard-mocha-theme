// Blackboard Mocha — shared page chrome.
//
// The dock and the task drawer belong on every Ultra page, not only on the
// rebuilt course list. This file is what puts them there, and what gets
// Blackboard's own navigation out of the way so the two do not sit side by
// side saying the same thing.
//
// Ownership, so the two paths never fight:
//   * On the course list, courselist.js wipes <body> and then calls
//     BBM_CHROME.ensure() itself — anything appended before that wipe would
//     be destroyed by it.
//   * On every other Ultra page, this file calls ensure() directly and also
//     hides the native sidebar.
// ensure() is idempotent, so it does not matter if both fire.

var BBM_CHROME = (() => {
  const ULTRA_RE = /^\/ultra\//;
  const COURSE_LIST_RE = /^\/ultra\/course\/?$/;

  // Paths that identify Blackboard's own primary nav. Matching on the hrefs
  // rather than on a class name is deliberate: the sidebar's classes are
  // Material-UI/JSS with build-varying suffixes
  // ("makeStylesroot-0-2-25", "muiltr-1midy4y"), exactly the kind of name
  // CONTEXT.md records as having already broken once. An href is stable.
  const NAV_HREFS = [
    '/ultra/institution-page',
    '/ultra/stream',
    '/ultra/course',
    '/ultra/calendar',
  ];

  let attached = null;

  function ensure() {
    if (attached) return attached;
    if (typeof BBM_RAIL === 'undefined' || typeof BBM_TASKS === 'undefined') return null;
    const rail = BBM_RAIL.attach();
    BBM_TASKS.attach(rail.tasks);
    attached = rail;
    return rail;
  }

  // Blackboard's sidebar is <base-side-menu> — a custom element, so the tag
  // itself is the selector and there is no JSS suffix to rot. The ancestor
  // walk is the fallback for a build that ever drops that element: it climbs
  // from the real nav links to the first element containing all of them.
  function findNativeNav() {
    const links = NAV_HREFS
      .map((path) => document.querySelector(`a[href$="${path}"]`))
      .filter(Boolean);
    if (links.length < 2) return null;

    const menu = links[0].closest('base-side-menu');
    if (menu) return menu;

    let node = links[0];
    while (node && node !== document.body) {
      if (links.every((link) => node.contains(link))) return node;
      node = node.parentElement;
    }
    return null;
  }

  // Hiding the sidebar is only half of it: Blackboard offsets the page by
  // the sidebar's width, and that offset has to go too, or content ends up
  // pushed right by both it and the dock.
  //
  // The offset element is found by measuring, not by naming a class: walk up
  // from the page's content section and take the first ancestor whose
  // padding-left equals the sidebar's own width. Across
  // course/calendar/stream/grades/messages/institution-page/tools that is
  // always exactly one element (div.hide-in-background).
  //
  // The walk matters. Scanning the whole document for that padding instead
  // looked equivalent and was not: on /ultra/stream it also matched twenty
  // `div.stream-item-contents`, which merely happen to be padded 200px, and
  // flattening those would have wrecked the activity feed. Ancestors of the
  // content are on the offset path; its descendants never are.
  const CONTENT_ANCHORS = [
    '[class*="route-view-container" i]',
    '[class*="skip-link-target" i]',
    'main, [role="main"]',
  ];

  function unoffset(nav) {
    const width = Math.round(nav.getBoundingClientRect().width);
    if (!width) return null;

    let anchor = null;
    for (const selector of CONTENT_ANCHORS) {
      anchor = document.querySelector(selector);
      if (anchor) break;
    }
    if (!anchor) return null;

    for (let node = anchor; node && node !== document.body; node = node.parentElement) {
      if (Math.round(parseFloat(getComputedStyle(node).paddingLeft) || 0) === width) {
        node.classList.add('bbm-unoffset');
        return node;
      }
    }
    return null;
  }

  function hideNativeNav() {
    const nav = findNativeNav();
    if (!nav) {
      console.warn('[bbm] native nav not found; leaving it in place');
      return false;
    }
    unoffset(nav);
    nav.classList.add('bbm-native-nav');
    return true;
  }

  function applied() {
    return !!document.querySelector('.bbm-native-nav');
  }

  function apply() {
    ensure();
    if (!hideNativeNav()) return false;
    document.body.classList.add('bbm-railed');
    return true;
  }

  function start() {
    if (!ULTRA_RE.test(location.pathname)) return;
    // The course list is courselist.js's page; it wipes <body> and calls
    // ensure() on the other side of that.
    if (COURSE_LIST_RE.test(location.pathname)) return;

    if (apply()) return;

    // Blackboard's sidebar is React-rendered, so at document_idle it often
    // does not exist yet and the first apply() finds nothing. Watch for it
    // instead of giving up — this is the normal path, not the exception.
    const waiting = new MutationObserver(() => {
      if (apply()) waiting.disconnect();
    });
    waiting.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => waiting.disconnect(), 20000);
  }

  // Ultra is a single-page app: routing to another page rebuilds the content
  // container, which drops the .bbm-unoffset tag with it, and can re-mount
  // the sidebar. Re-apply whenever the marks go missing. Cheap — a single
  // querySelector per tick, and apply() no-ops once the marks are back.
  function watch() {
    setInterval(() => {
      if (!ULTRA_RE.test(location.pathname)) return;
      if (COURSE_LIST_RE.test(location.pathname)) return;
      if (applied() && document.querySelector('.bbm-unoffset')) return;
      apply();
    }, 600);
  }

  start();
  watch();

  return { ensure, hideNativeNav, findNativeNav };
})();
