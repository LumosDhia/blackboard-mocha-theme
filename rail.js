// Blackboard Mocha — left navigation rail.
//
// Rebuilds Blackboard's own primary navigation for the taken-over course
// list, which would otherwise have no way out to Calendrier, Messages, Notes
// and the rest.
//
// Every href below was read off the live logged-in page rather than guessed
// — most are predictable from the label, but Assist is not
// (/ultra/integration/bbAssist), and guessing it would have produced a link
// that silently 404s.
//
// Déconnexion is deliberately absent, matching the existing choice in
// content.js's HIDDEN_SIDEBAR_LINK_RE to hide it. Sign out by clearing the
// site's cookies, or add an entry here if you want it back.
//
// Class names avoid the substring "nav": mocha.css matches [class*="nav" i]
// broadly and with !important, which would repaint this. Hence "rail".

var BBM_RAIL = (() => {
  const ORIGIN = 'https://esprit.blackboard.com';

  // 24x24 stroked line icons, drawn to echo Blackboard's own glyph set.
  const ICONS = {
    institution: ['M12 3 21 8H3z', 'M5 10v8M9 10v8M15 10v8M19 10v8', 'M3 21h18'],
    activity: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M3 12h18', 'M12 3c2.6 2.8 2.6 15.2 0 18'],
    course: ['M4 4h16v16H4z', 'M8 4v16', 'M11 9h6M11 13h6'],
    calendar: ['M4 6h16v14H4z', 'M4 10h16', 'M8 3v4M16 3v4'],
    messages: ['M3 6h18v12H3z', 'm3 7 9 6 9-6'],
    grades: ['M6 3h7l5 5v13H6z', 'M13 3v5h5', 'm10 17 4-4'],
    assist: ['m5 19 8-8', 'm13 3 1 2 2 1-2 1-1 2-1-2-2-1 2-1z', 'm18 13 .6 1.3 1.3.6-1.3.6-.6 1.3-.6-1.3-1.3-.6 1.3-.6z'],
    tools: ['M5 5h8', 'M5 5v14h14v-8', 'm12 14-3 1 1-3 7-7 2 2z'],
  };

  const ITEMS = [
    { path: '/ultra/institution-page', label: "Page de l'établissement", icon: 'institution' },
    { path: '/ultra/stream', label: 'Activité', icon: 'activity' },
    { path: '/ultra/course', label: 'Cours', icon: 'course' },
    { path: '/ultra/calendar', label: 'Calendrier', icon: 'calendar' },
    { path: '/ultra/messages', label: 'Messages', icon: 'messages' },
    { path: '/ultra/grades', label: 'Notes', icon: 'grades' },
    { path: '/ultra/integration/bbAssist', label: 'Assist', icon: 'assist' },
    { path: '/ultra/tools', label: 'Outils', icon: 'tools' },
  ];

  const SVG_NS = 'http://www.w3.org/2000/svg';

  // Built through createElementNS rather than innerHTML, to keep the whole
  // codebase free of HTML-string injection even for our own constants.
  function icon(name) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.7');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('class', 'bbm-rail-icon');
    for (const d of ICONS[name] || []) {
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', d);
      svg.append(path);
    }
    return svg;
  }

  function row(item, currentPath) {
    const here = currentPath === item.path;
    const link = document.createElement('a');
    link.className = `bbm-rail-item${here ? ' bbm-rail-on' : ''}`;
    link.href = ORIGIN + item.path;
    if (here) link.setAttribute('aria-current', 'page');

    const label = document.createElement('span');
    label.className = 'bbm-rail-label';
    label.textContent = item.label;

    link.append(icon(item.icon), label);
    return link;
  }

  function attach() {
    const rail = document.createElement('nav');
    rail.className = 'bbm-rail';
    rail.setAttribute('aria-label', 'Navigation principale');
    for (const item of ITEMS) rail.append(row(item, location.pathname));

    // Decorative only: aria-hidden, and not a link, so it is invisible to
    // screen readers and to keyboard tabbing through the nav.
    const art = document.createElement('div');
    art.className = 'bbm-rail-art';
    art.setAttribute('aria-hidden', 'true');
    rail.append(art);

    document.body.append(rail);
    // The rail is fixed, so it is out of flow — the page has to be pushed
    // clear of it by hand. A class rather than an inline style so the
    // responsive collapse below can change the offset in one place.
    document.body.classList.add('bbm-railed');
    return rail;
  }

  return { attach, ITEMS };
})();
