/**
 * The daily loops' motion and copy rules (Daily 3 check-off, the full set,
 * the growing flame, streak milestones, the "come back tomorrow" card).
 * Pure data and pure rules (no React, no Reanimated), so it is unit tested
 * (tools/tests/retention-loop-motion.test.cjs). Timings sit on the app's one
 * motion language (src/ui/motion.ts): every big moment gathers, holds, bursts
 * and settles, pays off inside 1.5 s and settles inside 2.6 s.
 */
import type { DailyThreeState } from '../../api/endpoints/retention';

/**
 * Daily 3 check-off on the map (ms). A check flies from the shark to the
 * Daily 3 button on an arc, the ring fills one third, the check draws itself
 * and stamps, and a little "1 of 3" bubble says how far along you are.
 */
export const CHECK = {
  /** The check's flight from the shark to the button (EASE.inOut). */
  fly: 500,
  /** One ring segment filling (EASE.out). */
  ring: 400,
  /** The check drawing itself as a stroke. */
  draw: 260,
  /** How long the "1 of 3" bubble stays up after it pops in. */
  bubble: 1600,
  /** Sparkles on arrival (one goal). */
  sparkles: 6,
  /** Sparkles when the third goal lands. */
  fullSparkles: 12,
} as const;

/**
 * The full set (all three goals): the sheet opens, the three checks bounce
 * 120 ms apart on a rising tick, "All 3 done!" stamps, and the chest opens on
 * the chest beats (momentBeats('chest')).
 */
export const FULL_SET = {
  /** The white ring flash on the map button (capped by flashPeak). */
  flash: 220,
  /** From the ring completing to the sheet opening (the flash is still fading). */
  sheetAt: 120,
  /** When the first check bounces (ms after the sheet opens). */
  checksAt: 300,
  /** Gap between the three check bounces. */
  checkStep: 120,
  /** Rising coin_tick ladder steps for the three bounces. */
  tickSteps: [0, 4, 8] as const,
  /** The "All 3 done!" ribbon stamping in. */
  ribbonAt: 700,
  /** The chest takes over (anticipation starts). */
  chestAt: 900,
} as const;

/** Streak milestones that get their own full-screen moment. */
export const STREAK_MILESTONES = [3, 7, 30, 100] as const;

export type FlameTier = 'ember' | 'small' | 'medium' | 'big' | 'core' | 'crown';

export interface FlameLook {
  readonly tier: FlameTier;
  /** Flame art scale (1 = the base icon size). Only grows with the streak. */
  readonly scale: number;
  /** Drifting sparks around the flame (ambient, capped). */
  readonly sparks: number;
  /** A white-gold hot core inside the flame. */
  readonly core: boolean;
  /** A gold crown rides the flame. */
  readonly crown: boolean;
  /** How strong the warm halo behind it glows (0..1). */
  readonly halo: number;
}

/**
 * The flame grows with the streak so a kid can see it from across the room:
 * 1 to 2 days small, 3 to 6 medium, 7 to 29 big with sparks, 30 to 99 a
 * white-gold core, 100 and up a crown. 0 is a warm ember (never sad).
 */
export function flameLook(days: number): FlameLook {
  const d = Math.max(0, Math.floor(Number(days) || 0));
  if (d <= 0) return { tier: 'ember', scale: 0.72, sparks: 0, core: false, crown: false, halo: 0.18 };
  if (d < 3) return { tier: 'small', scale: 0.84, sparks: 0, core: false, crown: false, halo: 0.3 };
  if (d < 7) return { tier: 'medium', scale: 0.96, sparks: 1, core: false, crown: false, halo: 0.42 };
  if (d < 30) return { tier: 'big', scale: 1.08, sparks: 3, core: false, crown: false, halo: 0.55 };
  if (d < 100) return { tier: 'core', scale: 1.16, sparks: 4, core: true, crown: false, halo: 0.68 };
  return { tier: 'crown', scale: 1.22, sparks: 5, core: true, crown: true, halo: 0.8 };
}

/** The next flame size up and how many days away it is, or null past 100. */
export function nextFlameSize(days: number): { readonly day: number; readonly away: number; readonly name: string } | null {
  const d = Math.max(0, Math.floor(Number(days) || 0));
  const next = STREAK_MILESTONES.find(m => m > d);
  if (!next) return null;
  const name = next === 3 ? 'a bigger flame' : next === 7 ? 'the big flame' : next === 30 ? 'the white-hot flame' : 'the crown flame';
  return { day: next, away: next - d, name };
}

/** "3 more days to the big flame" (always a goal, never a threat). */
export function nextFlameLine(days: number): string | null {
  const n = nextFlameSize(days);
  if (!n) return 'Your crown flame keeps growing!';
  return n.away === 1 ? `1 more day to ${n.name}!` : `${n.away} more days to ${n.name}`;
}

export type FlameMoment = { readonly kind: 'none' } | { readonly kind: 'plusOne'; readonly from: number; readonly to: number }
  | { readonly kind: 'milestone'; readonly day: number; readonly from: number };

/**
 * Which flame moment to play after a reveal or on opening the map: the streak
 * counted today and grew past what this phone last celebrated. A milestone
 * plays only on the day the streak lands on it; otherwise a +1. A phone that
 * has never seen a flame (new install) just records it: no fake celebration.
 */
export function flameMomentFor(lastSeen: number | null, days: number, countedToday: boolean): FlameMoment {
  const d = Math.max(0, Math.floor(Number(days) || 0));
  if (!countedToday || d <= 0) return { kind: 'none' };
  if (lastSeen === null) return d === 1 ? { kind: 'plusOne', from: 0, to: 1 } : { kind: 'none' };
  if (d <= lastSeen) return { kind: 'none' };
  if ((STREAK_MILESTONES as readonly number[]).includes(d)) return { kind: 'milestone', day: d, from: lastSeen };
  return { kind: 'plusOne', from: Math.max(0, d - 1), to: d };
}

/** The big streak moment's haptic: a finisher for 3 and 7, the full KO roll for 30 and 100. */
export function milestoneHaptic(day: number): 'finisher' | 'ko' {
  return day >= 30 ? 'ko' : 'finisher';
}

/**
 * The flame row under a milestone badge, so it reads with zero words: 3 and 7
 * show that many flames, 30 shows three rows of ten, 100 shows ten flames under a crown.
 */
export function milestoneFlames(day: number): { readonly rows: number; readonly perRow: number; readonly crown: boolean } {
  if (day >= 100) return { rows: 1, perRow: 10, crown: true };
  if (day >= 30) return { rows: 3, perRow: 10, crown: false };
  return { rows: 1, perRow: Math.max(1, Math.min(10, day)), crown: false };
}

/** The milestone badge copy: short, glad, no loss words. */
export function milestoneBadge(day: number): string {
  return `${day} days in a row!`;
}

/**
 * The rule for every loop moment's copy: no loss, guilt or rush words. Kids are
 * never told they "lost" or "broke" anything and never told to hurry.
 */
const LOSS_WORDS = /\b(lost|lose|losing|broke|broken|break|gone|dead|died|die|fail|failed|ruin|ruined|hurry|last chance|expires?|expiring|don'?t miss|sad|too late)\b/i;

export function kidSafeCopy(text: string): boolean {
  return !LOSS_WORDS.test(text);
}

export interface TomorrowPrize {
  /** A present (the Daily 3 chest), or gear when tomorrow is a milestone day. */
  readonly kind: 'gear' | 'chest' | 'flame';
  /** Tomorrow's streak number for the ghost flame. */
  readonly flameNext: number;
  /** Real reward chips for tomorrow's Daily 3 chest (zeros dropped). */
  readonly chips: readonly { readonly icon: 'coins' | 'ticket' | 'energy' | 'xp'; readonly n: number }[];
  /** The headline (kid-short). */
  readonly line: string;
}

/**
 * What waits tomorrow, from the server's numbers only: tomorrow's Daily 3
 * chest (its real reward), gear when tomorrow lands on a streak milestone,
 * and the flame at N+1. Unknown reward: the flame alone.
 */
export function tomorrowPrize(s: Pick<DailyThreeState, 'reward' | 'streak' | 'done'> | null | undefined): TomorrowPrize {
  const days = Math.max(0, Number(s?.streak?.days) || 0);
  const flameNext = s?.done ? days + 1 : Math.max(1, days + 1);
  const r = s?.reward;
  const chips = r ? ([
    { icon: 'coins', n: Number(r.coins) || 0 }, { icon: 'ticket', n: Number(r.tickets) || 0 },
    { icon: 'energy', n: Number(r.energy) || 0 }, { icon: 'xp', n: Number(r.xp) || 0 },
  ] as const).filter(c => c.n > 0) : [];
  const m = s?.streak?.next_milestone;
  if (m && m.days_away === 1 && (m.gear || m.mystery_boxes > 0)) {
    return { kind: 'gear', flameNext, chips, line: 'Come back tomorrow for new gear!' };
  }
  if (chips.length) return { kind: 'chest', flameNext, chips, line: 'Come back tomorrow for this!' };
  return { kind: 'flame', flameNext, chips, line: `Come back tomorrow for Day ${flameNext}!` };
}

/** One point on the check's flight arc (quadratic bezier, lifted toward the top of the screen). */
export function arcPoint(t: number, from: { x: number; y: number }, to: { x: number; y: number }, lift: number): { x: number; y: number } {
  'worklet';
  const cx = (from.x + to.x) / 2;
  const cy = Math.min(from.y, to.y) - lift;
  const u = 1 - t;
  return { x: u * u * from.x + 2 * u * t * cx + t * t * to.x, y: u * u * from.y + 2 * u * t * cy + t * t * to.y };
}

/** The shared small-moment tokens (src/ui/motion.ts), re-exported so loop code has one import. */
export { COUNT, HUD_BUMP, PRESS, STAGGER } from '../../ui/motion';

/**
 * The Daily 3 chest reveal rows: the first prize lands 240 ms after the lid,
 * then one every 150 ms (a held 380 ms before a hero card), and each number
 * rolls for at most COUNT.ms, so every row has landed and counted inside 1.2 s.
 */
export const REVEAL_ROWS = { first: 240, beat: 150, hold: 380, finishBy: 1200 } as const;

/** How long a row's number rolls when it lands at `startMs` (never past REVEAL_ROWS.finishBy, never under 260 ms). */
export function rowCountMs(startMs: number, countMs: number = 650): number {
  return Math.max(260, Math.min(countMs, REVEAL_ROWS.finishBy - startMs));
}

/** The first number a rolling count shows: never "+0", about a third of the way there. */
export function countStart(target: number): number {
  const t = Math.max(0, Math.floor(Number(target) || 0));
  if (t <= 1) return t;
  return Math.max(1, Math.round(t * 0.35));
}

/**
 * The level chest's anticipation (ms after it lands): three rattles that grow
 * (8, 13, 18 deg), light leaking from the lid seam, then a tap hand. It opens
 * by itself 2 s after landing if the kid does not tap.
 */
export const LEVEL_CHEST = {
  /** Lands on SPRING.land, then the rattles start. */
  landMs: 420,
  rattles: [{ at: 0, deg: 8 }, { at: 380, deg: 13 }, { at: 760, deg: 18 }] as const,
  /** One rattle (a quick left-right-left). */
  rattleMs: 240,
  /** The hand appears after the last rattle. */
  handAt: 1000,
  /** Opens by itself this long after landing. */
  autoOpenAt: 2000,
  /** Prize rows 180 ms apart. */
  rowBeat: 180,
} as const;

/**
 * After the Daily 3 chest: what plays next. The +1 lives inside the chest card
 * (its footer flame grows), so a normal day is one tap. A full-screen flame
 * only for 3, 7, 30 and 100. The tomorrow card only the first time, or when
 * tomorrow brings gear or a milestone. Never more than two cards after the chest.
 */
export function dailyChain(o: {
  readonly moment: FlameMoment;
  readonly prize: TomorrowPrize;
  /** This phone has shown the tomorrow card before. */
  readonly tomorrowSeen: boolean;
  /** Days to the next streak milestone (from the server), if known. */
  readonly milestoneAway?: number | null;
}): ('flame' | 'tomorrow')[] {
  const out: ('flame' | 'tomorrow')[] = [];
  if (o.moment.kind === 'milestone') out.push('flame');
  const eve = o.prize.kind === 'gear' || o.milestoneAway === 1;
  if (!o.tomorrowSeen || eve) out.push('tomorrow');
  return out;
}

/** The reminders ask may follow a daily chain only when the chain was the chest alone (never stacked nudges). */
export function mayAskAfterChain(chain: readonly string[]): boolean {
  return chain.length === 0;
}

/**
 * Sound for each loop moment: the studio cue to use once the wow-sound switch
 * is approved, and the sound the app plays today (Chris bank). With the
 * switch off the app plays exactly the fallback.
 */
export const LOOP_CUES = {
  checkLand: { studio: 'sh_stamp', variant: 'sh_ding', fallback: 'ui.confirm' },
  checkFly: { studio: 'sh_whoosh', variant: 'sh_whoosh', fallback: 'fx.whoosh' },
  fullSet: { studio: 'sh_crowd_cheer', variant: 'sh_popper', fallback: 'fx.reward' },
  checkBounce: { studio: 'coin_tick', variant: 'coin_tick', fallback: 'fx.coinTick' },
  flameUp: { studio: 'tv_flame_ignite', variant: 'sh_powerup', fallback: 'fx.reveal' },
  milestone: { studio: 'sting_new_record', variant: 'sh_crowd_cheer', fallback: 'fx.reward' },
  tomorrow: { studio: 'sh_glock', variant: 'sh_glock', fallback: 'ui.select' },
} as const;

export type LoopCue = keyof typeof LOOP_CUES;
