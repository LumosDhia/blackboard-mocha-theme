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
    tasks: ['M10 6h10M10 12h10M10 18h10', 'm4 6 1.4 1.4L8.2 4.6', 'm4 12 1.4 1.4L8.2 10.6', 'm4 18 1.4 1.4L8.2 16.6'],
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
    // No path: rendered as a button rather than a link. It opens the task
    // drawer in place instead of navigating, and carries the unread badge.
    { action: 'tasks', label: 'Tâches à accomplir', icon: 'tasks' },
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
    const here = !item.action && currentPath === item.path;
    // A link navigates; an action stays on the page, so it must be a button
    // — not an <a href="#"> that would push a history entry and steal focus
    // styling from the real links.
    const node = document.createElement(item.action ? 'button' : 'a');
    node.className = `bbm-rail-item${here ? ' bbm-rail-on' : ''}`;
    if (item.action) {
      node.type = 'button';
      node.dataset.action = item.action;
    } else {
      node.href = ORIGIN + item.path;
      if (here) node.setAttribute('aria-current', 'page');
    }
    node.setAttribute('aria-label', item.label);

    // The glyph is wrapped because magnification scales it and only it — the
    // label must not scale with the icon, and the row itself carries the
    // separate vertical displacement.
    const glyph = document.createElement('span');
    glyph.className = 'bbm-rail-glyph';
    glyph.append(icon(item.icon));

    const label = document.createElement('span');
    label.className = 'bbm-rail-label';
    label.textContent = item.label;

    node.append(glyph, label);

    if (item.action === 'tasks') {
      const badge = document.createElement('span');
      badge.className = 'bbm-rail-badge';
      badge.hidden = true;
      badge.setAttribute('aria-hidden', 'true');
      // Inside the glyph so magnification carries the badge with the icon.
      glyph.append(badge);
    }

    return node;
  }

  // macOS-dock magnification, vertical. Rather than scaling each icon in
  // place — which makes them overlap — the row heights are re-stacked at
  // their magnified sizes and every row is offset to its new position, so
  // neighbours are pushed apart the way the real dock pushes them.
  //
  // The item nearest the cursor is then re-anchored to where it started,
  // otherwise the whole column visibly slides up or down as the stack grows.
  const MAX_SCALE = 1.75;
  const RADIUS = 118;   // px of influence either side of the cursor
  const FALLOFF = 1.6;  // >1 tightens the peak, closer to the real dock

  function magnifier(rail, items) {
    if (!items.length) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let frame = null;

    // offsetTop/offsetHeight are unaffected by transforms, so these stay
    // correct no matter what state the dock is in when we measure.
    function metrics() {
      const railTop = rail.getBoundingClientRect().top;
      const size = items[0].offsetHeight;
      return {
        size,
        tops: items.map((el) => railTop + el.offsetTop),
      };
    }

    function scaleFor(distance) {
      if (distance >= RADIUS) return 1;
      return 1 + (MAX_SCALE - 1) * Math.pow(1 - distance / RADIUS, FALLOFF);
    }

    function apply(pointerY) {
      const { size, tops } = metrics();
      const scales = tops.map((top) => scaleFor(Math.abs(pointerY - (top + size / 2))));

      // Re-stack at magnified heights.
      const stacked = [];
      let cursor = tops[0];
      for (let i = 0; i < items.length; i++) {
        stacked.push(cursor);
        cursor += size * scales[i];
      }

      // Anchor the row under the cursor so the column doesn't drift.
      let nearest = 0;
      let best = Infinity;
      tops.forEach((top, i) => {
        const d = Math.abs(pointerY - (top + size / 2));
        if (d < best) {
          best = d;
          nearest = i;
        }
      });
      const shift = tops[nearest] + size / 2 - (stacked[nearest] + (size * scales[nearest]) / 2);

      items.forEach((el, i) => {
        el.style.setProperty('--s', scales[i].toFixed(3));
        el.style.setProperty('--dy', `${(stacked[i] + shift - tops[i]).toFixed(1)}px`);
      });
    }

    function clear() {
      items.forEach((el) => {
        el.style.setProperty('--s', '1');
        el.style.setProperty('--dy', '0px');
      });
    }

    rail.addEventListener('pointermove', (event) => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => apply(event.clientY));
    });

    rail.addEventListener('pointerleave', () => {
      if (frame) cancelAnimationFrame(frame);
      frame = null;
      clear();
    });
  }

  function attach() {
    const rail = document.createElement('nav');
    rail.className = 'bbm-rail';
    rail.setAttribute('aria-label', 'Navigation principale');
    const items = ITEMS.map((item) => row(item, location.pathname));
    for (const item of items) rail.append(item);
    magnifier(rail, items);

    document.body.append(rail);
    // The rail is fixed, so it is out of flow — the page has to be pushed
    // clear of it by hand. A class rather than an inline style so the
    // responsive collapse below can change the offset in one place.
    document.body.classList.add('bbm-railed');

    const button = rail.querySelector('[data-action="tasks"]');
    const badge = button && button.querySelector('.bbm-rail-badge');

    return {
      rail,
      // Handed to tasks.js, which owns the count and the drawer.
      tasks: {
        button,
        setBadge(count) {
          if (!badge) return;
          badge.textContent = count > 9 ? '9+' : String(count);
          badge.hidden = count === 0;
          if (button) button.classList.toggle('bbm-rail-has-news', count > 0);
        },
        setOpen(open) {
          if (button) button.setAttribute('aria-expanded', String(open));
        },
      },
    };
  }

  return { attach, ITEMS };
})();
