/**
 * Fin-ister Nights copy. Lines come from the content pack (content/lines.json,
 * written to lore/COPY.md voice: kid-safe, parody names only, no em dashes);
 * fixed UI strings live here. Never a real event, house or icon name.
 */
import LINES from './content/lines.json';

type Lines = typeof LINES;

/** Fill "{name}" style slots. */
export function fill(template: string, vars: Readonly<Record<string, string | number>>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in vars ? String(vars[key]) : match));
}

/** A stable pick from a list (seeded so a line doesn't flicker between renders). */
export function pick(list: readonly string[], seed: number | string = 0): string {
  if (!list.length) return '';
  let hash = 0;
  for (const char of String(seed)) hash = (Math.imul(hash, 31) + char.charCodeAt(0)) >>> 0;
  return list[hash % list.length];
}

export const lines: Lines = LINES;

export const COPY = {
  shusherEnter: 'shh. phones away. see you on the other side.',
  quietTitle: 'Phones down',
  survived: 'I survived it!',
  inLine: 'I\'m in line',
  playInLine: 'Play in line',
  closed: 'This haunt is closed right now.',
  offline: 'Signal\'s spooky in here. Your progress is saved.',
  empty: 'No haunts yet tonight. The fog can wait.',
  tooFar: 'Get closer to the haunt entrance first.',
  poorFix: 'Waiting for a better GPS signal.',
  reaction: LINES.reaction_prompt,
  scouted: LINES.marquee_zero,
  backNextFall: 'Back next fall',
  misty: 'Misty... Misty... Misty...',
  night19: 'Night 19. The Lantern remembers.',
  exitTitle: 'The fog lifts...',
  exitLine: 'See your night.',
  welcomeBack: 'Welcome back to',
  spooky: 'Spooky effects',
  spookyHint: 'Fog, thunder, sounds and pops',
} as const;

export function rankPrompt(name: string, reSwim: boolean, seed: number | string): string {
  if (reSwim) return 'Re-swim! Still a five?';
  return `${fill(pick(LINES.haunt_done, seed), { name })} How many fins?`;
}

/** "You have it #2. Fans have it #1." only from server fan data. */
export function fanCompare(myRank: number | null | undefined, fanRank: number | null | undefined): string | null {
  if (fanRank == null || fanRank < 1) return null;
  return myRank != null && myRank >= 1 ? `You have it #${myRank}. Fans have it #${fanRank}.` : `Fans have it #${fanRank}.`;
}
