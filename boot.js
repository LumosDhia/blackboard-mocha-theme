// Runs at document_start on the course list, before Blackboard paints.
//
// Its only job is to decide whether courselist.js is going to take the page
// over and, if so, hide Blackboard's own UI immediately — otherwise the real
// course list flashes up for a moment before being replaced. The decision has
// to happen here rather than in courselist.js, because by the time a
// document_idle script runs the SPA has already drawn.
//
// Two classes are set on <html>:
//   .bbm-takeover — a marker. content.js reads it and skips its DOM-reskin
//                   work, so the two scripts never fight over the same page.
//   .bbm-booting  — hides the page. courselist.js removes it once it has
//                   rendered (or failed and drawn its own error screen).
//
// The failsafe below matters: if courselist.js throws before it can clear
// .bbm-booting, without it the tab would sit permanently blank.

(() => {
  const BYPASS_KEY = 'bbm.bypass';
  const COURSE_LIST_RE = /^\/ultra\/course\/?$/;

  function bypassed() {
    try {
      return sessionStorage.getItem(BYPASS_KEY) === '1';
    } catch (e) {
      // Private mode / blocked storage: treat as "not bypassed" rather than
      // letting a storage exception disable the extension.
      return false;
    }
  }

  if (!COURSE_LIST_RE.test(location.pathname) || bypassed()) return;

  function mark() {
    const root = document.documentElement;
    root.classList.add('bbm-takeover', 'bbm-booting');

    // courselist.css arrives at document_idle, far too late to hide the
    // first paint, so the hiding rule is inlined here. visibility rather
    // than display so Blackboard's own layout still settles underneath.
    const style = document.createElement('style');
    style.id = 'bbm-boot-style';
    style.textContent = 'html.bbm-booting body { visibility: hidden !important; }';
    root.appendChild(style);

    setTimeout(() => root.classList.remove('bbm-booting'), 8000);
  }

  // Firefox runs document_start content scripts *before* the parser has
  // created <html>, so document.documentElement is frequently null right
  // here — and reading .classList off null throws, killing this script
  // silently. When that happens no marker is ever set, courselist.js bails,
  // and the page falls back to the plain reskin with no visible error.
  // Chrome usually has documentElement by now, which is exactly why this
  // survived testing there.
  if (document.documentElement) {
    mark();
  } else {
    const waiting = new MutationObserver(() => {
      if (!document.documentElement) return;
      waiting.disconnect();
      mark();
    });
    waiting.observe(document, { childList: true });
  }
})();
