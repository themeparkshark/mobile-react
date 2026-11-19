/**
 * Calm paid offers at natural moments (fix round w3, T220 and T230; Dustin's Nov 18 defaults).
 *
 * One decision for every placement, so no screen invents its own rules:
 * - the server's natural_offers switch is on for this player (read like daily_three);
 * - never on a loss card;
 * - never on a kid path: not while the crew is Family with kids, not while Picture games is on;
 * - at most once per placement per day, and the Starter Pack card once ever;
 * - a "Not now" is remembered (that placement rests for a week);
 * - VIP's line only for a player who is not VIP.
 * The card itself never shows a price: a grown-up answers the gate first, and the gate's details card
 * says the price (services/money/supplies.ts buyPack, components/GrownUpGate.tsx).
 *
 * Pure decisions plus a small AsyncStorage record ("money:natural-offers:v1@p<id>"). Tested in
 * tools/tests/shop-w3.test.cjs.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export type OfferPlacement = 'need_ticket' | 'first_win' | 'high_point' | 'win_vip';
export const OFFER_PLACEMENTS: readonly OfferPlacement[] = ['need_ticket', 'first_win', 'high_point', 'win_vip'];

export type OfferRecord = {
  /** The shop day ('YYYY-MM-DD') this placement last showed. */
  readonly day?: string | null;
  /** When it first showed (the Starter Pack card shows once ever). */
  readonly firstShownAt?: number | null;
  /** A "Not now" rests the placement until then. */
  readonly restUntil?: number | null;
};
export type OfferRecords = Partial<Record<OfferPlacement, OfferRecord>>;

/** A "Not now" rests that placement this long. */
export const DISMISS_REST_MS = 7 * 24 * 60 * 60 * 1000;

export type OfferWhy = 'show' | 'switch_off' | 'loss' | 'kids' | 'picture' | 'vip' | 'dismissed' | 'once' | 'today';

export type OfferContext = {
  readonly placement: OfferPlacement;
  readonly switchOn: boolean;
  /** The card this would sit on is a loss card. */
  readonly loss?: boolean;
  /** The current crew is Family with kids. */
  readonly familyWithKids?: boolean;
  /** Picture games only is on for this player. */
  readonly pictureGames?: boolean;
  readonly vip?: boolean;
  /** Today's shop day ('YYYY-MM-DD'). */
  readonly today: string;
  readonly now: number;
  readonly record?: OfferRecord | null;
};

/** May this placement show right now? The first rule that says no is the answer. */
export function offerDecision(c: OfferContext): OfferWhy {
  if (!c.switchOn) return 'switch_off';
  if (c.loss) return 'loss';
  if (c.familyWithKids) return 'kids';
  if (c.pictureGames) return 'picture';
  if (c.placement === 'win_vip' && c.vip) return 'vip';
  if (c.record?.restUntil && c.record.restUntil > c.now) return 'dismissed';
  if (c.placement === 'first_win' && c.record?.firstShownAt) return 'once';
  if (c.record?.day && c.record.day === c.today) return 'today';
  return 'show';
}

/** The record after the card really showed (with its content). */
export function markShown(record: OfferRecord | null | undefined, today: string, now: number): OfferRecord {
  return { ...record, day: today, firstShownAt: record?.firstShownAt ?? now };
}

/** The record after "Not now". */
export function markDismissed(record: OfferRecord | null | undefined, now: number): OfferRecord {
  return { ...record, restUntil: now + DISMISS_REST_MS };
}

/** Today's shop day in the parks' time zone ('YYYY-MM-DD'), when the catalog has not said it yet. */
export function localDay(now: number, timeZone = 'America/Los_Angeles'): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now));
  } catch {
    return new Date(now).toISOString().slice(0, 10);
  }
}

/**
 * The words on each card, calm and plain (no urgency, no price). Exported so tests hold them to the
 * no-pressure list.
 */
export const OFFER_COPY = {
  need_ticket: { kicker: 'Or ask a grown-up', title: 'Today’s Park Day Pack', action: 'Ask a grown-up' },
  first_win: { kicker: 'Nice win! For grown-ups', title: 'The Starter Pack', action: 'Ask a grown-up' },
  high_point: { kicker: 'For grown-ups', title: 'The Shark Pass', body: 'More prizes on every step you climb.', action: 'See the Shark Pass' },
  win_vip: { line: 'VIP doubles this' },
} as const;

const KEY = 'money:natural-offers:v1';
export function offerKey(playerId: number | string): string {
  return `${KEY}@p${playerId}`;
}

export function parseRecords(raw: string | null | undefined): OfferRecords {
  if (!raw) return {};
  try {
    const value = JSON.parse(raw) as unknown;
    if (!value || typeof value !== 'object') return {};
    const out: OfferRecords = {};
    for (const p of OFFER_PLACEMENTS) {
      const r = (value as Record<string, unknown>)[p];
      if (!r || typeof r !== 'object') continue;
      const rec = r as Record<string, unknown>;
      out[p] = {
        day: typeof rec.day === 'string' ? rec.day : null,
        firstShownAt: typeof rec.firstShownAt === 'number' ? rec.firstShownAt : null,
        restUntil: typeof rec.restUntil === 'number' ? rec.restUntil : null,
      };
    }
    return out;
  } catch {
    return {};
  }
}

export async function loadOfferRecords(playerId: number | string): Promise<OfferRecords> {
  try {
    return parseRecords(await AsyncStorage.getItem(offerKey(playerId)));
  } catch {
    return {};
  }
}

/**
 * Writes go one at a time: two placements on one screen (a win card with its VIP line and the
 * Starter Pack card) each read-modify-write the same record, and side by side the last write
 * would drop the other's "shown today".
 */
let writes: Promise<void> = Promise.resolve();

export function saveOfferRecord(playerId: number | string, placement: OfferPlacement, record: OfferRecord): Promise<void> {
  writes = writes.then(async () => {
    try {
      const all = await loadOfferRecords(playerId);
      await AsyncStorage.setItem(offerKey(playerId), JSON.stringify({ ...all, [placement]: record }));
    } catch {
      // A failed write only means the card may show once more; never a crash.
    }
  });
  return writes;
}
