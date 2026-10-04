/**
 * One name per encounter critter. The map, the catch reveal, the coach line
 * and the Marquee all name the critter the same way: the live encounter's
 * name, else the house name for its critter key, else neutral copy. Older
 * servers label the recap encounter with the event's "Lantern Star" title,
 * which is not a critter name, so that label never reaches a kid.
 * Pure, unit tested (fright-ship-ui).
 */

export type FrightCritterKey = 'chuckles' | 'riptide';

/** House parody names for the encounter critters (same as the server's live encounter.name). */
export const CRITTER_NAMES: Readonly<Record<FrightCritterKey, string>> = {
  chuckles: 'Chuckles the Chum Jester',
  riptide: 'Ringmaster Riptide',
};

/** Labels that name the event, not a critter (old recap payloads). */
const NOT_A_CRITTER = new Set(['lantern star', 'the lantern star']);

/** Neutral copy when no critter name is known. */
export const NEUTRAL_CRITTER = 'a Chaos critter';

function clean(name: unknown): string | null {
  if (typeof name !== 'string') return null;
  const trimmed = name.trim();
  if (!trimmed || NOT_A_CRITTER.has(trimmed.toLowerCase())) return null;
  return trimmed;
}

/**
 * The critter's display name from whatever the payload carries: an explicit
 * name (live encounter, catch result `critter_name`), then the critter key,
 * or null when neither is a real critter name.
 */
export function critterName(source: { readonly name?: unknown; readonly critter?: unknown; readonly critter_name?: unknown } | null | undefined): string | null {
  if (!source) return null;
  const named = clean(source.critter_name) ?? clean(source.name);
  if (named) return named;
  const key = typeof source.critter === 'string' ? source.critter as FrightCritterKey : null;
  return key && CRITTER_NAMES[key] ? CRITTER_NAMES[key] : null;
}

/** "You caught Ringmaster Riptide!" or the neutral "You caught a Chaos critter!". */
export function caughtHeadline(name: string | null | undefined): string {
  return `You caught ${clean(name) ?? NEUTRAL_CRITTER}!`;
}

/**
 * The Marquee line for a night with a catch: "Caught Ringmaster Riptide", or
 * "Caught a Chaos critter" when the recap only says that a catch happened
 * (a boolean, or the old "Lantern Star" label). Null when nothing was caught.
 */
export function marqueeCatchLine(encounter: unknown): string | null {
  if (!encounter) return null;
  if (typeof encounter !== 'object') return `Caught ${NEUTRAL_CRITTER}`;
  return `Caught ${critterName(encounter as { name?: unknown; critter?: unknown; critter_name?: unknown }) ?? NEUTRAL_CRITTER}`;
}

/** The Chaos Hour coach line: names the live critter, never a giggle for Riptide. */
export function chaosCoachLine(name: string | null | undefined): string {
  const critter = clean(name);
  return critter ? `Chaos Hour! ${critter} is loose near a reef.` : 'Chaos Hour! A critter is loose near a reef.';
}
