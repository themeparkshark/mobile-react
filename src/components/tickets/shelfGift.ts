/**
 * The shelf gift (T5, arcade plan Nov 20 2026): +3 Tickets at every 5th coin won at a park. The win card's bar
 * reads "10 of 40 · 1 more: +3 Tickets" (no ride named). Pure line rule plus a one-slot store the ride card fills
 * from the win answer (attempt.shelf_gift), read by the win card's slot. Today's server sends no shelf_gift: no bar.
 */
import type { ShelfGift } from '../../api/endpoints/me/task-attempts';

export interface ShelfGiftLine {
  readonly line: string;
  /** How full the bar is toward the next gift step, 0 to 1. */
  readonly fill: number;
  /** Tickets this very win paid (the +3 burst), 0 otherwise. */
  readonly paidNow: number;
  readonly a11y: string;
}

const whole = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : null);

export function shelfGiftLine(gift: Partial<ShelfGift> | null | undefined): ShelfGiftLine | null {
  const won = whole(gift?.won);
  const total = whole(gift?.total);
  const nextAt = whole(gift?.next_at);
  const tickets = whole(gift?.tickets) ?? 3;
  if (won == null || total == null || total <= 0) return null;
  const paidNow = whole(gift?.paid_now) ?? 0;
  const head = `${Math.min(won, total)} of ${total}`;
  if (nextAt == null || nextAt <= won || won >= total) {
    return { line: head, fill: 1, paidNow, a11y: `${head} coins on your shelf here.${paidNow ? ` Plus ${paidNow} Tickets.` : ''}` };
  }
  const more = nextAt - won;
  const step = 5;
  const fill = Math.max(0, Math.min(1, (step - more) / step));
  return { line: `${head} · ${more} more: +${tickets} Tickets`, fill, paidNow,
    a11y: `${head} coins on your shelf here. ${more} more coin${more === 1 ? '' : 's'} for ${tickets} Tickets.${paidNow ? ` Plus ${paidNow} Tickets now.` : ''}` };
}

let latest: { key: string | number; gift: ShelfGift } | null = null;

/** The ride card notes the win answer's shelf gift (keyed by the attempt id) before the win card shows. */
export function noteShelfGift(key: string | number | null | undefined, gift: ShelfGift | null | undefined) {
  if (key == null || !gift) return;
  latest = { key, gift };
}

export function shelfGiftFor(key: string | number | null | undefined): ShelfGift | null {
  return latest && key != null && latest.key === key ? latest.gift : null;
}
