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
  ['Universal', 'the studio'],
  ['Disney', 'the park company'],
];

const SORTED = GENERIC_LABELS.slice().sort((a, b) => b[0].length - a[0].length);
const ESC = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const RE = new RegExp(SORTED.map(([n]) => ESC(n)).join('|'), 'g');
const MAP = new Map(SORTED.map(([n, l]) => [n, l] as const));

/** Rewrite one string. Pure. */
export function genericize(text: string): string {
  if (NAMES_IN_TEXT || !text) return text;
  const out = text.replace(RE, (name, offset: number, whole: string) => {
    let label = MAP.get(name) ?? name;
    const before = whole.slice(0, offset);
    // After a determiner or a possessive the label loses its own article.
    if (/(?:\b(?:the|The|which|Which|its|Its|a|A)\s|[’']s\s)$/.test(before)) label = label.replace(/^the\s/, '');
    return label;
  });
  // "The the" never survives, and sentence starts are capitalised.
  return out
    .replace(/\b([Tt]he)((?:\s+(?:original|early|first|same|new|old|classic|famous))?)\s+the\b/g, '$1$2')
    .replace(/(^|[.!?]\s+)([a-z])/g, (_m, p: string, c: string) => p + c.toUpperCase());
}

/** True when a string still carries a name from the table (tests and the content guard). */
export function hasTrademarkName(text: string): boolean {
  if (!text) return false;
  return SORTED.some(([n]) => text.includes(n)) || /\bDisney\b|\bUniversal\b/.test(text);
}
