/**
 * The LinePlay wait screen (IN_LINE_BUILD.md, stream L2): the ride's own coin
 * center stage, filling as Parts land, and an honest read on the wait.
 *
 * Pure (no React or native imports) so tools/tests can drive every rule:
 *  - The coin ring has one notch per Part the next level costs, so each Part
 *    that lands lights a notch. Levels still cost Parts AND Energy and the
 *    player taps to level (the server spends both); nothing auto-spends.
 *  - "Sign says 60, you're tracking ~42" only when real finished waits at this
 *    ride back the ratio (server, 5+ waits). Otherwise the posted number only.
 *    Once the wait passes the estimate, the estimate goes away: never a
 *    countdown that lies.
 *  - "X sharks in this line now" is a count from fresh nearby heartbeats.
 *  - Marathon (60+ minutes in line) and Night (after 8 PM) are small marks on
 *    the coin for how it was earned. Display only, not an item.
 *
 * Copy rules: no emoji, no em dashes, always positive about the park.
 */

/** Never draw more notches than this; longer steps draw a smooth arc. */
export const MAX_RING_NOTCHES = 14;
/** Local hour from which a wait counts as a Night wait. */
export const NIGHT_FROM_HOUR = 20;
/** Before this local hour it is still the night before. */
export const NIGHT_UNTIL_HOUR = 4;
export const MARATHON_SECONDS = 60 * 60;

export interface WaitCoinInput {
  readonly level: number;
  readonly maxLevel: number;
  readonly partsBanked: number;
  readonly partsToNext: number;
  readonly energyToNext: number;
  /** Null while unknown (offline before the profile loaded). */
  readonly playerEnergy: number | null;
  readonly nextTierName?: string | null;
}

export interface WaitCoinProgress {
  /** 0..1 ring fill toward the next level (1 when maxed). */
  readonly fill: number;
  /** Notches to draw (0 = smooth arc). */
  readonly notches: number;
  /** Notches lit. */
  readonly lit: number;
  readonly maxed: boolean;
  /** Parts cover the next level. */
  readonly partsReady: boolean;
  /** Parts and Energy both cover it: the coin offers a one-tap level up. */
  readonly ready: boolean;
  readonly energyShort: number;
  readonly label: string;
}

export function waitCoinProgress(input: WaitCoinInput): WaitCoinProgress {
  const maxLevel = Math.max(1, Math.round(input.maxLevel || 1));
  const level = Math.max(1, Math.min(maxLevel, Math.round(input.level || 1)));
  const banked = Math.max(0, Math.floor(input.partsBanked || 0));
  if (level >= maxLevel) {
    return { fill: 1, notches: 0, lit: 0, maxed: true, partsReady: false, ready: false, energyShort: 0,
      label: `Level ${level} · max level` };
  }
  const need = Math.max(1, Math.round(input.partsToNext || 1));
  const fill = Math.min(1, banked / need);
  const partsReady = banked >= need;
  const energyKnown = input.playerEnergy != null;
  const energyShort = energyKnown ? Math.max(0, Math.round(input.energyToNext) - Math.round(input.playerEnergy!)) : 0;
  const ready = partsReady && energyKnown && energyShort === 0;
  const next = input.nextTierName ? ` to ${input.nextTierName}` : ` to Level ${level + 1}`;
  const label = ready ? 'Ready to level up'
    : partsReady ? energyKnown ? `Parts ready · ${energyShort} more Energy` : 'Parts ready'
      : `${banked} of ${need} Parts${next}`;
  return {
    fill, notches: need <= MAX_RING_NOTCHES ? need : 0, lit: Math.min(banked, need),
    maxed: false, partsReady, ready, energyShort, label,
  };
}

export interface WaitEstimateInput {
  readonly postedMinutes: number | null;
  /** 'estimate' means no posted number existed at start. */
  readonly waitSource: 'posted' | 'last_known' | 'estimate';
  /** Median time-in-line over posted here (server); null without history. */
  readonly ratio: number | null;
  readonly elapsedSeconds: number;
}

export interface WaitEstimate {
  readonly posted: number | null;
  readonly tracking: number | null;
  /** Big line: "SIGN SAYS 60". */
  readonly title: string;
  /** Small line: "You're tracking ~42". */
  readonly detail: string;
  readonly accessibilityLabel: string;
}

export function waitEstimate(input: WaitEstimateInput): WaitEstimate {
  const posted = input.waitSource !== 'estimate' && input.postedMinutes != null && input.postedMinutes > 0
    ? Math.round(input.postedMinutes) : null;
  const elapsedMinutes = Math.max(0, input.elapsedSeconds) / 60;
  const ratio = input.ratio != null && Number.isFinite(input.ratio) && input.ratio > 0 ? input.ratio : null;
  const raw = posted != null && ratio != null ? Math.max(1, Math.round(posted * ratio)) : null;
  // Past the estimate it has nothing honest left to say.
  const tracking = raw != null && elapsedMinutes < raw ? raw : null;
  if (posted == null) {
    return { posted: null, tracking: null, title: 'NO SIGN TIME', detail: 'Your time in line still counts',
      accessibilityLabel: 'No posted wait for this ride right now.' };
  }
  const title = `SIGN SAYS ${posted}`;
  const detail = tracking != null && tracking < posted ? `You're tracking ~${tracking}`
    : tracking != null ? `Tracking ~${tracking} today`
      : 'Posted wait';
  return {
    posted, tracking, title, detail,
    accessibilityLabel: tracking != null
      ? `Posted wait ${posted} minutes. Recent waits here suggest about ${tracking} minutes.`
      : `Posted wait ${posted} minutes.`,
  };
}

export interface SharksInLine {
  readonly value: string;
  readonly label: string;
  readonly accessibilityLabel: string;
}

/** Null hides the stat (offline, older server, or the flag off). */
export function sharksInLine(count: number | null | undefined): SharksInLine | null {
  if (count == null || !Number.isFinite(count) || count < 1) return null;
  const n = Math.round(count);
  if (n === 1) return { value: '1', label: 'FIRST SHARK HERE', accessibilityLabel: 'You are the first shark in this line right now.' };
  const value = n > 999 ? '999+' : String(n);
  return { value, label: 'SHARKS IN LINE', accessibilityLabel: `${value} sharks in this line now.` };
}

/** "23m", "1h 05m". */
export function inLineLabel(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds / 60));
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return hours > 0 ? `${hours}h ${minutes.toString().padStart(2, '0')}m` : `${minutes}m`;
}

export type WaitStampKind = 'marathon' | 'night';

export interface WaitStamp {
  readonly kind: WaitStampKind;
  readonly label: string;
}

/** The small marks this wait has earned so far, Marathon first. */
export function waitStamps(elapsedSeconds: number, localHour: number): WaitStamp[] {
  const stamps: WaitStamp[] = [];
  if (elapsedSeconds >= MARATHON_SECONDS) stamps.push({ kind: 'marathon', label: 'MARATHON' });
  if (localHour >= NIGHT_FROM_HOUR || localHour < NIGHT_UNTIL_HOUR) stamps.push({ kind: 'night', label: 'NIGHT' });
  return stamps;
}

/** Parts this wait (timer Parts plus claimed bonus Parts), never negative. */
export function partsThisWait(creditedParts: number | null | undefined, bonusParts = 0): number {
  return Math.max(0, Math.floor(creditedParts ?? 0)) + Math.max(0, Math.floor(bonusParts));
}

/**
 * The coin's live balance. The server's banked count wins whenever it is
 * newer; offline, Parts the session credited since that count add on top.
 */
export function livePartsBanked(input: {
  readonly serverBanked: number | null;
  readonly cachedBanked: number | null;
  readonly creditedNow: number;
  readonly creditedAtCache: number;
}): number {
  if (input.serverBanked != null) return Math.max(0, input.serverBanked);
  const base = Math.max(0, input.cachedBanked ?? 0);
  return base + Math.max(0, input.creditedNow - input.creditedAtCache);
}
