// Blackboard Mocha — course list, rendered from Blackboard's REST API
// instead of from its DOM.
//
// This replaces the course list page outright rather than restyling it. The
// reasoning, and the endpoint probe this is built on, are in CONTEXT.md
// ("The REST API route"). The short version:
//
//   * Running on esprit.blackboard.com means `credentials: 'include'` sends
//     the session cookie the browser already has. No developer key, no OAuth
//     secret, no institution admin approval — the server cannot tell these
//     calls apart from the SPA's own.
//   * Reading JSON sidesteps every fragility the DOM reskin fights: JSS class
//     suffixes that change per build, AngularJS binding titles after first
//     paint, the contrast audit. Blackboard's REST shapes are versioned and
//     move far more slowly than its CSS.
//
// Field names below were read off live responses, not guessed.
//
// Scope is deliberately the course list and nothing else. Every other page —
// course interiors, Messages, Grades, login — is left to Blackboard and its
// reskin. Clicking a course does a real navigation into the real UI.

(() => {
  const ORIGIN = 'https://esprit.blackboard.com';
  const BYPASS_KEY = 'bbm.bypass';
  const COURSE_LIST_RE = /^\/ultra\/course\/?$/;

  // The handle set inside the Japanese corner brackets of the heading,
  // mirroring rose-startpage's `ようこそ『Rose』`.
  const HANDLE = 'LumosDhia';

  // Same rule as content.js's HIDDEN_TERM_PATTERNS, matched against the term
  // name from /learn/api/v1/terms. Note the live data spells it "Semestre2"
  // with no space, which is why \s* is not \s+. Set to [] to show everything.
  const HIDDEN_TERM_PATTERNS = [/semestre\s*2/i];

  // Esprit encodes the category in the course code, not anywhere the API
  // exposes as a field — `ESE.CCE-03`, `ESE.SCI-M01`, `ESE.SH-104`. So the
  // four columns are derived from the code prefix, which is stable, rather
  // than from the course name, which is free text (and contains at least one
  // typo: "Cyber Defense - Systems & Netowrks").
  //
  // Order here is the column order. Anything whose prefix matches nothing
  // falls into the last column, so a new prefix shows up somewhere visible
  // instead of vanishing.
  const CATEGORIES = [
    { key: 'specialty', label: 'Spécialité', test: /^ESE\.(CCE|WIN|AC|INFRES)/i },
    { key: 'core', label: 'Tronc commun', test: /^ESE\.SCI-M/i },
    { key: 'technical', label: 'Technique', test: /^ESE\.(BD|AS|SR|MS|DS|INFDEV|INFWEB)/i },
    { key: 'other', label: 'Autres', test: null },
  ];

  function categoryOf(code) {
    const hit = CATEGORIES.find((c) => c.test && c.test.test(code));
    return (hit || CATEGORIES[CATEGORIES.length - 1]).key;
  }

  function bypassed() {
    try {
      return sessionStorage.getItem(BYPASS_KEY) === '1';
    } catch (e) {
      return false;
    }
  }

  function shouldRun() {
    return COURSE_LIST_RE.test(location.pathname) && !bypassed();
  }

  // ---------------------------------------------------------------- helpers

  function el(tag, props, ...children) {
    const node = document.createElement(tag);
    if (props) {
      for (const [k, v] of Object.entries(props)) {
        if (v === null || v === undefined) continue;
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k === 'style') node.setAttribute('style', v);
        else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
        else node.setAttribute(k, v);
      }
    }
    for (const child of children) {
      if (child === null || child === undefined || child === false) continue;
      node.append(child);
    }
    return node;
  }

  async function api(path) {
    // Absolute URL, always. The page carries
    // <base href="https://dmuwut6e40u5o.cloudfront.net/">, so a relative
    // "/learn/api/..." resolves to the CDN, goes cross-origin and dies as a
    // bare "TypeError: Failed to fetch" with no status — which looks exactly
    // like an auth failure and is not one.
    const res = await fetch(ORIGIN + path, {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
    return res.json();
  }

  // The bypass was one-way: it hid the only control that could undo it, and
  // sessionStorage survives reloads, so the page stayed on Blackboard's own
  // UI with nothing on screen explaining why or how to get back. This puts a
  // way back on the original page.
  function offerReturn() {
    if (document.querySelector('.bbm-restore')) return;
    document.body.append(
      el('button', {
        class: 'bbm-restore',
        type: 'button',
        text: 'Revenir à Mocha',
        title: "Réactiver la liste de cours Mocha sur cette page",
        onclick: () => {
          try {
            sessionStorage.removeItem(BYPASS_KEY);
          } catch (e) {
            /* storage blocked — the reload below still clears it for this
               load, since `bypassed()` will read null. */
          }
          location.reload();
        },
      })
    );
  }

  // Bundled with the extension, so it needs an extension URL rather than a
  // page-relative one — and the file is declared in web_accessible_resources
  // for the page to be allowed to load it at all.
  function artwork() {
    let src;
    try {
      src = browser.runtime.getURL('rail-art.jpg');
    } catch (e) {
      return null; // not running as an extension (a bare page test)
    }
    return el('img', {
      class: 'bbm-art',
      src,
      alt: '',
      'aria-hidden': 'true',
      loading: 'lazy',
    });
  }

  // 1-4 jump to a column, matching the [n] hints on the titles. Focus lands
  // on the column's first course so Enter opens it and Tab carries on from
  // there, rather than merely scrolling.
  function bindShortcuts(sections) {
    document.addEventListener('keydown', (event) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const target = event.target;
      if (target && (target.isContentEditable ||
          /^(input|textarea|select)$/i.test(target.tagName || ''))) {
        return;
      }
      const index = Number(event.key) - 1;
      if (!Number.isInteger(index) || index < 0 || index >= sections.length) return;

      const first = sections[index].querySelector('.bbm-course');
      if (!first) return;
      event.preventDefault();
      first.focus();
      first.scrollIntoView({ block: 'nearest' });
    });
  }

  function bypassToOriginal() {
    try {
      sessionStorage.setItem(BYPASS_KEY, '1');
    } catch (e) {
      /* storage blocked — the reload below still drops the takeover for
         this load, it just won't persist across the next navigation. */
    }
    location.reload();
  }

  function finishBoot() {
    document.documentElement.classList.remove('bbm-booting');
    const style = document.getElementById('bbm-boot-style');
    if (style) style.remove();
  }

  // ------------------------------------------------------------------- data

  async function load() {
    // users/me is not fetched: it was only ever read for the greeting line,
    // which the heading above has replaced.
    const [memberships, terms] = await Promise.all([
      // expand=course folds the whole course record into each membership, so
      // the entire list is one request rather than 1 + N.
      api('/learn/api/public/v1/users/me/courses?expand=course&limit=200'),
      api('/learn/api/v1/terms'),
    ]);

    const termById = new Map();
    for (const term of terms.results || []) termById.set(term.id, term);

    const courses = (memberships.results || [])
      .filter((m) => m.course && m.course.name)
      .map((m) => {
        const name = BBM.splitGroup(m.course.name);
        const code = BBM.splitGroup(m.course.courseId);
        return {
          id: m.course.id,
          title: name.label,
          code: code.label,
          termId: m.course.termId,
          role: m.courseRoleId,
          available: !m.course.availability || m.course.availability.available === 'Yes',
          // Blackboard hands us the canonical deep link; no need to build one.
          url: m.course.externalAccessUrl || `${ORIGIN}/ultra/courses/${m.course.id}/outline`,
        };
      });

    return { courses, termById };
  }

  // Courses still drop out by term first — hiding Semestre 2 is a separate,
  // deliberate setting (HIDDEN_TERM_PATTERNS) and grouping by subject does
  // not change what you want to see this semester.
  function groupByCategory(courses, termById) {
    const visible = courses.filter((course) => {
      const term = termById.get(course.termId);
      const name = (term && term.name) || '';
      return !HIDDEN_TERM_PATTERNS.some((re) => re.test(name));
    });

    return CATEGORIES.map((category) => ({
      ...category,
      courses: visible
        .filter((course) => categoryOf(course.code) === category.key)
        .sort((a, b) => a.title.localeCompare(b.title, 'fr')),
    }));
  }

  // ------------------------------------------------------------------ views

  // Name only. No banner, no code chip, no last-accessed line — the column
  // heading already says what kind of course this is, and anything else in
  // the card was competing with the one thing you actually read.
  //
  function courseCard(course) {
    return el(
      'a',
      {
        class: 'bbm-course',
        href: course.url,
        title: course.available ? null : 'Cours indisponible',
      },
      el('h3', { class: 'bbm-course-name', text: course.title }),
      // The one exception: an unavailable course still has to say so, or the
      // card is a link that quietly goes nowhere useful.
      !course.available && el('span', { class: 'bbm-chip-warn', text: 'Indisponible' })
    );
  }

  function render({ courses, termById }) {
    const columns = groupByCategory(courses, termById);

    // One column per category. A column with nothing in it still renders its
    // heading, so the four stay aligned instead of reflowing when a category
    // happens to be empty this semester.
    const sections = columns.map((column, i) =>
      el(
        'section',
        { class: 'bbm-col' },
        // data-shortcut renders as a dimmed "[1]" after the title, the way
        // rose-startpage marks its categories — and, as there, the number is
        // live: see bindShortcuts below.
        el('h2', {
          class: 'bbm-col-name',
          'data-shortcut': String(i + 1),
          text: column.label,
        }),
        el('div', { class: 'bbm-col-body' }, ...column.courses.map(courseCard))
      )
    );

    const board = el('div', { class: 'bbm-columns' }, ...sections);

    // The picture sits beside the columns, as it does on the startpage —
    // a flex sibling of the list rather than part of it.
    const stage = el('div', { class: 'bbm-stage' }, board, artwork());

    bindShortcuts(sections);

    const app = el(
      'div',
      { class: 'bbm-app' },
      el(
        'header',
        { class: 'bbm-top' },
        el(
          'div',
          { class: 'bbm-top-left' },
          // おかえり — "welcome back". 『』 are Japanese corner brackets, the
          // conventional quoting marks around a name; they are single
          // characters, not two angle brackets.
          el('h1', { class: 'bbm-hello', lang: 'ja', text: `おかえり『${HANDLE}』` })
        ),
        el(
          'div',
          { class: 'bbm-top-right' },
          el('button', {
            class: 'bbm-escape',
            type: 'button',
            title: "Recharger la page avec l'interface Blackboard d'origine",
            text: "Blackboard d'origine",
            onclick: bypassToOriginal,
          })
        )
      ),
      stage
    );

    mount(app);
    // Both of these fix themselves to a viewport edge and append to <body>,
    // outside .bbm-app, rather than joining the page flow.
    BBM_RAIL.attach();
    BBM_TASKS.attach();
  }

  function renderError(err) {
    mount(
      el(
        'div',
        { class: 'bbm-app' },
        el(
          'div',
          { class: 'bbm-failure' },
          el('h1', { class: 'bbm-failure-head', text: 'Chargement impossible' }),
          el('p', {
            class: 'bbm-failure-text',
            text: "La liste des cours n'a pas pu être récupérée depuis l'API de Blackboard.",
          }),
          el('pre', { class: 'bbm-failure-detail', text: String((err && err.message) || err) }),
          el(
            'div',
            { class: 'bbm-failure-actions' },
            el('button', {
              class: 'bbm-escape',
              type: 'button',
              text: 'Réessayer',
              onclick: () => location.reload(),
            }),
            el('button', {
              class: 'bbm-escape bbm-escape-strong',
              type: 'button',
              text: "Blackboard d'origine",
              onclick: bypassToOriginal,
            })
          )
        )
      )
    );
  }

  // Blackboard's SPA keeps running underneath — timers, its own observers,
  // its session-keepalive polling. Wiping <body> and letting it carry on is
  // deliberate: the keepalive is what stops the session expiring while this
  // page is open, and any navigation out of here is a real page load.
  function mount(view) {
    document.body.replaceChildren(view);
    document.body.classList.add('bbm-takeover-body');
    finishBoot();
  }

  let started = false;

  function activate() {
    if (started) return;
    if (!shouldRun()) {
      // On the course list but bypassed: offer the way back instead.
      if (COURSE_LIST_RE.test(location.pathname) && bypassed()) offerReturn();
      return;
    }
    started = true;
    // boot.js normally sets this at document_start; set it here too for the
    // SPA case below, where boot.js never ran for this URL.
    document.documentElement.classList.add('bbm-takeover');

    load().then(render).catch((err) => {
      console.error('[bbm] course list takeover failed:', err);
      renderError(err);
    });
  }

  activate();

  // Arriving by SPA route change. Content scripts are injected once per real
  // navigation, so clicking "Cours" in Blackboard's own sidebar from another
  // Ultra page pushState's to /ultra/course without boot.js — or any of
  // this — ever running again for that URL. Without the watcher below you
  // get the old reskin and no way to tell why.
  //
  // Firefox content scripts live in an isolated world, so patching
  // history.pushState from here would only patch our own wrapper and never
  // see Blackboard's calls. Polling the URL is the thing that actually works
  // across the boundary; at 400ms it costs nothing measurable.
  window.addEventListener('popstate', activate);

  let lastPath = location.pathname;
  setInterval(() => {
    if (location.pathname === lastPath) return;
    lastPath = location.pathname;
    activate();
  }, 400);
})();
