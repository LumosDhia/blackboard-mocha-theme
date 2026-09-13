// Shared Catppuccin Mocha accent pairs.
//
// Both the DOM reskin (content.js, which paints canvas placeholders over
// Blackboard's own banner divs) and the rendered-from-JSON course list
// (courselist.js, which draws CSS gradients) colour a course by hashing its
// name, so a given course keeps the same colour in either view and across
// reloads. Keeping the pairs and the hash in one place is what makes those
// two agree.
//
// Content scripts listed in the same manifest entry share one isolated
// world, so this global is visible to every script loaded after it.

var BBM_PALETTE = (() => {
  const PAIRS = [
    ['#f38ba8', '#eba0ac'], // red -> maroon
    ['#fab387', '#f9e2af'], // peach -> yellow
    ['#a6e3a1', '#94e2d5'], // green -> teal
    ['#89dceb', '#74c7ec'], // sky -> sapphire
    ['#89b4fa', '#b4befe'], // blue -> lavender
    ['#cba6f7', '#f5c2e7'], // mauve -> pink
    ['#f2cdcd', '#f5e0dc'], // flamingo -> rosewater
  ];

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

  return { PAIRS, hash, pairFor };
})();
