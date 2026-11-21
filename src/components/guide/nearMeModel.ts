/**
 * NEAR ME (arcade plan, section 6, Nov 20 2026): every coin in this park not yet won, one identical row each.
 *
 * Dustin, Nov 20: "we shouldn't suggest where they go it's their choice to play and it might make them think one ride
 * is more important than another which isn't true". So the list has no top pick, no gold row and no headline: A to Z by
 * default, a Distance switch the phone remembers, and one chip, "I can play now" (price at or under the wallet).
 * Pure and import-light so node tests read it.
 */
import { servedTicketPrice } from '../tickets/ticketPipsModel';
import { plainRideName } from '../../helpers/plainRideName';

export type NearMeSort = 'az' | 'distance';
export type NearMeStatus = 'open' | 'closed' | 'unknown';

export interface NearMeTask {
  readonly id: number;
  readonly name: string;
  readonly latitude: unknown;
  readonly longitude: unknown;
  readonly coin_url?: string | null;
  readonly ticket_cost?: unknown;
}

export interface NearMeRow {
  readonly taskId: number;
  readonly name: string;
  readonly coinUrl: string | null;
  /** The served price, or null (the row then shows no pips). */
  readonly price: number | null;
  readonly meters: number | null;
  readonly status: NearMeStatus;
  /** The posted wait in minutes while open, else null. */
  readonly wait: number | null;
  /** The player holds enough Tickets for one try. */
  readonly canPlay: boolean;
}

export interface NearMeInput {
  readonly tasks: readonly NearMeTask[];
  readonly ownedTaskIds: ReadonlySet<number>;
  readonly here: { readonly latitude: number; readonly longitude: number } | null | undefined;
  readonly live?: { readonly rides?: readonly { readonly task_id: number; readonly status: string; readonly wait?: number | null }[] } | null;
  readonly tickets: number;
  readonly sort: NearMeSort;
  readonly canPlayOnly: boolean;
}

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

function meters(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const k = Math.cos(((a.latitude + b.latitude) / 2) * Math.PI / 180);
  return Math.hypot((b.latitude - a.latitude) * 111_320, (b.longitude - a.longitude) * 111_320 * k);
}

const CLOSED = new Set(['CLOSED', 'DOWN', 'REFURBISHMENT']);

/** The rows, every one built the same way. Pure. */
export function nearMeRows(input: NearMeInput): NearMeRow[] {
  const here = input.here && finite(input.here.latitude) && finite(input.here.longitude) ? input.here : null;
  const live = new Map<number, { status: string; wait?: number | null }>();
  for (const ride of input.live?.rides ?? []) if (ride && finite(ride.task_id)) live.set(ride.task_id, ride);
  const tickets = finite(input.tickets) ? Math.max(0, Math.floor(input.tickets)) : 0;
  const seen = new Set<number>();
  const rows: NearMeRow[] = [];
  for (const task of input.tasks ?? []) {
    if (!task || !finite(task.id) || seen.has(task.id) || input.ownedTaskIds.has(task.id)) continue;
    seen.add(task.id);
    const spot = { latitude: Number(task.latitude), longitude: Number(task.longitude) };
    const m = here && finite(spot.latitude) && finite(spot.longitude) ? meters(here, spot) : null;
    const answer = live.get(task.id);
    const statusWord = String(answer?.status ?? '').toUpperCase();
    const status: NearMeStatus = statusWord === 'OPERATING' ? 'open' : CLOSED.has(statusWord) ? 'closed' : 'unknown';
    const price = servedTicketPrice(task.ticket_cost);
    rows.push({
      taskId: task.id,
      name: plainRideName(task.name),
      coinUrl: task.coin_url || null,
      price,
      meters: m,
      status,
      wait: status === 'open' && finite(answer?.wait) && answer!.wait! >= 0 ? Math.round(answer!.wait!) : null,
      // A coin with no served price is today's server: one Ticket a try.
      canPlay: tickets >= (price ?? 1),
    });
  }
  const shown = input.canPlayOnly ? rows.filter(row => row.canPlay) : rows;
  const byName = (a: NearMeRow, b: NearMeRow) => a.name.localeCompare(b.name) || a.taskId - b.taskId;
  if (input.sort === 'distance') {
    return shown.sort((a, b) => (a.meters === null ? 1 : 0) - (b.meters === null ? 1 : 0)
      || (a.meters ?? 0) - (b.meters ?? 0) || byName(a, b));
  }
  return shown.sort(byName);
}

/** "120 m", "1.2 km", or null. */
export function nearMeDistance(m: number | null): string | null {
  if (m === null || !finite(m) || m < 0) return null;
  if (m >= 1000) return `${(m / 1000).toFixed(1)} km`;
  return `${Math.max(5, Math.round(m / 5) * 5)} m`;
}

/** The row's second line: "120 m · Open, 25 min wait", "Closed right now", or just the distance. Same shape for every row. */
export function nearMeLine(row: NearMeRow): string {
  const status = row.status === 'open' ? row.wait != null ? row.wait > 0 ? `Open, ${row.wait} min wait` : 'Open, no wait' : 'Open'
    : row.status === 'closed' ? 'Closed right now' : null;
  return [nearMeDistance(row.meters), status].filter(Boolean).join(' · ');
}

/** The phone remembers the sort per player. */
export const nearMeSortKey = (playerId: number | null | undefined) => `near_me_sort:${playerId ?? 'guest'}`;
export const cleanSort = (raw: unknown): NearMeSort => (raw === 'distance' ? 'distance' : 'az');
