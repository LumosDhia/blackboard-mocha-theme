// Blackboard Mocha — "Tâches à accomplir" drawer.
//
// A rebuild of Blackboard's own due-date panel, docked to the right edge of
// the rebuilt course list. It stays hidden until the cursor reaches the edge,
// and carries a badge with the number of items you have not looked at yet.
//
// Data comes from the documented calendar endpoint:
//
//   GET /learn/api/public/v1/calendars/items?since=…&until=…
//
// `since`/`until` may not span more than 16 weeks; the ±7 day window used
// here is well inside that. Items of type GradebookColumn are the gradable
// ones (assignments, tests) and are read-only, which is exactly what this
// needs.
//
// CAVEAT, and it is a real one: at the time of writing every course on this
// account is newly created and nothing is due, so the endpoint returns
// `{"results":[]}`. The three buckets, the empty states and the badge have
// been exercised with synthetic items, but the *field mapping* below
// (dueDate → endDate → startDate, calendarName as the course) is written
// against Blackboard's published schema rather than against a real response.
// The first time something is actually due, check it against reality.

var BBM_TASKS = (() => {
  const ORIGIN = 'https://esprit.blackboard.com';
  const SEEN_KEY = 'bbm.tasks.seen';
  const WINDOW_DAYS = 7;

  // Matches the wording of the panel this replaces, so the empty states say
  // what Blackboard's said.
  const GROUPS = [
    { key: 'overdue', label: 'En retard', empty: `Aucun élément en retard au cours des ${WINDOW_DAYS} derniers jours` },
    { key: 'today', label: "À rendre aujourd'hui", empty: "Aucun élément à rendre aujourd'hui" },
    { key: 'soon', label: 'À rendre bientôt', empty: `Aucun élément à rendre dans les ${WINDOW_DAYS} prochains jours` },
  ];

  function el(tag, props, ...children) {
    const node = document.createElement(tag);
    if (props) {
      for (const [k, v] of Object.entries(props)) {
        if (v === null || v === undefined) continue;
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
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

  // Every read and write is wrapped: a private window, or blocked site data,
  // throws on access rather than returning null. A drawer that cannot
  // remember what you have seen should still open.
  function readSeen() {
    try {
      const raw = localStorage.getItem(SEEN_KEY);
      return new Set(raw ? JSON.parse(raw) : []);
    } catch (e) {
      return new Set();
    }
  }

  function writeSeen(ids) {
    try {
      localStorage.setItem(SEEN_KEY, JSON.stringify([...ids]));
    } catch (e) {
      /* nothing to do — the badge just won't persist across reloads. */
    }
  }

  function startOfDay(d) {
    const copy = new Date(d);
    copy.setHours(0, 0, 0, 0);
    return copy;
  }

  function addDays(d, n) {
    const copy = new Date(d);
    copy.setDate(copy.getDate() + n);
    return copy;
  }

  function dueDateOf(item) {
    // GradebookColumn items carry dueDate; plain course/personal events use
    // endDate, and all-day entries only have a start.
    const raw = item.dueDate || item.endDate || item.startDate;
    if (!raw) return null;
    const when = new Date(raw);
    return Number.isNaN(when.getTime()) ? null : when;
  }

  function bucketOf(due, now) {
    const todayStart = startOfDay(now);
    const tomorrowStart = addDays(todayStart, 1);
    if (due < todayStart) return 'overdue';
    if (due < tomorrowStart) return 'today';
    return 'soon';
  }

  function formatWhen(due, bucket) {
    const time = due.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    if (bucket === 'today') return time;
    const date = due.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    return `${date} · ${time}`;
  }

  async function fetchItems() {
    const now = new Date();
    const since = addDays(startOfDay(now), -WINDOW_DAYS).toISOString();
    const until = addDays(startOfDay(now), WINDOW_DAYS + 1).toISOString();
    // Absolute URL: the page's <base href> points at the CloudFront CDN, so a
    // relative path would go cross-origin and fail CORS. See CONTEXT.md.
    const res = await fetch(
      `${ORIGIN}/learn/api/public/v1/calendars/items?since=${since}&until=${until}&limit=200`,
      { credentials: 'include', headers: { Accept: 'application/json' } }
    );
    if (!res.ok) throw new Error(`calendars/items → HTTP ${res.status}`);
    const data = await res.json();
    return data.results || [];
  }

  function toTasks(items, now) {
    return items
      .map((item) => {
        const due = dueDateOf(item);
        if (!due) return null;
        return {
          id: item.id,
          name: (item.title || 'Sans titre').trim(),
          course: BBM.splitGroup(item.calendarName || '').label,
          due,
          bucket: bucketOf(due, now),
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.due - b.due);
  }

  function taskRow(task) {
    return el(
      'li',
      { class: 'bbm-task' },
      el('p', { class: 'bbm-task-name', text: task.name }),
      el(
        'p',
        { class: 'bbm-task-line' },
        task.course && el('span', { class: 'bbm-task-course', text: task.course }),
        el('span', { class: 'bbm-task-when', text: formatWhen(task.due, task.bucket) })
      )
    );
  }

  function groupBlock(group, tasks) {
    const body = tasks.length
      ? el('ul', { class: 'bbm-group-body' }, ...tasks.map(taskRow))
      : el('p', { class: 'bbm-group-empty', text: group.empty });

    const chevron = el('span', { class: 'bbm-chev', 'aria-hidden': 'true' });
    const toggle = el(
      'button',
      {
        class: 'bbm-group-label',
        type: 'button',
        'aria-expanded': 'true',
      },
      el('span', { text: group.label }),
      chevron
    );

    const block = el('section', { class: 'bbm-group' }, toggle, body);
    toggle.addEventListener('click', () => {
      const open = block.classList.toggle('bbm-group-shut') === false;
      toggle.setAttribute('aria-expanded', String(open));
    });
    return block;
  }

  function render(dock, tasks) {
    const byBucket = { overdue: [], today: [], soon: [] };
    for (const task of tasks) byBucket[task.bucket].push(task);

    const body = dock.querySelector('.bbm-tasks-body');
    body.replaceChildren(...GROUPS.map((g) => groupBlock(g, byBucket[g.key])));
    return byBucket;
  }

  function updateBadge(dock, tasks) {
    const seen = readSeen();
    const unseen = tasks.filter((t) => !seen.has(t.id)).length;
    const badge = dock.querySelector('.bbm-tasks-badge');
    badge.textContent = unseen > 9 ? '9+' : String(unseen);
    badge.hidden = unseen === 0;
    dock.classList.toggle('bbm-tasks-new', unseen > 0);
    return unseen;
  }

  // Opening the drawer is what marks items read — hovering past the edge on
  // the way to something else should not silently clear the badge, so this
  // only fires once the drawer has actually been held open.
  function markSeen(dock, tasks) {
    writeSeen(new Set(tasks.map((t) => t.id)));
    updateBadge(dock, tasks);
  }

  function build() {
    const badge = el('span', { class: 'bbm-tasks-badge', hidden: '', 'aria-hidden': 'true' });
    const tab = el(
      'button',
      {
        class: 'bbm-tasks-tab',
        type: 'button',
        'aria-label': 'Tâches à accomplir',
        'aria-expanded': 'false',
      },
      el('span', { class: 'bbm-tasks-tab-text', text: 'Tâches' }),
      badge
    );

    const drawer = el(
      'aside',
      { class: 'bbm-tasks', 'aria-label': 'Tâches à accomplir' },
      el('h2', { class: 'bbm-tasks-head', text: 'Tâches à accomplir' }),
      el('div', { class: 'bbm-tasks-body' }, el('p', { class: 'bbm-group-empty', text: 'Chargement…' }))
    );

    const dock = el('div', { class: 'bbm-dock' }, tab, drawer);

    // Click pins it open, for touch and for keyboard. Hover is handled in
    // CSS so it costs nothing per pointer move.
    tab.addEventListener('click', () => {
      const open = dock.classList.toggle('bbm-dock-pinned');
      tab.setAttribute('aria-expanded', String(open));
    });

    return dock;
  }

  async function attach() {
    const dock = build();
    document.body.append(dock);

    let tasks = [];
    try {
      tasks = toTasks(await fetchItems(), new Date());
    } catch (err) {
      console.error('[bbm] task drawer failed:', err);
      dock.querySelector('.bbm-tasks-body').replaceChildren(
        el('p', { class: 'bbm-group-empty', text: 'Tâches indisponibles.' })
      );
      return dock;
    }

    render(dock, tasks);
    updateBadge(dock, tasks);

    // Held open for a moment = read. A 600ms dwell is long enough that
    // brushing the edge with the cursor doesn't count.
    let dwell = null;
    const open = () => {
      clearTimeout(dwell);
      dwell = setTimeout(() => markSeen(dock, tasks), 600);
    };
    const close = () => clearTimeout(dwell);
    dock.addEventListener('mouseenter', open);
    dock.addEventListener('mouseleave', close);
    dock.addEventListener('focusin', open);

    return dock;
  }

  return { attach, toTasks, bucketOf, dueDateOf };
})();
