/**
 * Queue Bonus Rounds, app side (queue-bonus.md section 7). Pure helpers with
 * no React or native imports so tools/tests can run them directly.
 *
 * THE LINE IS ALWAYS MOVING (Dustin). Nothing here pauses a game or locks
 * input because the guest walked. Movement only changes how loud a
 * celebration is: while moving, claims play compact and their haptics and
 * stings wait for a stop (or drop when more than 3 s late). The Part itself
 * is never delayed; only the celebration is.
 *
 * House rule for every reward FX: celebrate only on server confirmation, and
 * never replay an animation for a retried or replayed response (the seen-claim
 * set rides in the session checkpoint).
 */

import type {
  LineBonusClaim,
  LineBonusEncore,
  LineBonusSource,
  LineBonusSummary,
} from '../../api/endpoints/me/inline-timer/types';

/** Same as partCountdown: the server credits nearby time up to 90 s between samples. */
const ESTIMATE_WINDOW_MS = 90_000;

export type PipState = 'future' | 'open' | 'claimed';

/** Pips under the ring. Skipped and capped slots are not drawn: the row shrinks. */
export function visiblePips(bonus: LineBonusSummary | null | undefined): PipState[] {
  if (!bonus?.enabled) return [];
  return bonus.slots
    .filter(slot => slot.state !== 'hidden')
    .map(slot => slot.state === 'claimed' ? 'claimed' : slot.state === 'open' ? 'open' : 'future');
}

/** "Bonus Parts done at this ride today" replaces the pips. */
export function bonusDoneToday(bonus: LineBonusSummary | null | undefined): boolean {
  return Boolean(bonus?.enabled && bonus.coin_day_done);
}

export function hasOpenSlot(bonus: LineBonusSummary | null | undefined): boolean {
  return Boolean(bonus?.enabled && bonus.slots.some(slot => slot.state === 'open'));
}

/**
 * Seconds until the next slot's threshold, predicted between heartbeats the
 * same way the Part ring is. Null when no slot can still open. At 0 the gem
 * goes CHARGED; only the server's answer pops it.
 */
export function nextBonusSeconds(
  bonus: LineBonusSummary | null | undefined,
  verifiedSeconds: number,
  verifiedAt: number | null,
  now: number,
): number | null {
  const next = bonus?.enabled ? bonus.next_opens_at_eligible_seconds : null;
  if (next == null) return null;
  const age = verifiedAt == null ? Infinity : now - verifiedAt;
  const display = Math.max(0, Math.floor(verifiedSeconds)) +
    (age >= 0 && age <= ESTIMATE_WINDOW_MS ? Math.floor(age / 1000) : 0);
  return Math.max(0, next - display);
}

/**
 * When the predicted threshold arrives, force a heartbeat at +2 s and again
 * at +5 s so the server's pop lands within about 3 s.
 */
export function forcedHeartbeatDelaysMs(secondsUntilThreshold: number): readonly [number, number] {
  const base = Math.max(0, Math.floor(secondsUntilThreshold)) * 1000;
  return [base + 2_000, base + 5_000];
}

export type RingPill = 'BONUS OPEN' | 'WIN SAVED' | null;

/** The one pill on the ring. Never fractions. */
export function ringPill(bonus: LineBonusSummary | null | undefined): RingPill {
  if (!bonus?.enabled) return null;
  if (hasOpenSlot(bonus)) return 'BONUS OPEN';
  if (bonus.saved) return 'WIN SAVED';
  return null;
}

export function formatClock(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
}

export interface PickerBadge {
  readonly kind: 'bonus' | 'pays_later' | 'saved' | 'encore' | 'none';
  readonly text: string;
  /** Small reward line on the tile ("+10 XP") when a win pays Encore. */
  readonly reward: string | null;
}

/** What a verified game's tile promises right now (queue-bonus.md 7.4). */
export function pickerBadge(bonus: LineBonusSummary | null | undefined, secondsToNext: number | null): PickerBadge {
  if (!bonus?.enabled) return { kind: 'none', text: '', reward: null };
  const encoreXp = bonus.encore && bonus.encore.session_left > 0 && bonus.encore.park_day_left > 0
    ? bonus.encore.xp : bonus.encore?.floor_xp ?? 5;
  if (hasOpenSlot(bonus)) return { kind: 'bonus', text: 'BONUS', reward: '+1 RIDE PART' };
  if (bonus.saved) {
    return { kind: 'saved', reward: `+${encoreXp} XP`,
      text: secondsToNext != null ? `Win saved. Next bonus in ${formatClock(secondsToNext)}` : 'Win saved' };
  }
  if (secondsToNext != null) {
    return { kind: 'pays_later', text: `Win now. Part in ${formatClock(secondsToNext)}`, reward: '+1 RIDE PART' };
  }
  return { kind: 'encore', text: `ENCORE +${encoreXp} XP`, reward: `+${encoreXp} XP` };
}

export type BonusGameId = 'current_quest' | 'crew_puzzle';

/** The source that has not claimed this session goes first. */
export function pickerOrder(bonus: LineBonusSummary | null | undefined, available: readonly BonusGameId[]): BonusGameId[] {
  const claimed = new Set<LineBonusSource>((bonus?.slots ?? [])
    .filter(slot => slot.state === 'claimed' && slot.source).map(slot => slot.source as LineBonusSource));
  const hasClaimed = (id: BonusGameId) => id === 'crew_puzzle'
    ? claimed.has('crew_puzzle') || claimed.has('crew_assist') : claimed.has(id);
  return [...available].sort((a, b) => Number(hasClaimed(a)) - Number(hasClaimed(b)));
}

// ── seen claims (never replay FX) ─────────────────────────────────────────

export function claimKey(sessionId: string, claim: LineBonusClaim): string {
  return `${sessionId}:slot:${claim.index}`;
}

export interface NewBonusEvents {
  readonly claims: readonly LineBonusClaim[];
  readonly encores: readonly LineBonusEncore[];
  readonly perks: readonly { readonly kind: 'mastery' | 'queue_crew'; readonly parts: number }[];
  /** The seen set after these events. */
  readonly seen: readonly string[];
}

/**
 * Claims the player has not been shown yet. Slot claims are keyed by slot, so
 * a replayed response never celebrates twice. Encore and perk events are only
 * ever sent once by the server; the caller dedupes response objects.
 */
export function takeNewBonusEvents(sessionId: string, bonus: LineBonusSummary | null | undefined,
  seen: readonly string[]): NewBonusEvents {
  const known = new Set(seen);
  const claims: LineBonusClaim[] = [];
  for (const claim of bonus?.claimed_now ?? []) {
    const key = claimKey(sessionId, claim);
    if (known.has(key)) continue;
    known.add(key);
    claims.push(claim);
  }
  // A claim also shows as a solid pip; mark claimed slots seen so a later
  // snapshot (after a restart) never celebrates an old claim.
  for (const slot of bonus?.slots ?? []) {
    if (slot.state === 'claimed') known.add(`${sessionId}:slot:${slot.index}`);
  }
  return {
    claims,
    encores: [...(bonus?.encore_now ?? [])],
    perks: [...(bonus?.perks_now ?? [])],
    seen: Array.from(known).slice(-40),
  };
}

/** Line Party pentatonic ladder: C, D, E for slots 1, 2, 3 (the third note means done). */
export function absorbPitch(slotIndex: number): 'C' | 'D' | 'E' {
  return slotIndex <= 1 ? 'C' : slotIndex === 2 ? 'D' : 'E';
}

// ── movement: a signal, never a pause ────────────────────────────────────

/** Deferred celebrations older than this are dropped, not played late. */
export const DEFERRED_FX_MAX_MS = 3_000;

export interface DeferredFx<T> {
  readonly at: number;
  readonly fx: T;
}

/**
 * While the line moves, haptics and stings wait. When movement stops they
 * fire, unless they are more than 3 s late. Pure: the caller plays them.
 */
export class MovementFxGate<T> {
  private moving = false;
  private queue: DeferredFx<T>[] = [];

  isMoving(): boolean {
    return this.moving;
  }

  /** 'play' now, or 'deferred' until movement stops. */
  offer(fx: T, now: number): 'play' | 'deferred' {
    if (!this.moving) return 'play';
    this.queue.push({ at: now, fx });
    return 'deferred';
  }

  /** Returns the celebrations to play now (only on a moving to still change). */
  setMoving(moving: boolean, now: number): T[] {
    const wasMoving = this.moving;
    this.moving = moving;
    if (!wasMoving || moving) return [];
    const due = this.queue.filter(item => now - item.at <= DEFERRED_FX_MAX_MS).map(item => item.fx);
    this.queue = [];
    return due;
  }
}

export interface MotionSample {
  readonly timestamp: number;
  readonly speedMps?: number | null;
  readonly accuracyMeters?: number | null;
}

/** Walking pace from the OS speed; anything slower is standing in line. */
export const MOVING_SPEED_MPS = 0.5;
/** "Line moving. Eyes up." leaves this long after movement stops. */
export const MOVING_CHIP_LINGER_MS = 1_500;
export const EXIT_SPEED_MPS = 2.0;
export const EXIT_SPEED_MS = 20_000;

/** A fresh fix says the guest is walking (a moving queue). Display only. */
export function isWalkingSample(sample: MotionSample): boolean {
  return typeof sample.speedMps === 'number' && sample.speedMps >= MOVING_SPEED_MPS &&
    sample.speedMps <= EXIT_SPEED_MPS;
}

/**
 * Leaving the line: GPS speed above 2 m/s sustained for 20 s, across at
 * least two accurate fixes. One spike never counts, and walking in the queue
 * (well under 2 m/s) can never trigger it.
 */
export class ExitSpeedDetector {
  private fastSince: number | null = null;
  private fastFixes = 0;

  /** True once the guest has left the line. */
  feed(sample: MotionSample): boolean {
    const accurate = typeof sample.accuracyMeters !== 'number' || sample.accuracyMeters <= 20;
    if (!accurate || typeof sample.speedMps !== 'number') return this.left();
    if (sample.speedMps > EXIT_SPEED_MPS) {
      this.fastSince ??= sample.timestamp;
      this.fastFixes += 1;
    } else {
      this.fastSince = null;
      this.fastFixes = 0;
    }
    return this.left(sample.timestamp);
  }

  reset(): void {
    this.fastSince = null;
    this.fastFixes = 0;
  }

  private left(now?: number): boolean {
    return this.fastSince != null && this.fastFixes >= 2 && now != null && now - this.fastSince >= EXIT_SPEED_MS;
  }
}

// ── recap ────────────────────────────────────────────────────────────────

export interface RecapRewardsInput {
  readonly parts: number;
  readonly liveParts?: number | null;
  readonly bonusRoundParts?: number | null;
  readonly masteryBonusParts?: number | null;
  readonly crewPuzzleBonusParts?: number | null;
  readonly currentQuestBonusParts?: number | null;
  readonly encoreXp?: number | null;
  readonly encoreEnergy?: number | null;
  readonly bonusParkDayUsed?: number | null;
  readonly bonusParkDayCap?: number | null;
}

export interface RecapRow {
  readonly key: 'wait' | 'bonus' | 'mastery' | 'encore';
  readonly label: string;
  readonly value: string;
}

/** Rows tick in this order: Wait Parts, Bonus Parts, Mastery (if earned), Encore (if earned). */
export function recapRows(input: RecapRewardsInput): RecapRow[] {
  const bonus = Math.max(0, input.bonusRoundParts ?? 0);
  const mastery = Math.max(0, input.masteryBonusParts ?? 0);
  const legacy = bonus > 0 ? 0 : Math.max(0, input.crewPuzzleBonusParts ?? 0) + Math.max(0, input.currentQuestBonusParts ?? 0);
  const wait = input.liveParts != null ? Math.max(0, input.liveParts)
    : Math.max(0, input.parts - bonus - mastery - legacy);
  const rows: RecapRow[] = [{ key: 'wait', label: 'Wait Parts', value: `x${wait}` }];
  if (bonus + legacy > 0 || input.bonusRoundParts != null) {
    rows.push({ key: 'bonus', label: 'Bonus Parts', value: `x${bonus + legacy}` });
  }
  if (mastery > 0) rows.push({ key: 'mastery', label: 'Mastery', value: `x${mastery}` });
  const xp = Math.max(0, input.encoreXp ?? 0);
  const energy = Math.max(0, input.encoreEnergy ?? 0);
  if (xp > 0 || energy > 0) {
    rows.push({ key: 'encore', label: 'Encore', value: [xp > 0 ? `+${xp} XP` : '', energy > 0 ? `+${energy} ENERGY` : '']
      .filter(Boolean).join('  ') });
  }
  return rows;
}

/** Small park-day line, only on the recap: "Bonus today: 5 of 12". */
export function parkDayLine(input: RecapRewardsInput): string | null {
  if (input.bonusParkDayCap == null || input.bonusParkDayUsed == null) return null;
  return `Bonus today: ${Math.max(0, input.bonusParkDayUsed)} of ${Math.max(0, input.bonusParkDayCap)}`;
}

/** Ring info sheet copy (the card itself carries only the ring, the row and one CTA). */
export function ringInfoCopy(intervalSeconds: number, sessionCap: number, bonusEnabled: boolean): string {
  const minutes = Math.max(1, Math.round(intervalSeconds / 60));
  const base = `You get 1 Ride Part every ${minutes} minutes near the ride, up to ${sessionCap} per wait.`;
  return bonusEnabled ? `${base} Win bonus games for up to 3 more.` : base;
}
