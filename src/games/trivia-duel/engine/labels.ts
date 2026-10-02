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

export const NAMES_IN_TEXT = false;

/** [trademarked name, generic label]. Order does not matter: matching is longest-first. */
export const GENERIC_LABELS: readonly (readonly [string, string])[] = [
  ['Universal Studios Hollywood’s Studio Tour', 'the Hollywood studio backlot tour'],
  ['the Universal Studio Tour', 'the Hollywood studio backlot tour'],
  ['Universal Studios Hollywood', 'the Hollywood movie studio park'],
  ['Disney California Adventure', 'the second California park'],
  ['Disney’s Animal Kingdom', 'the Florida animal park'],
  ['Animal Kingdom', 'the Florida animal park'],
  ['Big Thunder Mountain Railroad', 'the runaway mine train'],
  ['Pirates of the Caribbean', 'the pirate boat ride'],
  ['Matterhorn Bobsleds', 'the snowy mountain bobsleds'],
  ['Matterhorn', 'the snowy mountain'],
  ['Haunted Mansion', 'the haunted house ride'],
  ['Space Mountain', 'the indoor space coaster'],
  ['Splash Mountain', 'the log flume mountain'],
  ['Jungle Cruise', 'the jungle river boat ride'],
  ['Star Tours', 'the space flight simulator'],
  ['Tokyo Disneyland', 'the Tokyo castle park'],
  ['Disneyland Paris', 'the Paris castle park'],
  ['Magic Kingdom', 'the Florida castle park'],
  ['Disneyland', 'the California castle park'],
  ['Studio Tour', 'backlot tour'],
  ['Super Nintendo World', 'the video game land'],
  ['CityWalk', 'the dining promenade'],
  ['King Kong 360', 'the giant ape 3-D scene'],
  ['WaterWorld', 'the water stunt'],
  ['Universal', 'the studio'],
  ['New Orleans Square', 'the bayou square'],
  ['Tomorrowland', 'the future land'],
  ['Adventureland', 'the adventure land'],
  ['Fantasyland', 'the fairy-tale land'],
  ['Frontierland', 'the frontier land'],
  ['EPCOT', 'the Florida future park'],
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
  // "The original the ..." never survives, and sentence starts are capitalised.
  return out
    .replace(/\b([Tt]he)((?:\s+(?:original|early|first|same|new|old|classic|famous))?)\s+the\b/g, '$1$2')
    .replace(/\b([Tt]he) (two|three|four) ([^’,.?]+?)’s /g, '$1 $3’s $2 ')
    .replace(/(^|[.!?]\s+)([a-z])/g, (_m, p: string, c: string) => p + c.toUpperCase());
}

/** True when a string still carries a name from the table (tests and the content guard). */
export function hasTrademarkName(text: string): boolean {
  if (!text) return false;
  return SORTED.some(([n]) => text.includes(n)) || /\bDisney\b|\bUniversal\b/.test(text) || DROP_TERMS.some((t) => new RegExp(`\\b${t}\\b`).test(text));
}

/** An item that must sit out entirely (its answer is a film or brand title). */
export function mustDrop(texts: readonly string[]): boolean {
  if (NAMES_IN_TEXT) return false;
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
    if (!question.includes(name)) continue;
    const words = label.toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 4 && !STOP.has(w));
    if (words.some((w) => ans.includes(w))) return true;
  }
  return false;
}
