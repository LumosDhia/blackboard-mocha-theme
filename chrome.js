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

  // Walks up from the real nav links to whatever element contains all of
  // them, and hides that. Derived from the live DOM each time rather than
  // pinned to a selector, so it survives Blackboard reshuffling its markup —
  // and returns null rather than hiding something wrong when it cannot find
  // a container it is confident about.
  function findNativeNav() {
    const links = NAV_HREFS
      .map((path) => document.querySelector(`a[href$="${path}"]`))
      .filter(Boolean);
    if (links.length < 2) return null;

    let node = links[0];
    while (node && node !== document.body) {
      if (links.every((link) => node.contains(link))) {
        // First ancestor holding them all. One level further up would start
        // swallowing page content, so stop here.
        return node;
      }
      node = node.parentElement;
    }
    return null;
  }

  function hideNativeNav() {
    const nav = findNativeNav();
    if (!nav) {
      console.warn('[bbm] native nav not found; leaving it in place');
      return false;
    }
    nav.classList.add('bbm-native-nav');
    return true;
  }

  function start() {
    if (!ULTRA_RE.test(location.pathname)) return;
    // The course list is courselist.js's page; it wipes <body> and calls
    // ensure() on the other side of that.
    if (COURSE_LIST_RE.test(location.pathname)) return;

    ensure();
    if (hideNativeNav()) document.body.classList.add('bbm-railed');
  }

  start();

  return { ensure, hideNativeNav, findNativeNav };
})();
