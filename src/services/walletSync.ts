/**
 * The header's one source of truth (T139): the signed-in player's balances in AuthContext, kept true by
 * every grant and spend, wherever in the app it happens.
 *
 * Before this, each screen had to remember to call refreshPlayer() after a grant, a slow /me answer
 * was dropped, and a /me already in flight from before the grant was joined (dedupeGet) and painted the
 * old numbers, so the header lagged the server by minutes (2926/10 vs 2986/13, 350 after a +25 chest,
 * 80 Tickets through the punch). Now:
 * - a write answer that carries a balance (a Ticket spend, a game start or end, a treat catch's totals,
 *   a trip-goal wallet) updates the header at once;
 * - every successful grant or spend write asks for one fresh /me shortly after (coalesced, never joined
 *   to an older read), retried with backoff when the server is slow;
 * - answers apply in order: an older /me never overwrites a newer one (AuthProvider).
 * Kept free of React and the API client so it is unit tested.
 */
export type WalletPatch = { tickets?: number; energy?: number; coins?: number; experience?: number };

type Sink = { readonly patch: (patch: WalletPatch) => void; readonly refresh: () => Promise<unknown> };

/** Writes that can grant or spend something shown in the header. */
export const WALLET_WRITE = /(redeem|claim|\/open\b|purchase|buy|spend|task-attempts|stamps|gift|\/shop|trail\/walk|chest|attack|\/rounds|catch|complete|\/pick|exchange|upgrade|vault|reward|inline-timer)/i;
/** Writes that never move a balance (seen marks, reports, heartbeats, settings). */
const NOT_WALLET = /(seen|report|heartbeat|push-tokens|feedback|share-events|money-events|settings|reminders|dismiss|focus|follow|vote|block|friend|lanyard|title|frame|\/celebrate)/i;
/** Answers whose `data.tickets` is the player's balance (not a reward amount). */
const TICKET_BALANCE = /\/me\/(task-attempts|spend-tickets)/;

export const WALLET_REFRESH_DEBOUNCE_MS = 500;
export const WALLET_RETRY_MS = [2000, 5000, 15000, 30000] as const;

let sink: Sink | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let tries = 0;

const num = (value: unknown): number | undefined => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined);

/** The balances an answer carries, or null. Only shapes the server documents as totals count. */
export function walletFromAnswer(method: string | undefined, url: string | undefined, body: unknown): WalletPatch | null {
  const data = (body as { data?: Record<string, unknown> } | null | undefined)?.data;
  if (!data || typeof data !== 'object') return null;
  const patch: WalletPatch = {};
  if (TICKET_BALANCE.test(url ?? '')) patch.tickets = num(data.tickets);
  const write = (method ?? 'get').toLowerCase() !== 'get';
  if (write) {
    const totals = data.new_totals as Record<string, unknown> | undefined;
    if (totals && typeof totals === 'object') {
      patch.tickets ??= num(totals.tickets); patch.energy = num(totals.energy); patch.experience = num(totals.experience);
    }
    const wallet = data.wallet as Record<string, unknown> | undefined;
    if (wallet && typeof wallet === 'object') {
      patch.tickets ??= num(wallet.tickets); patch.energy ??= num(wallet.energy); patch.coins = num(wallet.coins);
    }
  }
  for (const key of Object.keys(patch) as (keyof WalletPatch)[]) if (patch[key] === undefined) delete patch[key];
  return Object.keys(patch).length ? patch : null;
}

/** Can this successful write have moved a balance? */
export function isWalletWrite(method: string | undefined, url: string | undefined): boolean {
  const m = (method ?? 'get').toLowerCase();
  if (m === 'get' || m === 'head') return false;
  const u = url ?? '';
  return WALLET_WRITE.test(u) && !NOT_WALLET.test(u);
}

function schedule(delay: number): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    const current = sink;
    if (!current) return;
    current.refresh().then(() => { tries = 0; }, () => {
      // A slow /me never leaves the header stale: try again, a little later each time.
      if (tries < WALLET_RETRY_MS.length) { schedule(WALLET_RETRY_MS[tries]); tries += 1; } else tries = 0;
    });
  }, delay);
  (timer as { unref?: () => void }).unref?.();
}

/** Every successful API answer (client.ts interceptor). */
export function noteApiAnswer(method: string | undefined, url: string | undefined, body: unknown): void {
  if (!sink) return;
  const patch = walletFromAnswer(method, url, body);
  if (patch) sink.patch(patch);
  if (isWalletWrite(method, url)) { tries = 0; schedule(WALLET_REFRESH_DEBOUNCE_MS); }
}

/** AuthProvider registers how to patch the signed-in player and how to read /me again. */
export function setWalletSink(next: Sink | null): void {
  sink = next;
  if (!next && timer) { clearTimeout(timer); timer = null; }
}

/** Tests only. */
export function resetWalletSyncForTests(): void {
  sink = null; tries = 0;
  if (timer) clearTimeout(timer);
  timer = null;
}
