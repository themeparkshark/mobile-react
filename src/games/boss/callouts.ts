/**
 * Boss Brawl callout queue (design v7.1 11.10, 11.0). Pure rules, no React.
 *
 * At most one hero wordmark and one small callout on screen. A callout of a
 * higher juice tier replaces the current one at once (the old one pops out in
 * 80 ms); an equal tier replaces; a lower tier is dropped while the current
 * one has more than 200 ms left. Stacking counters (HIT n) update in place by
 * key. The ribbon zone (boss name, bout ribbon, toasts) suspends the small
 * lane while a ribbon is up, so nothing ever sits on a ribbon.
 */

/** Juice tiers (design 11.0). */
export const TIER_AMBIENT = 0;
export const TIER_HIT = 1;
export const TIER_POP = 2;
export const TIER_COUNTER = 3;
export const TIER_PUNISH = 3;
export const TIER_BREAK = 4;
export const TIER_FINAL = 5;
export const TIER_KO = 6;

export type CalloutSlot = 'hero' | 'small';
export type CalloutTone = 'white' | 'coral' | 'lime';

/** Drawn hero wordmarks (K10). */
export type Wordmark =
  | 'perfect' | 'break' | 'finish' | 'knockout' | 'getup' | 'teamstrike' | 'fury' | 'nice' | 'great' | 'superb';

export interface CalloutSpec {
  slot: CalloutSlot;
  tier: number;
  /** Text for small callouts, and the fallback for a hero without a wordmark. */
  text: string;
  wordmark?: Wordmark;
  tone?: CalloutTone;
  /** Lime underline (PERFECT tiers). */
  underline?: boolean;
  /** Stacking key: a live callout with the same key updates in place. */
  key?: string;
  /** Hero scale (BREAK! 1.0 / 1.1 / 1.2). */
  scale?: number;
  /** Entry: 'pop' 0 -> 1.15 -> 1, 'slam' 1.4 -> 1 (KNOCKOUT card). */
  entry?: 'pop' | 'slam';
  ms: number;
}

export interface Callout extends CalloutSpec {
  id: number;
  at: number;
}

export interface CalloutState {
  hero: Callout | null;
  small: Callout | null;
  /** Ribbon zone busy until (ms): the small lane is suspended. */
  ribbonUntil: number;
  seq: number;
}

export const REPLACE_GUARD_MS = 200;
export const POP_OUT_MS = 80;

export function emptyCallouts(): CalloutState {
  return { hero: null, small: null, ribbonUntil: -1, seq: 0 };
}

function live(c: Callout | null, now: number): Callout | null {
  return c && now < c.at + c.ms ? c : null;
}

export type PushResult = 'shown' | 'updated' | 'replaced' | 'dropped';

/** Offer a callout to the queue at time `now` (ms). Mutates and returns what happened. */
export function pushCallout(s: CalloutState, spec: CalloutSpec, now: number): PushResult {
  const slot = spec.slot;
  if (slot === 'small' && now < s.ribbonUntil) return 'dropped';
  const cur = live(s[slot], now);
  if (cur && spec.key && cur.key === spec.key) {
    s[slot] = { ...spec, id: cur.id, at: now };
    return 'updated';
  }
  if (cur && spec.tier < cur.tier && cur.at + cur.ms - now > REPLACE_GUARD_MS) return 'dropped';
  s.seq += 1;
  s[slot] = { ...spec, id: s.seq, at: now };
  return cur ? 'replaced' : 'shown';
}

/** A ribbon (bout name, toast, TEAM STRIKE swap) takes the ribbon zone; the small lane clears and waits. */
export function holdRibbon(s: CalloutState, now: number, ms: number): void {
  s.ribbonUntil = Math.max(s.ribbonUntil, now + ms);
  if (live(s.small, now)) s.small = null;
}

/** What is on screen at `now` (never more than one hero and one small). */
export function visibleCallouts(s: CalloutState, now: number): { hero: Callout | null; small: Callout | null } {
  return { hero: live(s.hero, now), small: now < s.ribbonUntil ? null : live(s.small, now) };
}

/**
 * Safe zones on the arena (design 11.10, 390 x 844 reference scaled to the
 * arena height): ribbon zone, small lane above the boss's head, hero zone over
 * its upper body. The HUD band (boss name, raid HP) sits above all three.
 */
export interface CalloutZones { ribbonY: number; ribbonH: number; smallY: number; heroY: number; heroMaxW: number; hudBottom: number }

export function calloutZones(W: number, H: number): CalloutZones {
  return {
    hudBottom: Math.round(H * 0.105),
    ribbonY: Math.round(H * 0.155),
    ribbonH: Math.round(Math.min(78, H * 0.1)),
    smallY: Math.round(H * 0.165),
    heroY: Math.round(H * 0.255),
    heroMaxW: Math.min(300, W - 40),
  };
}
