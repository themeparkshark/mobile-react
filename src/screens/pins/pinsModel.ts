/**
 * Pins v2 (dustin-feedback-oct8/pins/DECISION.md): the data the Pins page
 * reads from GET /pins/home, and the small pure rules the screen and tests
 * share. The server decides everything that matters (rolls, odds, pity,
 * trade rules); this file only shapes it for the screen.
 *
 * Three shelves:
 * - Park Sets: earned in person at the parks, never tradable (gold seal).
 * - Mystery boxes: series of pins with one gold chaser, odds always shown.
 * - My Pins: everything you own, with the trade badge on tradable pins.
 */

export type PinKind = 'park' | 'seasonal' | 'event' | 'mystery' | 'shop';

export interface PinRow {
  readonly item_id: number;
  readonly pin_id?: number;
  readonly name: string;
  readonly icon_url: string | null;
  readonly icon_thumb_url?: string | null;
  readonly owned: boolean;
  /** Spare copies you can trade away and keep your own ("traders"). */
  readonly spares: number;
  readonly kind: PinKind;
  readonly tradable: boolean;
  readonly is_chaser?: boolean;
  /** Chance per box in basis points (700 = 7%). Mystery pins only. */
  readonly chance_bp?: number;
  /** Park pins: how often it hides as Pin of the Day (rare = fewer days). */
  readonly rarity?: 'common' | 'uncommon' | 'rare';
  /** Chasers: your lowest serial number for this pin (#3), the flex. */
  readonly serial?: number | null;
  /** Park pins you caught: the park day and your finder order that day (#1 = first). */
  readonly found?: { day: string; order: number } | null;
}

export interface PinDay {
  readonly park_id: number;
  readonly park_name: string;
  readonly status: 'hunt' | 'caught' | 'none';
  readonly here: boolean;
}

export interface HuntStatus {
  readonly status: 'off' | 'none' | 'hunt' | 'caught';
  readonly park_id?: number;
  readonly here?: boolean;
  readonly warmth?: 'here' | 'hot' | 'warm' | 'cold' | null;
  readonly hint?: { latitude: number; longitude: number; radius_m: number } | null;
  readonly catches_today?: number;
  readonly pin?: { item_id: number; name: string; icon_url: string | null; set_id: number };
}

export interface ParkSet {
  readonly id: number;
  readonly name: string;
  readonly kind: 'park' | 'seasonal';
  readonly park_id: number | null;
  readonly park_name: string | null;
  readonly season: { label: string | null; from: string; to: string; open_now: boolean } | null;
  readonly tradable: false;
  readonly have: number;
  readonly total: number;
  readonly complete: boolean;
  readonly claimed: boolean;
  readonly reward: { coins: number; boxes: number; completer: PinRow | null };
  readonly pins: PinRow[];
}

export interface FreeBoxes {
  readonly first: boolean;
  readonly weekly: boolean;
  readonly banked: number;
  readonly weekly_resets_at: string;
}

export interface MysterySeries {
  readonly id: number;
  readonly slug: string;
  readonly name: string;
  readonly tagline: string | null;
  readonly open: boolean;
  readonly ends_at: string | null;
  readonly price: number;
  readonly bundle: { count: number; price: number };
  readonly box_art_url: string | null;
  readonly theme_color: string | null;
  readonly pity: number;
  /** The chaser comes on this box or sooner. */
  readonly chaser_within: number;
  readonly opened: number;
  readonly free: FreeBoxes;
  readonly free_now: boolean;
  readonly chasers_pulled: number;
  readonly my_chaser_serials: number[];
  readonly tradable: true;
  /** Coin boxes are allowed where you are (free boxes always open). */
  readonly paid_allowed?: boolean;
  /** Trade in traders: points from spares; a missing regular pin costs pick_cost. */
  readonly points?: number;
  readonly pick_cost?: number;
  /** Limited edition size for the gold chaser (#3 of 500), and whether all are found. */
  readonly edition_size?: number | null;
  readonly sold_out?: boolean;
  /** Finishing the series pays this pin. */
  readonly completer?: PinRow | null;
  readonly pins: PinRow[];
}

export interface LanyardPin {
  readonly item_id: number;
  readonly name: string;
  readonly icon_url: string | null;
  readonly kind: PinKind;
  readonly is_chaser: boolean;
  readonly tradable: boolean;
  readonly serial?: number | null;
}

export interface PinHome {
  readonly lanyard: LanyardPin[];
  readonly lanyard_max: number;
  readonly free_boxes: number;
  /** Where the newest banked free box came from (vip_weekly, shark_pass, park_set...). */
  readonly free_box_from?: string | null;
  readonly counts: { pins: number; sets_done: number; sets: number; traders: number; chasers: number };
  readonly park_sets: ParkSet[];
  /** Pin of the Day at each park today (null when the feature is off). */
  readonly pin_days?: PinDay[] | null;
  readonly mystery: MysterySeries[];
  readonly shop_pins: PinRow[];
}

export interface Pull {
  readonly id: number;
  readonly item_id: number;
  readonly pin_id: number;
  readonly name: string;
  readonly icon_url: string | null;
  readonly is_chaser: boolean;
  readonly by_pity: boolean;
  readonly serial: number | null;
  readonly duplicate: boolean;
}

export interface OpenResult {
  readonly counts?: Partial<PinHome['counts']>;
  readonly reused: boolean;
  readonly pulls: Pull[];
  readonly coins: number;
  readonly series: MysterySeries;
  readonly free_boxes: number;
}

/** Short words a 7-year-old reads at a glance (no sentences on cards). */
export const PINS_COPY = {
  title: 'Pins',
  tabMystery: 'Mystery',
  tabSets: 'Park Sets',
  tabMine: 'My Pins',
  trade: 'Trade',
  open: 'Open',
  openFree: 'Open free',
  chaser: 'Chaser',
  inPerson: 'Earned at the park',
  tradeable: 'Can trade',
  newPin: 'NEW!',
  trader: '+1 Trader',
  claim: 'Get reward',
  claimed: 'Done',
  lanyard: 'My Lanyard',
  lanyardEmpty: 'Tap pins to wear them',
  oddsTitle: 'What can be inside',
  networkTitle: 'Pins didn’t load',
  networkMessage: 'Check your internet and try again.',
  closedSeries: 'All done',
} as const;

export type BadgeKind = 'seal' | 'trade' | 'none';

/** The corner badge for a pin kind: earned in person = gold seal (never trades), everything else = trade badge. */
export function badgeFor(kind: PinKind, tradable: boolean): BadgeKind {
  if (!tradable || kind === 'park' || kind === 'seasonal' || kind === 'event') return 'seal';
  return 'trade';
}

/** "15.5%" / "7%" from basis points. Always shown before a box is opened. */
export function formatChance(bp: number | undefined): string {
  const pct = (bp ?? 0) / 100;
  const text = Number.isInteger(pct) ? String(pct) : pct.toFixed(1).replace(/\.0$/, '');
  return `${text}%`;
}

/** "1 in 14" for the chaser (rounded to the nearest whole box). */
export function oneIn(bp: number | undefined): string {
  if (!bp || bp <= 0) return '';
  return `1 in ${Math.max(1, Math.round(10000 / bp))}`;
}

/** Chaser meter, 0..1: how close the guarantee is (it fills as boxes open). */
export function chaserMeter(series: Pick<MysterySeries, 'pity' | 'chaser_within'>): number {
  if (series.pity <= 0) return 0;
  const since = series.pity - series.chaser_within;
  return Math.max(0, Math.min(1, since / Math.max(1, series.pity - 1)));
}

/** Regular pins and the chaser of a series, chaser last. */
export function splitSeries(series: Pick<MysterySeries, 'pins'>): { regular: PinRow[]; chaser: PinRow | null } {
  const regular = series.pins.filter(p => !p.is_chaser);
  const chaser = series.pins.find(p => p.is_chaser) ?? null;
  return { regular, chaser };
}

/** How many of a series' regular pins you own ("3 of 6"). */
export function seriesProgress(series: Pick<MysterySeries, 'pins'>): { have: number; total: number; chaser: boolean } {
  const { regular, chaser } = splitSeries(series);
  return { have: regular.filter(p => p.owned).length, total: regular.length, chaser: !!chaser?.owned };
}

/** Which free box opens next, or null (the server applies the same order). */
export function nextFreeBox(series: Pick<MysterySeries, 'free' | 'free_now'>): 'first' | 'weekly' | 'banked' | null {
  if (!series.free_now) return null;
  if (series.free.first) return 'first';
  if (series.free.weekly) return 'weekly';
  if (series.free.banked > 0) return 'banked';
  return null;
}

/** Coins short for opening `count` boxes (0 when you have enough). */
export function coinsShort(series: Pick<MysterySeries, 'price' | 'bundle'>, count: number, balance: number): number {
  const cost = count === series.bundle.count ? series.bundle.price : series.price * count;
  return Math.max(0, cost - Math.max(0, balance));
}

/** "Ends Dec 31": a real end date, never a fake timer. Null when there is none. */
export function endsLabel(endsAt: string | null, now = new Date()): string | null {
  if (!endsAt) return null;
  const end = new Date(endsAt);
  if (Number.isNaN(end.getTime())) return null;
  if (end.getTime() <= now.getTime()) return PINS_COPY.closedSeries;
  const month = end.toLocaleString('en-US', { month: 'short', timeZone: 'America/Los_Angeles' });
  const day = end.toLocaleString('en-US', { day: 'numeric', timeZone: 'America/Los_Angeles' });
  return `Ends ${month} ${day}`;
}

/** "Only in Dec" for a seasonal set (from its MM-DD window). */
export function seasonLabel(set: Pick<ParkSet, 'season'>): string | null {
  if (!set.season) return null;
  if (set.season.label) return set.season.label;
  const month = Number(set.season.from.slice(0, 2));
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return names[month - 1] ? `Only in ${names[month - 1]}` : null;
}

/** "#3" (or "#3 of 500") for a chaser serial; low numbers are the flex. */
export function serialLabel(serial: number | null | undefined, edition?: number | null): string {
  if (!serial) return '';
  return edition ? `#${serial} of ${edition}` : `#${serial}`;
}

/** "Oct 9 · finder #1" for a caught park pin. */
export function foundLabel(found: { day: string; order: number } | null | undefined): string | null {
  if (!found) return null;
  const d = new Date(`${found.day}T12:00:00`);
  const day = Number.isNaN(d.getTime()) ? found.day : d.toLocaleString('en-US', { month: 'short', day: 'numeric' });
  return `${day} \u00b7 finder #${found.order}`;
}

/** "from VIP" / "from your Shark Pass" for a banked free box. */
export function freeFromLabel(source: string | null | undefined): string | null {
  switch (source) {
    case 'vip_weekly': return 'Free box from VIP';
    case 'shark_pass': return 'Free box from your Shark Pass';
    case 'park_set': return 'Free box from a park set';
    case 'trail_box': return 'Free box from a Trail Box';
    default: return null;
  }
}

/** Owned pins for the My Pins shelf: every owned pin once, chasers first, then in-person, then the rest by name. */
export function myPins(home: Pick<PinHome, 'park_sets' | 'mystery' | 'shop_pins'>): PinRow[] {
  const seen = new Map<number, PinRow>();
  const add = (p: PinRow) => { if (p.owned && !seen.has(p.item_id)) seen.set(p.item_id, p); };
  home.mystery.forEach(s => s.pins.forEach(add));
  home.park_sets.forEach(s => {
    s.pins.forEach(add);
    if (s.reward.completer) add(s.reward.completer);
  });
  home.shop_pins.forEach(add);
  const rank = (p: PinRow) => (p.is_chaser ? 0 : p.tradable ? 2 : 1);
  return [...seen.values()].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

/** Toggle a pin on the lanyard (max pins; newest goes on the end). */
export function toggleLanyard(ids: readonly number[], itemId: number, max: number): { ids: number[]; full: boolean } {
  if (ids.includes(itemId)) return { ids: ids.filter(id => id !== itemId), full: false };
  if (ids.length >= max) return { ids: [...ids], full: true };
  return { ids: [...ids, itemId], full: false };
}

/** A fresh id for one open request (a retried tap reuses it, so it never charges twice). */
export function newRequestId(seed = Math.random()): string {
  return `${Date.now().toString(36)}-${Math.floor(seed * 1e9).toString(36)}`;
}

/** The device's region (ISO alpha-2) from its locale, for the paid-box region rule. */
export function deviceRegion(locale?: string): string | null {
  let tag = locale;
  if (!tag) {
    try { tag = Intl.DateTimeFormat().resolvedOptions().locale; } catch { tag = undefined; }
  }
  const match = tag?.match(/[-_]([A-Za-z]{2})(?:$|[-_@])/);
  return match ? match[1].toUpperCase() : null;
}

/** Warmer / colder words and fill (0..1) for the hunt meter. */
export function warmthView(w: HuntStatus['warmth']): { word: string; fill: number; color: string } {
  switch (w) {
    case 'here': return { word: 'It\u2019s right here!', fill: 1, color: '#ef4a3c' };
    case 'hot': return { word: 'Hot!', fill: 0.75, color: '#ff7a45' };
    case 'warm': return { word: 'Warm', fill: 0.5, color: '#ffcf3b' };
    case 'cold': return { word: 'Cold', fill: 0.2, color: '#7cc6f5' };
    default: return { word: 'Finding you\u2026', fill: 0.05, color: '#bfe5ff' };
  }
}

/**
 * Bundle reveal order: new pins first, then traders, the chaser last (every
 * pin is already granted, so order is presentation only: the big one ends it).
 */
export function revealOrder<T extends { is_chaser: boolean; duplicate: boolean; id: number }>(pulls: readonly T[]): T[] {
  const rank = (p: T) => (p.is_chaser ? 2 : p.duplicate ? 1 : 0);
  return [...pulls].sort((a, b) => rank(a) - rank(b) || a.id - b.id);
}

/** "Free box Mon": when the next weekly free box arrives (park time). */
export function nextFreeLabel(resetsAt: string | null | undefined): string | null {
  if (!resetsAt) return null;
  const d = new Date(resetsAt);
  if (Number.isNaN(d.getTime())) return null;
  return `Free box ${d.toLocaleString('en-US', { weekday: 'short', timeZone: 'America/Los_Angeles' })}`;
}

/** Points toward picking a missing pin, as a 0..1 fill and whether a pick is ready. */
export function pointsView(series: Pick<MysterySeries, 'points' | 'pick_cost' | 'pins'>): { points: number; cost: number; fill: number; ready: boolean; missing: number } {
  const cost = series.pick_cost ?? 5;
  const points = series.points ?? 0;
  const missing = series.pins.filter(p => !p.is_chaser && !p.owned).length;
  return { points, cost, fill: Math.min(1, points / cost), ready: points >= cost && missing > 0, missing };
}

/** Coins saved by the bundle against single boxes. */
export function bundleSaving(series: Pick<MysterySeries, 'price' | 'bundle'>): number {
  return Math.max(0, series.price * series.bundle.count - series.bundle.price);
}

/** Which tab opens first: Mystery when a free box waits, else Park Sets if one is ready to claim, else Mystery. */
export function initialTab(home: Pick<PinHome, 'mystery' | 'park_sets'>): 'mystery' | 'sets' {
  if (home.mystery.some(s => s.free_now)) return 'mystery';
  if (home.park_sets.some(s => s.complete && !s.claimed)) return 'sets';
  return 'mystery';
}
