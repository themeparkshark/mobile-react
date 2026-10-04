/**
 * Pin Trading: pure logic for the trading board, the hold timer and the swap.
 *
 * How trading works (server rules, unchanged): the board shows up to 15 pins
 * other players put up for trade. Tapping one holds it for you for a short
 * time (2 minutes on the server). You give one of your own tradeable pins and
 * take the board pin; your pin goes up on the board for someone else. There is
 * no player name, no chat and no free text anywhere in this flow, and only a
 * signed-in player can trade (PermissionEnums.TradePins).
 */
import type { ItemType } from '../../models/item-type';
import type { PinSwapType } from '../../models/pin-swap-type';
import type { GameIconName } from '../../ui/iconNames';

/** Under this many seconds the timer turns red and pulses. */
export const HOLD_URGENT_S = 30;
/** Under this many seconds every second ticks (a light haptic). */
export const HOLD_FINAL_S = 5;
/** The server hold length, used only if the server sends no held_from. */
export const DEFAULT_HOLD_MS = 120_000;

export type TimerTone = 'calm' | 'urgent' | 'expired';

/** Whole seconds left before a local deadline (never negative). Rounds up, so 0:01 shows until it truly ends. */
export function secondsLeft(deadline: number, now: number): number {
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}

/** m:ss, the readable clock on the hold timer. */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function timerTone(seconds: number): TimerTone {
  if (seconds <= 0) return 'expired';
  return seconds <= HOLD_URGENT_S ? 'urgent' : 'calm';
}

/**
 * The hold length from the server's own two timestamps, so a phone clock that
 * is minutes off can never show a wrong countdown. The local deadline is then
 * "now + length" from the moment the hold answered (a little early, never late).
 */
export function holdLengthMs(heldFrom: string | null | undefined, heldTo: string | null | undefined): number {
  const from = heldFrom ? Date.parse(heldFrom) : NaN;
  const to = heldTo ? Date.parse(heldTo) : NaN;
  if (Number.isFinite(from) && Number.isFinite(to) && to > from) return Math.min(to - from, 10 * 60_000);
  return DEFAULT_HOLD_MS;
}

/** A stable tilt for a pin (degrees), so the board looks hand-pinned and never reshuffles on re-render. */
export function pinTilt(id: number, max = 7): number {
  const x = Math.sin(id * 12.9898 + 78.233) * 43758.5453;
  const unit = x - Math.floor(x); // 0..1
  const signed = unit * 2 - 1; // -1..1
  // Keep at least 2 degrees, so no pin sits dead straight next to a tilted one.
  const deg = Math.sign(signed || 1) * (2 + Math.abs(signed) * (max - 2));
  return Math.round(deg * 10) / 10;
}

/** A backer-card tilt: smaller than the pin's, and the other way, so card and pin read as two objects. */
export function cardTilt(id: number): number {
  return Math.round(-pinTilt(id + 101, 3) * 10) / 10;
}

export function pinName(item: Pick<ItemType, 'name' | 'display_name'>): string {
  return (item.display_name || item.name || 'Pin').trim();
}

/** Pages of /me/pins appended in order, without repeats. */
export function mergePins(current: readonly ItemType[], page: readonly ItemType[]): ItemType[] {
  const seen = new Set(current.map(item => item.id));
  return [...current, ...page.filter(item => !seen.has(item.id) && (seen.add(item.id), true))];
}

/** Pins you could give for this board pin (never the same pin). */
export function givablePins(pins: readonly ItemType[], boardItemId: number): ItemType[] {
  return pins.filter(item => item.id !== boardItemId);
}

/** Only what the screen needs from a swap: the board never keeps who posted it. */
export function boardEntry(swap: PinSwapType): PinSwapType {
  return { id: swap.id, pin: swap.pin, held_from: swap.held_from, held_to: swap.held_to };
}

export type TradeErrorKind = 'taken' | 'owned' | 'network' | 'generic';

type HttpLike = { response?: { status?: number; data?: { message?: string } }; message?: string; code?: string };

/** Turns a failed hold or trade into one of four kid-readable cases. */
export function classifyTradeError(error: unknown): TradeErrorKind {
  const e = (error ?? {}) as HttpLike;
  const status = e.response?.status;
  const message = (e.response?.data?.message ?? '').toLowerCase();
  if (!e.response) return 'network';
  if (status === 422 && /already (purchased|have|own)/.test(message)) return 'owned';
  if (status === 403 || status === 404 || status === 409 || /unavailable|already been accepted|held/.test(message)) return 'taken';
  return 'generic';
}

export const PIN_TRADE_COPY = {
  boardEyebrow: 'Trading board',
  boardTitle: 'Swap pins with the board',
  steps: [
    { icon: 'pin' as GameIconName, label: 'Pick a pin' },
    { icon: 'swap' as GameIconName, label: 'Give one of yours' },
    { icon: 'gift' as GameIconName, label: "It's yours!" },
  ],
  boardCount: (n: number) => (n === 1 ? '1 pin up for trade' : `${n} pins up for trade`),
  shuffle: 'New pins',
  shuffleHint: 'Loads a fresh set of pins on the board',
  emptyTitle: 'The board is empty',
  emptyMessage: 'New pins land here all the time. Check back soon!',
  emptyAction: 'Check again',
  get: 'You get',
  give: 'You give',
  pickPrompt: 'Pick one of your pins',
  pickFirst: 'Tap one of your pins',
  yourPin: 'Your pin',
  noPinsTitle: 'No pins to trade yet',
  noPinsMessage: 'Collect pins around the parks, then come back to swap.',
  backToBoard: 'Back to board',
  notNow: 'Not now',
  confirmMessage: (give: string, get: string) => `Give your ${give} for the ${get}?`,
  confirmLabel: 'Yes, trade!',
  confirmBack: 'Wait, go back',
  expiredTitle: 'Time ran out',
  expiredMessage: 'The pin went back on the board.',
  holdAgain: 'Try again',
  takenMessage: 'Someone got this pin first. Pick another one!',
  failedTitle: "Trade didn't go through",
  failedMessage: 'Your pins are safe. Give it another try.',
  tryAgain: 'Try again',
  doneTitle: 'Pin traded!',
  doneMessage: (got: string) => `You got the ${got}!`,
  doneAction: 'Awesome!',
  doneGave: (gave: string) => `Your ${gave} is on the board for another fan.`,
  newStamp: 'New!',
  gotIt: 'Got it',
  fromYou: 'From you',
  hurry: 'Hurry!',
  noPinsHint: 'You need a pin of your own to trade. Collect pins around the parks!',
  takenTitle: 'Pin is taken',
  ownedTitle: 'You have this one',
  ownedMessage: "Pick a pin you don't have yet.",
  networkTitle: 'No connection',
  networkMessage: 'Check your connection and try again.',
  genericTitle: 'Something went wrong',
  genericMessage: 'Try again in a moment.',
  signedOutTitle: 'Sign in to trade pins',
  signIn: 'Sign in',
} as const;

export type TradePhase = 'loading' | 'picking' | 'confirming' | 'sending' | 'expired' | 'failed' | 'taken';

/** Phases where the pin is still held for you (leaving lets it go back on the board). */
export function isHolding(phase: TradePhase): boolean {
  return phase === 'loading' || phase === 'picking' || phase === 'confirming' || phase === 'failed';
}

export type StatusChip = { readonly label: string; readonly icon: GameIconName; readonly tone: 'gold' | 'blue' | 'red' | 'green' };

/** The status chip on the trade sheet for each phase. `hurry` turns the picking chip red under 30 s. */
export function statusChip(phase: TradePhase, hurry = false): StatusChip {
  switch (phase) {
    case 'confirming': return hurry ? { label: 'Hurry!', icon: 'timer', tone: 'red' } : { label: 'Ready to trade', icon: 'swap', tone: 'blue' };
    case 'sending': return { label: 'Trading', icon: 'swap', tone: 'blue' };
    case 'expired': return { label: "Time's up", icon: 'timer', tone: 'red' };
    case 'failed': return { label: 'Not traded', icon: 'close', tone: 'red' };
    case 'taken': return { label: 'Taken', icon: 'lock', tone: 'red' };
    default: return hurry ? { label: 'Hurry!', icon: 'timer', tone: 'red' } : { label: 'On hold for you', icon: 'lock', tone: 'gold' };
  }
}

/**
 * Two-line names break near the middle ("Astronaut / Shark Pin"), never
 * leaving "Pin" alone on the second line. Short names stay on one line.
 */
export function balanceName(name: string, oneLine = 14): string {
  const words = name.split(/\s+/).filter(Boolean);
  if (name.length <= oneLine || words.length < 2) return name;
  let best = 1;
  let bestDiff = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' ').length;
    const b = words.slice(i).join(' ').length;
    const diff = Math.abs(a - b) + (b < 5 ? 100 : 0);
    if (diff < bestDiff) { bestDiff = diff; best = i; }
  }
  return `${words.slice(0, best).join(' ')}\n${words.slice(best).join(' ')}`;
}

/**
 * Trade-complete timeline (ms). Sounds and haptics fire on these marks, the
 * same marks the Reanimated timings use, so audio, haptic and motion land together.
 */
export const SWAP_TIMELINE = {
  /** Both pins pop up out of their slots. */
  lift: 0,
  /** They start to travel (the riser swells into the cross). */
  travel: 180,
  /** They meet: flash, sparks, pop. */
  cross: 520,
  /** The new pin hits the centre at full speed: squash, shake, rays, confetti, jingle. */
  land: 880,
  /** Words after the pin: the eye lands on the pin first. */
  title: 1000,
  button: 1400,
} as const;

/** Haptics fire this long after their sound starts, so the buzz never leads the audio. */
export const HAPTIC_AFTER_AUDIO_MS = 50;
