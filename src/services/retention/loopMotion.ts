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
  /** The third segment fills faster: the full set's card grows out of the button as it completes. */
  fullRing: 260,
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
 * The full set (all three goals): the card opens with the ring's flash, three
 * gold checks bounce 120 ms apart on a rising tick, "All 3 done!" stamps, the
 * checks dive into the chest and it opens on the chest beats (momentBeats('chest')).
 * Third check landing to the lid: ring 400 + chestAt 640 + 420 + hit-stop 70, about 1.5 s.
 */
export const FULL_SET = {
  /** The gold glow on the map ring (capped by flashPeak). */
  flash: 220,
  /** From the ring completing to the card opening (handed off on the ring's own UI-thread clock). */
  sheetAt: 0,
  /** When the first check bounces (ms after the card opens). */
  checksAt: 120,
  /** Gap between the three check bounces. */
  checkStep: 120,
  /** Rising coin_tick ladder steps for the three bounces. */
  tickSteps: [0, 4, 8] as const,
  /** The "All 3 done!" ribbon stamping in. */
  ribbonAt: 400,
  /** The checks dive into the chest; its anticipation runs from here (momentBeats('chest')). */
  chestAt: 520,
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
  // A clear size ladder a kid can read across the room: 0.55, 0.7, 0.85, 1.0, 1.1, 1.2.
  if (d <= 0) return { tier: 'ember', scale: 0.55, sparks: 1, core: false, crown: false, halo: 0.22 };
  if (d < 3) return { tier: 'small', scale: 0.7, sparks: 1, core: false, crown: false, halo: 0.3 };
  if (d < 7) return { tier: 'medium', scale: 0.85, sparks: 2, core: false, crown: false, halo: 0.42 };
  if (d < 30) return { tier: 'big', scale: 1.0, sparks: 3, core: false, crown: false, halo: 0.55 };
  if (d < 100) return { tier: 'core', scale: 1.1, sparks: 4, core: true, crown: false, halo: 0.7 };
  return { tier: 'crown', scale: 1.2, sparks: 5, core: true, crown: true, halo: 0.82 };
}

/** The streak day each tier starts on (0 is the ember). */
export const FLAME_TIER_DAY: Readonly<Record<FlameTier, number>> = { ember: 0, small: 1, medium: 3, big: 7, core: 30, crown: 100 };

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

/**
 * Streak freezes (ms): an earned shield flies to its slot on an arc, lands on
 * the land spring and puffs six frost sparkles; a full shield glints every 6 s;
 * a freeze that saved the flame cracks its ice shell and the halves fall away.
 */
export const FREEZE_FX = {
  flyMs: 500,
  /** The shield lands big and springs into its slot. */
  landPop: 1.6,
  frost: 6,
  glintEveryMs: 6000,
  crackAt: 450,
  fallMs: 600,
} as const;

/**
 * Next Up: the bar toward the next level chest. Close (80 percent) shines and
 * peeks; very close (90 percent) wiggles; a gain surges; reaching it pops.
 */
export const NEXT_UP_FX = {
  shineEveryMs: 5000,
  wiggleEveryMs: 3000,
  reachPop: 1.4,
  surgeCue: 'fx.coin',
  reachCue: 'fx.reveal',
} as const;

/** How close the next chest is: far, close (80 percent), very close (90 percent). */
export function nextUpTease(pct: number): 'far' | 'close' | 'veryClose' {
  const p = Number(pct) || 0;
  if (p >= 0.9) return 'veryClose';
  if (p >= 0.8) return 'close';
  return 'far';
}

/** Welcome back after time away (ms): splash at 0, Finn at 200, cards from 500, 90 ms apart. */
export const WELCOME_FX = {
  minDaysAway: 3,
  /** Finn is on the first frame (art warmed with the loop art); he swims the last stretch in. */
  finnAt: 0,
  /** The flame ticks up one size step as a little welcome gift. */
  giftAt: 360,
  cardsAt: 500,
  cardStep: 90,
  cue: 'fx.reward',
} as const;

export type WelcomeCard =
  | { readonly kind: 'goals'; readonly text: string; readonly open: number; readonly done: number }
  | { readonly kind: 'chest'; readonly text: string }
  | { readonly kind: 'levelChest'; readonly text: string; readonly level: number }
  /** The flame (n days) kept by `freezes` freezes: drawn as the flame with its day number and one ice shield per freeze. */
  | { readonly kind: 'saved'; readonly text: string; readonly n: number; readonly freezes: number }
  | { readonly kind: 'flame'; readonly n: number; readonly text: string }
  | { readonly kind: 'ember'; readonly text: string };

/** The big word under each welcome picture (a number or one short word, zero reading needed). */
export function welcomeTileLabel(c: WelcomeCard): string {
  switch (c.kind) {
    case 'goals': return `${c.done} of 3`;
    case 'flame': return String(c.n);
    case 'saved': return String(c.n);
    case 'ember': return 'New!';
    case 'levelChest': return `Lv ${c.level}`;
    case 'chest': return 'Open!';
  }
}

/** Whole local days between two moments (calendar days on this phone), never negative. */
export function daysAway(lastOpenMs: number | null, nowMs: number): number {
  if (!lastOpenMs || !Number.isFinite(lastOpenMs) || lastOpenMs > nowMs) return 0;
  const a = new Date(lastOpenMs); const b = new Date(nowMs);
  const da = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const db = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((db - da) / 86400000);
}

/**
 * The "new since you left" cards, from real data only, at most three: today's
 * Daily 3, the flame told kindly (kept by a freeze, still going, or ready to
 * light again), and a chest that is waiting. No missed-day counts, no loss words.
 */
export function welcomeCards(s: Pick<DailyThreeState, 'goals' | 'streak'> | null | undefined, extra: { readonly levelChest?: number | null } = {}): WelcomeCard[] {
  const out: WelcomeCard[] = [];
  if (!s) return out;
  const open = s.goals.filter(g => !g.done).length;
  if (open > 0) out.push({ kind: 'goals', open, done: s.goals.length - open, text: open === 3 ? '3 new goals for today!' : `${open} goals left today!` });
  const days = Math.max(0, Number(s.streak?.days) || 0);
  const kept = Math.max(0, Number(s.streak?.freeze_saved) || 0);
  if (kept > 0 && days > 0) out.push({ kind: 'saved', n: days, freezes: Math.min(2, kept), text: `A freeze kept your ${days}-day flame!` });
  else if (days > 0) out.push({ kind: 'flame', n: days, text: `Your flame is at ${days}. Keep it growing!` });
  else out.push({ kind: 'ember', text: 'Light a new flame today!' });
  if (extra.levelChest) out.push({ kind: 'levelChest', level: extra.levelChest, text: `Your Level ${extra.levelChest} chest is waiting!` });
  else if (s.goals.some(g => g.kind === 'chest' && !g.done)) out.push({ kind: 'chest', text: 'Your daily chest is waiting!' });
  return out.slice(0, 3);
}

/** The shared small-moment tokens (src/ui/motion.ts), re-exported so loop code has one import. */
export { COUNT, HUD_BUMP, PRESS, STAGGER } from '../../ui/motion';

/**
 * The Daily 3 chest reveal rows: the first prize lands 240 ms after the lid,
 * then one every 150 ms (a held 380 ms before a hero card), and each number
 * rolls for at most COUNT.ms, so every row has landed and counted inside 1.2 s.
 */
export const REVEAL_ROWS = {
  first: 240, beat: 150, hold: 380, finishBy: 1200,
  /** The open chest stays big and centred on its full rays this long after the lid pops (the burst frame is the biggest). */
  heroHold: 300,
  /** The open chest glides up into its slot over this long (EASE.out), its rays riding along and receding. */
  glideMs: 320,
  /** The first prize lands this long after the glide starts (the chest is past 60 percent of the way by then). */
  firstAfterGlide: 110,
} as const;

/**
 * The lid's beat (ms after the open is asked for): the gather before the hit-stop. A level chest's lid
 * holds LEVEL_CHEST.holdMs after it auto-opens (or is tapped); the full Daily 3 set waits for its checks
 * to dive in, then the chest's own gather; a tapped chest gathers for the chest anticipation.
 */
export function lidDelay(o: { readonly dropIn?: boolean; readonly autoOpen?: boolean; readonly repeat?: boolean; readonly weekly?: boolean }): number {
  if (o.dropIn) return LEVEL_CHEST.holdMs;
  if (o.weekly) return 900;
  const gather = o.repeat ? REPEAT_CHEST.gatherMs : 420;
  return o.autoOpen ? FULL_SET.chestAt + gather : gather;
}

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
 * The level chest's anticipation (ms after the card opens): it drops in and
 * lands, three rattles that grow (8, 13, 18 deg) all inside 900 ms, light
 * leaking from the lid seam, a tap hand at 900 ms, and it opens by itself at
 * 1100 ms (its claim starts when the card opens), so the burst lands inside
 * 1.5 s even when nobody taps.
 */
export const LEVEL_CHEST = {
  /** Lands on SPRING.land, then the rattles start. */
  landMs: 260,
  rattles: [{ at: 0, deg: 8 }, { at: 220, deg: 13 }, { at: 440, deg: 18 }] as const,
  /** One rattle (a quick left-right-left). */
  rattleMs: 200,
  /** The tap ring appears (ms after the card opens). */
  handAt: 900,
  /** Opens by itself (ms after the card opens). */
  autoOpenAt: 1100,
  /** The lid's last held beat after the claim answers (ms). */
  holdMs: 200,
  /** Prize rows 180 ms apart. */
  rowBeat: 180,
} as const;

/**
 * After AWESOME: the card steps aside and every prize flies home in plain
 * sight. Each icon lifts off its own row and arcs to its HUD counter (coins
 * first, tickets 80 ms later, energy 160 ms later), 6 to 8 icons a kind, and
 * each landing bumps the counter with a tick. The next card waits only 300 ms
 * after the last landing (never the server).
 */
export const PRIZE_FLIGHT = {
  /** The card and ribbon shrink away together (EASE.in, exits faster than entrances). */
  exitMs: 180,
  /** Icons lift off their rows as the card starts to leave. */
  liftAt: 30,
  /** One icon's arc (EASE.inOut). */
  flyMs: 520,
  /** Between icons of one kind. */
  stepMs: 45,
  /** Coins first, then tickets, then energy. */
  kindGapMs: 80,
  /** The next card starts this long after the last icon lands (it grows out of the Daily 3 button as the counters settle). */
  nextAfterMs: 140,
  maxIcons: 8,
} as const;

export type FlightTarget = 'coins' | 'tickets' | 'energy';

/** Where a prize row lives on the HUD (XP, gear, boxes and freezes have their own homes). */
export function flightTarget(kind: string): FlightTarget | null {
  if (kind === 'coins' || kind === 'bonus_coins') return 'coins';
  if (kind === 'tickets') return 'tickets';
  if (kind === 'energy') return 'energy';
  return null;
}

/** How many icons fly for a prize: coins 8, energy 6, tickets one each (2 to 4). */
export function flightIcons(target: FlightTarget, amount: number): number {
  const n = Math.max(0, Math.floor(Number(amount) || 0));
  if (n <= 0) return 0;
  if (target === 'coins') return Math.min(PRIZE_FLIGHT.maxIcons, Math.max(4, n));
  if (target === 'energy') return Math.min(6, Math.max(3, n));
  return Math.min(4, Math.max(2, n));
}

export interface FlightLeg { readonly target: FlightTarget; readonly icons: number; readonly amount: number; readonly delay: number; readonly lastLand: number }

/** The flight plan for what the chest paid (merged per counter, in counter order), and when each lands. */
export function flightPlan(rows: readonly { readonly kind: string; readonly amount: number }[], has: (t: FlightTarget) => boolean): FlightLeg[] {
  const sums = new Map<FlightTarget, number>();
  for (const r of rows) {
    const t = flightTarget(r.kind);
    if (t && has(t)) sums.set(t, (sums.get(t) ?? 0) + Math.max(0, Number(r.amount) || 0));
  }
  const order: FlightTarget[] = ['coins', 'tickets', 'energy'];
  const out: FlightLeg[] = [];
  for (const t of order) {
    const amount = sums.get(t) ?? 0;
    const icons = flightIcons(t, amount);
    if (!icons) continue;
    const delay = PRIZE_FLIGHT.liftAt + out.length * PRIZE_FLIGHT.kindGapMs;
    out.push({ target: t, icons, amount, delay, lastLand: delay + (icons - 1) * PRIZE_FLIGHT.stepMs + PRIZE_FLIGHT.flyMs });
  }
  return out;
}

/** When the next card may start (ms after AWESOME): 300 ms after the last landing, or right after the exit. */
export function flightDoneMs(plan: readonly FlightLeg[]): number {
  const last = plan.reduce((m, l) => Math.max(m, l.lastLand), 0);
  return last > 0 ? last + PRIZE_FLIGHT.nextAfterMs : PRIZE_FLIGHT.exitMs + 120;
}

/**
 * The Daily 3 chest on repeat days: after the first three opens on this phone
 * the chest gathers for a shorter beat and rows land faster (still the same
 * four beats). About one chest in ten is a rare one: a gold beam and an extra
 * coin spill, picked from the claim date so it never changes on a reload.
 */
export const REPEAT_CHEST = { afterOpens: 3, gatherMs: 240, rowBeat: 110, first: 180, rareOneIn: 10, heroHold: 220 } as const;

export function isRepeatChest(opensOnThisPhone: number): boolean {
  return (Number(opensOnThisPhone) || 0) >= REPEAT_CHEST.afterOpens;
}

/** A small stable hash of the claim date and player: about 1 in 10 chests is rare. */
export function isRareChest(claimDate: string | null | undefined, playerId: number | string | null | undefined): boolean {
  if (!claimDate) return false;
  const key = `${claimDate}:${playerId ?? 0}`;
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % REPEAT_CHEST.rareOneIn) === 0;
}

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
  freezeEarn: { studio: 'sh_freeze', variant: 'sh_freeze', fallback: 'fx.reveal' },
  freezeSaved: { studio: 'sh_unfreeze', variant: 'sh_unfreeze', fallback: 'fx.reveal' },
} as const;

export type LoopCue = keyof typeof LOOP_CUES;
