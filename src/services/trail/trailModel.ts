/**
 * Trail Boxes: pure model (no React, no network). Unit tested in
 * tools/tests/trail-model.test.cjs.
 *
 * Boxes open by walking inside the park, counted in steps. The server decides
 * every number (backend config/trail_boxes.php); this file only shapes and
 * words what it sends, and records the walking windows the app uploads.
 */

export type TrailTier = 'blue' | 'red' | 'gold';
export type TrailRewardKind = 'coins' | 'energy' | 'tickets' | 'mystery_box' | 'exclusive';
export type TrailMissReason = 'ride' | 'outside' | 'not_checked_in' | 'hour_cap' | 'day_cap' | 'too_old' | 'overlap' | 'gps_short' | 'left_early' | 'try_wheels' | 'bad';

export interface TrailBox {
  readonly id: number;
  readonly tier: TrailTier;
  readonly status: 'queued' | 'walking' | 'ready' | 'opened' | 'converted';
  readonly goal_steps: number;
  readonly progress_steps: number;
  readonly slot: number | null;
  readonly source: string;
  readonly earned_at: string;
}

export interface TrailReward {
  readonly kind: TrailRewardKind;
  readonly amount: number;
  readonly name?: string;
  readonly icon_url?: string | null;
  readonly item_id?: number;
  readonly instead_of?: string;
  readonly converted_coins?: number;
}

export interface TrailOddsTier {
  readonly tier: TrailTier;
  readonly goal_steps: number;
  readonly coins: number;
  readonly chance_bp: number;
  readonly always: readonly { readonly kind: TrailRewardKind; readonly amount: number }[];
  readonly bonus: readonly { readonly kind: TrailRewardKind; readonly amount: number; readonly chance_bp: number }[];
}

export interface TrailState {
  readonly enabled: boolean;
  readonly slots: number;
  readonly rack: number;
  readonly walking: readonly TrailBox[];
  readonly waiting: readonly TrailBox[];
  readonly ready: readonly TrailBox[];
  readonly today: { readonly park_id: number | null; readonly park_day: string; readonly steps: number; readonly meters: number };
  readonly best_day: { readonly park_day: string; readonly steps: number; readonly meters: number } | null;
  readonly lifetime: { readonly steps: number; readonly meters: number; readonly boxes_opened: number };
  readonly week: { readonly steps: number; readonly goal_steps: number | null; readonly goal_hit: boolean; readonly goal_options: readonly number[] };
  readonly wheels: boolean;
  readonly gold_in: number;
  readonly next_ride_box: number | null;
  readonly odds: { readonly tiers: readonly TrailOddsTier[]; readonly gold_pity: number; readonly exclusives: readonly string[] };
  /** Trail Exclusives with art and whether you have each (newer servers). */
  readonly exclusives?: readonly { readonly item_id: number; readonly name: string; readonly icon_url: string | null; readonly owned: boolean }[];
  readonly sync?: TrailSyncResult;
  readonly opened?: { readonly box: TrailBox; readonly rewards: readonly TrailReward[]; readonly replayed: boolean };
}

export interface TrailSyncResult {
  readonly credited_steps: number;
  readonly missed: readonly { readonly reason: TrailMissReason; readonly steps: number }[];
  readonly ready_box_ids: readonly number[];
  readonly goal_box: unknown | null;
}

export const BOX_NAME: Record<TrailTier, string> = { blue: 'Blue Box', red: 'Red Box', gold: 'Gold Box' };
/** "Blue Box", "Red Box", "Gold Box" for anything with a box colour. */
export function boxName(b: { readonly tier: TrailTier }): string {
  return BOX_NAME[b.tier];
}

/** Draw size grows with rarity, so the tier reads by size and trim as well as colour. */
export const TIER_SCALE: Record<TrailTier, number> = { blue: 0.86, red: 0.94, gold: 1 };

/** 12345 -> "12,345". Locale-free so tests and every device agree. */
export function formatSteps(n: number): string {
  const v = Math.max(0, Math.round(n));
  return v.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** Short form for tight pills: 950, 1.2k, 12k. */
export function shortSteps(n: number): string {
  const v = Math.max(0, Math.round(n));
  if (v < 1000) return String(v);
  if (v < 10000) return `${(Math.floor(v / 100) / 10).toFixed(1).replace(/\.0$/, '')}k`;
  return `${Math.floor(v / 1000)}k`;
}

/** Distance for the summary: miles for US-style locales, km elsewhere, one decimal. */
export function formatDistance(meters: number, useMiles: boolean): string {
  if (useMiles) {
    const mi = meters / 1609.344;
    return `${mi.toFixed(1)} ${mi >= 0.95 && mi < 1.05 ? 'mile' : 'miles'}`;
  }
  return `${(meters / 1000).toFixed(1)} km`;
}

export function usesMiles(locale: string | undefined): boolean {
  const region = (locale ?? '').split(/[-_]/)[1]?.toUpperCase();
  return !region || region === 'US' || region === 'GB' || region === 'LR' || region === 'MM';
}

export function boxFraction(box: Pick<TrailBox, 'goal_steps' | 'progress_steps' | 'status'>): number {
  if (box.status === 'ready' || box.status === 'opened') return 1;
  if (box.goal_steps <= 0) return 0;
  return Math.max(0, Math.min(1, box.progress_steps / box.goal_steps));
}

export function stepsToGo(box: Pick<TrailBox, 'goal_steps' | 'progress_steps' | 'status'>): number {
  if (box.status === 'ready') return 0;
  return Math.max(0, box.goal_steps - box.progress_steps);
}

/** The box the map pill shows: a ready one first, else the walking box closest to done. */
export function headlineBox(state: Pick<TrailState, 'ready' | 'walking'> | null): TrailBox | null {
  if (!state) return null;
  if (state.ready.length) return state.ready[0];
  return [...state.walking].sort((a, b) => stepsToGo(a) - stepsToGo(b))[0] ?? null;
}

/** Milestones (25/50/75/100%) crossed between two fractions; each gets a light beat. */
export function milestonesCrossed(from: number, to: number): number[] {
  return [0.25, 0.5, 0.75, 1].filter(m => from < m && to >= m);
}

/** Never let the screen go backwards: a stale server read keeps the larger shown value. */
export function monotonic(prevShown: number, next: number, sameBox: boolean): number {
  return sameBox ? Math.max(prevShown, next) : next;
}

/** Kind words for steps that did not count. Silent reasons return null. */
export function missCopy(reason: TrailMissReason): string | null {
  switch (reason) {
    case 'ride': return 'Rides and trams don\'t count as walking. Great ride!';
    case 'outside': return 'Only steps inside the park count.';
    case 'not_checked_in': return 'Open the map at the park so your steps count.';
    case 'hour_cap':
    case 'day_cap': return 'You walked a ton! Some steps were past the limit.';
    case 'gps_short': return 'Your phone lost the map for a bit, so some steps did not count.';
    case 'left_early': return 'Open the map before you leave the park to save every step.';
    case 'try_wheels': return 'Pushing a stroller or rolling? Turn on Rolling below so your map path counts.';
    default: return null;
  }
}

/** The one note to show after a sync: the biggest miss that has words. */
export function missNote(sync: TrailSyncResult | undefined): { steps: number; text: string } | null {
  if (!sync) return null;
  const worded = sync.missed
    .map(m => ({ steps: m.steps, text: missCopy(m.reason) }))
    .filter((m): m is { steps: number; text: string } => !!m.text && m.steps >= 20)
    .sort((a, b) => b.steps - a.steps);
  return worded[0] ?? null;
}

export function rewardLabel(r: TrailReward): string {
  switch (r.kind) {
    case 'coins': return `${formatSteps(r.amount)} Coins`;
    case 'energy': return `${r.amount} Energy`;
    case 'tickets': return r.amount === 1 ? '1 Ticket' : `${r.amount} Tickets`;
    case 'mystery_box': return r.amount === 1 ? 'Mystery Pin Box' : `${r.amount} Mystery Pin Boxes`;
    case 'exclusive': return r.name ?? 'Trail Exclusive';
  }
}

export function bonusLabel(kind: TrailRewardKind, amount: number): string {
  return kind === 'exclusive' ? 'Trail Exclusive item' : rewardLabel({ kind, amount });
}

/** "60%" or "2.5%": percentages as shown on the odds sheet (sum stays 100). */
export function percent(bp: number): string {
  const v = bp / 100;
  return `${Number.isInteger(v) ? v : v.toFixed(1)}%`;
}

// ------------------------------------------------------------------ recorder

export interface TrailPoint { readonly lat: number; readonly lng: number }

export interface TrailSegment {
  readonly id: string;
  readonly park_id: number;
  readonly source: 'live' | 'closed' | 'left';
  readonly started_at: number;
  readonly ended_at: number;
  steps: number | null;
  readonly gps_m: number;
  readonly start: TrailPoint;
  readonly end: TrailPoint;
}

export interface TrailAway { readonly parkId: number; readonly at: number; readonly pt: TrailPoint }

interface LiveRun { parkId: number; startAt: number; start: TrailPoint; lastAt: number; last: TrailPoint; gpsM: number }

/** A live window closes after this long, so the boxes fill while the map is open. */
export const LIVE_FLUSH_MS = 3 * 60_000;
/** One hop longer than this between published fixes is a re-seat (a tunnel, a ride), not a walk. */
export const MAX_HOP_M = 120;
/** Shorter live windows are never sent alone: they keep running, or start the closed window. */
export const MIN_WINDOW_MS = 20_000;

export function metersBetween(a: TrailPoint, b: TrailPoint): number {
  const R = 6371e3;
  const p1 = (a.lat * Math.PI) / 180;
  const p2 = (b.lat * Math.PI) / 180;
  const dp = ((b.lat - a.lat) * Math.PI) / 180;
  const dl = ((b.lng - a.lng) * Math.PI) / 180;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/**
 * Turns the existing (already filtered) location stream and app foreground /
 * background moments into walking windows. No timers, no GPS of its own: it
 * only reacts to fixes the map already gets. Steps are filled in later from
 * the phone's step history for each window.
 */
export class TrailRecorder {
  private run: LiveRun | null = null;
  away: TrailAway | null = null;
  /** The last in-park fix seen, so going to the background always leaves a starting point. */
  private lastFix: { parkId: number; pt: TrailPoint } | null = null;
  private seq = 0;

  constructor(private readonly makeId: (at: number) => string = at => `${at.toString(36)}-${Math.random().toString(36).slice(2, 8)}`) {}

  /** A new published position. parkId null = not in a park. */
  fix(parkId: number | null, pt: TrailPoint, at: number): TrailSegment[] {
    const out: TrailSegment[] = [];
    // Back from the background: the window while the app was closed.
    if (this.away) {
      const away = this.away;
      this.away = null;
      if (at - away.at >= MIN_WINDOW_MS) {
        if (parkId === away.parkId) out.push(this.segment(parkId, 'closed', away.at, at, away.pt, pt, 0));
        // Reopened outside the park (the tram home): the walk still counts, ending at the last park point.
        else out.push(this.segment(away.parkId, 'left', away.at, at, away.pt, away.pt, 0));
      }
    }
    this.lastFix = parkId == null ? null : { parkId, pt };
    if (parkId == null) {
      const closed = this.close();
      if (closed) out.push(closed);
      return out;
    }
    if (this.run && this.run.parkId !== parkId) {
      const closed = this.close();
      if (closed) out.push(closed);
    }
    if (!this.run) {
      this.run = { parkId, startAt: at, start: pt, lastAt: at, last: pt, gpsM: 0 };
      return out;
    }
    const hop = metersBetween(this.run.last, pt);
    if (hop <= MAX_HOP_M) this.run.gpsM += hop;
    else {
      // A jump (out of an indoor queue, a tunnel): the window keeps its time, so the steps in the
      // queue still count, but the hop itself never adds distance. Close it here and start fresh.
      this.run.last = pt;
      this.run.lastAt = at;
      const closed = this.close();
      if (closed) out.push(closed);
      this.run = { parkId, startAt: at, start: pt, lastAt: at, last: pt, gpsM: 0 };
      return out;
    }
    this.run.last = pt;
    this.run.lastAt = at;
    if (at - this.run.startAt >= LIVE_FLUSH_MS) {
      const closed = this.close();
      if (closed) out.push(closed);
      this.run = { parkId, startAt: at, start: pt, lastAt: at, last: pt, gpsM: 0 };
    }
    return out;
  }

  /** The app goes to the background: close the live window and remember where we were. */
  background(at: number): TrailSegment[] {
    const run = this.run;
    const out: TrailSegment[] = [];
    if (run && at - run.startAt >= MIN_WINDOW_MS) {
      const closed = this.close(at);
      if (closed) out.push(closed);
    }
    this.run = null;
    // A short live window is not lost: the closed window starts where it started.
    const last = run ?? this.lastFix;
    if (last) {
      const from = run && at - run.startAt < MIN_WINDOW_MS ? run.startAt : at;
      const pt = run && at - run.startAt < MIN_WINDOW_MS ? run.start : (run?.last ?? this.lastFix!.pt);
      this.away = { parkId: run?.parkId ?? this.lastFix!.parkId, at: from, pt };
    }
    return out;
  }

  /** Close the live window now (the sheet opened). A window too short to send keeps running. */
  flush(at: number): TrailSegment[] {
    const run = this.run;
    if (!run || at - run.startAt < MIN_WINDOW_MS) return [];
    const closed = this.close(at);
    this.run = { ...run, startAt: at, start: run.last, lastAt: at, gpsM: 0 };
    return closed ? [closed] : [];
  }

  private close(at?: number): TrailSegment | null {
    const run = this.run;
    this.run = null;
    if (!run) return null;
    const end = Math.max(run.lastAt, at ?? run.lastAt);
    if (end - run.startAt < MIN_WINDOW_MS) return null;
    return this.segment(run.parkId, 'live', run.startAt, end, run.start, run.last, run.gpsM);
  }

  private segment(parkId: number, source: TrailSegment['source'], from: number, to: number, a: TrailPoint, b: TrailPoint, gpsM: number): TrailSegment {
    this.seq += 1;
    return { id: `${this.makeId(from)}-${this.seq}`, park_id: parkId, source, started_at: Math.round(from), ended_at: Math.round(to),
      steps: null, gps_m: Math.round(gpsM), start: a, end: b };
  }
}
