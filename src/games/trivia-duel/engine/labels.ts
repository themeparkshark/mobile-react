/**
 * Generic labels (design 9.1, 19.2; S1 gate 2): no trademarked ride or park
 * name appears anywhere in Trivia Duel UI, question text included, until
 * Dustin decides otherwise. Items say "this ride" or a generic label ("the
 * indoor space coaster", "the log flume"), unique within the pool.
 *
 * WS5 will ship a `generic_label` per ride; until then this table rewrites
 * the bundled pool and the generated formats at the display edge. Longest
 * names first; a label drops its leading "the" after a determiner or a
 * possessive ("Which ...", "the ...", "...'s ..."), and sentence starts are
 * capitalised. Flip NAMES_IN_TEXT (server flag TRIVIA_NAMES_IN_TEXT) to show
 * the real names.
 */

/**
 * Fix round w3 hold-2 (T043, with the T234 decision default of Nov 18: plain names in trivia): the
 * fact-checked bank is shown as its writers wrote it. The display-edge word swap was the root of every
 * garbled line graders found ("named after a park company animator", "Walt World", "the studio Studios
 * Florida", "park designering", "Mission: BREAKOUT! Opened"), and the map already shows the same plain
 * names ("Walt Disney's Enchanted Tiki Room", "Universal Studios Florida"). Plain text only: no logo or
 * look-alike art. Items whose answer is a film title still sit out (DROP_TERMS, mustDrop) until Dustin
 * rules on film names. Set false to bring the old swap back.
 */
export const NAMES_IN_TEXT = true;

/**
 * Place names (fix round w3 T234 and T043, decision default Nov 18): a park, land or ride keeps the plain
 * name the map already shows ("Disneyland", "Magic Kingdom", "Pirates of the Caribbean"). They are text, not
 * logos, and a hand-swapped nickname broke grammar ("Walt's private the California castle park apartment")
 * and never matched the map. Each maps to itself, so the company words below never eat into one
 * ("Disney California Adventure" stays whole; matching is longest-first).
 */
export const PLACE_NAMES: readonly string[] = [
  'Universal Studios Hollywood', 'Disney California Adventure', 'Disney’s Animal Kingdom', 'Animal Kingdom',
  'Big Thunder Mountain Railroad', 'Pirates of the Caribbean', 'Matterhorn Bobsleds', 'Matterhorn', 'Haunted Mansion',
  'Space Mountain', 'Splash Mountain', 'Jungle Cruise', 'Star Tours', 'Tokyo Disneyland', 'Disneyland Paris',
  'Magic Kingdom', 'Disneyland', 'Super Nintendo World', 'CityWalk', 'King Kong 360', 'WaterWorld', 'New Orleans Square',
  'Tomorrowland', 'Adventureland', 'Fantasyland', 'Frontierland', 'EPCOT',
];

/** [trademarked name, generic label]. Order does not matter: matching is longest-first. */
export const GENERIC_LABELS: readonly (readonly [string, string])[] = [
  ...PLACE_NAMES.map((name) => [name, name] as const),
  ['Universal Studios Hollywood’s Studio Tour', 'the Universal Studios Hollywood backlot tour'],
  ['the Universal Studio Tour', 'the Universal Studios Hollywood backlot tour'],
  ['Studio Tour', 'backlot tour'],
  ['Universal', 'the studio'],
  ['Audio-Animatronics', 'animated figures'],
  ['Imagineer', 'park designer'],
  ['Walt Disney', 'Walt'],
  ['Disney films', 'studio films'],
  ['Disney', 'the park company'],
];

/**
 * Items that name a film or brand as the answer itself cannot be relabelled
 * without losing the question; they sit out until Dustin rules on names (19.2).
 */
export const DROP_TERMS: readonly string[] = ['Jaws', 'NOPE', 'Sharknado', 'The Meg'];

const PLACES_LONGEST = PLACE_NAMES.slice().sort((a, b) => b.length - a.length);
const SORTED = GENERIC_LABELS.slice().sort((a, b) => b[0].length - a[0].length);
const ESC = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const RE = new RegExp(SORTED.map(([n]) => ESC(n)).join('|'), 'g');
const MAP = new Map(SORTED.map(([n, l]) => [n, l] as const));

/** Rewrite one string. Pure. */
export function genericize(text: string): string {
  if (NAMES_IN_TEXT || !text) return text;
  let out = '';
  let last = 0;
  let prevLabelEnd = -1;
  RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = RE.exec(text))) {
    const name = m[0];
    let label = MAP.get(name) ?? name;
    const gap = text.slice(last, m.index);
    const before = out + gap;
    // Two names side by side ("Magic Kingdom Space Mountain"): the first becomes a possessive.
    if (prevLabelEnd >= 0 && /^\s+$/.test(gap)) {
      out = `${out}’s`;
      label = label.replace(/^the\s/, '');
    } else if (/(?:\b(?:the|The|which|Which|its|Its|a|A|two|three|both|all|each|every)\s|[’']s\s)$/.test(before)) {
      // After a determiner, a number or a possessive the label loses its own article.
      label = label.replace(/^the\s/, '');
    }
    out += gap + label;
    last = m.index + name.length;
    prevLabelEnd = last;
  }
  out += text.slice(last);
  // "The original the ..." never survives (a year between them included: "the original 1987 the ..."),
  // a doubled word is said once ("simulator flight"), and sentence starts are capitalised (core loop 5.3:
  // garbled IP-safe lines are rewritten). A park's name stays: two parks' rides must never read alike.
  return out
    .replace(/\b([Tt]he)((?:\s+(?:original|early|first|same|new|old|classic|famous))?(?:\s+\d{4})?)\s+the\b/g, '$1$2')
    .replace(/\bspace flight simulator flight\b/g, 'space flight simulator')
    .replace(/\b([Tt]he) (two|three|four) ([^’,.?]+?)’s /g, '$1 $3’s $2 ')
    .replace(/(^|[.!?]\s+)([a-z])/g, (_m, p: string, c: string) => p + c.toUpperCase());
}

/** True when a string still carries a name from the table (tests and the content guard). */
export function hasTrademarkName(text: string): boolean {
  if (!text) return false;
  // Place names keep their map names (T234): only a company word outside one is a leak.
  const rest = PLACES_LONGEST.reduce((acc, place) => acc.split(place).join(' '), text);
  return SORTED.some(([n, l]) => n !== l && rest.includes(n)) || /\bDisney\b|\bUniversal\b/.test(rest) || DROP_TERMS.some((t) => new RegExp(`\\b${t}\\b`).test(rest));
}

/** An item that must sit out entirely (its answer is a film or brand title). */
export function mustDrop(texts: readonly string[]): boolean {
  // Film titles are their own decision (19.2): they sit out whether or not place and company names show.
  return texts.some((t) => DROP_TERMS.some((d) => new RegExp(`\\b${d}\\b`).test(t)));
}

const STOP = new Set(['the', 'park', 'ride', 'rides', 'second', 'first', 'original', 'company', 'studio', 'california', 'florida', 'tokyo', 'paris', 'hollywood']);

/**
 * True when a generic label would give the answer away: a content word of a
 * label used in the question also appears in the right answer ("What kind of
 * ride is Space Mountain?" -> "the indoor space coaster" -> "A roller coaster
 * in the dark"). Such items sit out until WS5 writes a "this ride" paraphrase.
 */
export function labelLeaks(question: string, answer: string): boolean {
  if (NAMES_IN_TEXT) return false;
  const ans = ` ${answer.toLowerCase()} `;
  for (const [name, label] of SORTED) {
    if (name === label || !question.includes(name)) continue; // a place keeps its own name (T234): nothing to leak
    const words = label.toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 4 && !STOP.has(w));
    if (words.some((w) => ans.includes(w))) return true;
  }
  return false;
}
