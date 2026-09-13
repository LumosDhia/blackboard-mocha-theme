// Helpers shared by the DOM reskin (content.js) and the rendered-from-JSON
// course list and task drawer (courselist.js, tasks.js).
//
// Content scripts listed in the same manifest entry share one isolated
// world, so this global is visible to every script loaded after it.

var BBM = (() => {
  // Catppuccin Mocha accent pairs. A course is coloured by hashing its name,
  // so it keeps the same colour whether it is drawn as a canvas placeholder
  // over Blackboard's banner (content.js) or as a CSS gradient in the
  // rebuilt list (courselist.js). Keeping the pairs and the hash in one
  // place is what makes those two agree.
  const PAIRS = [
    ['#f38ba8', '#eba0ac'], // red -> maroon
    ['#fab387', '#f9e2af'], // peach -> yellow
    ['#a6e3a1', '#94e2d5'], // green -> teal
    ['#89dceb', '#74c7ec'], // sky -> sapphire
    ['#89b4fa', '#b4befe'], // blue -> lavender
    ['#cba6f7', '#f5c2e7'], // mauve -> pink
    ['#f2cdcd', '#f5e0dc'], // flamingo -> rosewater
  ];

  // Esprit suffixes both course names and course codes with the class group:
  // "Machine Learning avancé__4CCE14", "ESE.SR-02__4CCE14". Splitting it off
  // lets the label and the group be shown separately — or the group dropped
  // entirely, as the task drawer does where space is tight.
  const GROUP_SEP = '__';

  function hash(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = (h << 5) - h + str.charCodeAt(i);
      h |= 0;
    }
    return Math.abs(h);
  }

  function pairFor(label) {
    return PAIRS[hash((label || '').trim()) % PAIRS.length];
  }

  function splitGroup(value) {
    const raw = (value || '').trim();
    const at = raw.indexOf(GROUP_SEP);
    if (at === -1) return { label: raw, group: null };
    return {
      label: raw.slice(0, at).trim(),
      group: raw.slice(at + GROUP_SEP.length).trim() || null,
    };
  }

  return { PAIRS, hash, pairFor, splitGroup };
})();
