/**
 * The offer funnel, per placement (POST /api/me/money-events, batched): impression, tap, the
 * grown-up gate shown / passed / declined, bought, pending, failed, cancelled, claim. Only the
 * event, the placement and the product id are sent: never prices, gate answers or anything typed.
 * Best effort: a failed send is dropped, never retried in a loop, never blocks a purchase.
 */
import client from '../../api/client';

export type MoneyEvent = 'impression' | 'tap' | 'gate_shown' | 'gate_passed' | 'gate_declined' | 'bought' | 'pending' | 'failed' | 'cancelled' | 'claim';

type Row = { event: MoneyEvent; placement: string; product_id?: string };
let queue: Row[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
const seen = new Set<string>();

function flush() {
  timer = null;
  if (!queue.length) return;
  const events = queue.slice(0, 50);
  queue = queue.slice(50);
  void client.post('/me/money-events', { events }, { timeout: 8000 }).catch(() => undefined);
  if (queue.length) timer = setTimeout(flush, 2000);
}

export function trackMoney(event: MoneyEvent, placement: string, productId?: string | null): void {
  const clean = placement.toLowerCase().replace(/[^a-z0-9_.:-]/g, '').slice(0, 40);
  if (!clean) return;
  queue.push({ event, placement: clean, ...(productId ? { product_id: productId } : {}) });
  if (queue.length >= 20) { if (timer) clearTimeout(timer); flush(); return; }
  timer ??= setTimeout(flush, 8000);
}

/** One impression per placement and product per app run (a card re-rendering never inflates it). */
export function trackImpression(placement: string, productId?: string | null): void {
  const key = `${placement}|${productId ?? ''}`;
  if (seen.has(key)) return;
  seen.add(key);
  trackMoney('impression', placement, productId);
}
