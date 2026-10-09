/**
 * One shared copy of the Supplies catalog (GET /me/shop) and Apple's prices,
 * so every offer in the game (the Supplies tab, a top-up card at the ride, the
 * post-win sheet) shows the same products, the same prices and the same
 * limits, warm on first frame. And the ONE gated way to buy a pack: every
 * real-money consumable goes through buyPack(), which asks a grown-up first
 * (the gate restates the price and the contents) and lets only one purchase
 * run at a time, app-wide.
 */
import { useEffect, useState } from 'react';
import { askGrownUp, type GateReason } from '../../components/GrownUpGate';
import { getShop, type ShopCatalog, type ShopGrants, type ShopProduct } from '../../api/endpoints/me/shop';
import { buyShopProduct, loadShopPrices, storeAvailable, type ShopPrice, type ShopPurchaseOutcome } from '../purchases';

export type SuppliesState = {
  readonly catalog: ShopCatalog | null;
  readonly prices: Record<string, ShopPrice>;
  readonly status: 'idle' | 'loading' | 'ready' | 'error';
};

const FRESH_MS = 60_000;
let state: SuppliesState = { catalog: null, prices: {}, status: 'idle' };
let loadedAt = 0;
let inFlight: Promise<SuppliesState> | null = null;
const listeners = new Set<(next: SuppliesState) => void>();

function set(next: SuppliesState) {
  state = next;
  listeners.forEach(listener => listener(state));
}

/** Loads (or reloads) the catalog, then Apple's prices for it. Never throws. */
export function refreshSupplies(force = false): Promise<SuppliesState> {
  if (!force && state.status === 'ready' && Date.now() - loadedAt < FRESH_MS) return Promise.resolve(state);
  inFlight ??= (async () => {
    if (!state.catalog) set({ ...state, status: 'loading' });
    try {
      const catalog = await getShop();
      // Prices are kept from the last load while new ones come in, so nothing jumps.
      set({ catalog, prices: state.prices, status: 'ready' });
      loadedAt = Date.now();
      if (storeAvailable()) {
        const prices = await loadShopPrices(catalog.products.map(p => p.product_id)).catch(() => null);
        if (prices && Object.keys(prices).length) set({ ...state, prices: { ...state.prices, ...prices } });
      }
    } catch {
      if (!state.catalog) set({ ...state, status: 'error' });
    }
    return state;
  })().finally(() => { inFlight = null; });
  return inFlight;
}

export function suppliesNow(): SuppliesState {
  return state;
}

/** Sign-out: the next player starts clean. */
export function resetSupplies(): void {
  state = { catalog: null, prices: {}, status: 'idle' };
  loadedAt = 0;
}

/** The shared catalog, loaded on first use and kept fresh. */
export function useSupplies(enabled = true): SuppliesState {
  const [now, setNow] = useState(state);
  useEffect(() => {
    if (!enabled) return undefined;
    listeners.add(setNow);
    setNow(state);
    void refreshSupplies();
    return () => { listeners.delete(setNow); };
  }, [enabled]);
  return now;
}

const ORDER: (keyof ShopGrants)[] = ['tickets', 'coins', 'energy', 'rescue_passes'];
const WORDS: Record<keyof ShopGrants, [string, string]> = {
  tickets: ['ticket', 'tickets'], coins: ['coin', 'coins'], energy: ['energy', 'energy'], rescue_passes: ['Rescue Pass', 'Rescue Passes'],
};

/** "15 tickets, 1,500 coins and 2 Rescue Passes". */
export function grantsText(grants: ShopGrants): string {
  const parts = ORDER.filter(k => (grants[k] ?? 0) > 0)
    .map(k => `${(grants[k] ?? 0).toLocaleString('en-US')} ${grants[k] === 1 ? WORDS[k][0] : WORDS[k][1]}`);
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0] ?? '';
}

/** What the grown-up gate restates before a real-money buy: "$4.99 for 15 tickets". */
export function gateReasonFor(product: ShopProduct, price: ShopPrice | undefined): GateReason {
  return { kind: 'money', price: price?.price ?? 'Real money', gets: grantsText(product.grants) };
}

let buying = false;

export function packBuyInProgress(): boolean {
  return buying;
}

/**
 * The one way to buy a Supplies pack. A grown-up answers the gate (price and
 * contents restated) before StoreKit is ever called; a second tap anywhere in
 * the app while one is running is ignored ('busy'). On success the shared
 * catalog reloads, so every offer on screen updates its limits.
 */
export async function buyPack(product: ShopProduct, options: { onStart?: () => void } = {}):
  Promise<ShopPurchaseOutcome | { status: 'declined' | 'busy' }> {
  if (buying) return { status: 'busy' };
  const catalog = state.catalog;
  buying = true;
  try {
    if (!(await askGrownUp(gateReasonFor(product, state.prices[product.product_id])))) return { status: 'declined' };
    options.onStart?.();
    const outcome = await purchaseNow(product, catalog);
    if (outcome.status === 'success' || outcome.status === 'pending' || outcome.status === 'unverified') void refreshSupplies(true);
    return outcome;
  } finally {
    buying = false;
  }
}

async function purchaseNow(product: ShopProduct, catalog: ShopCatalog | null): Promise<ShopPurchaseOutcome> {
  if (__DEV__) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fake = (require('../../../tools/capture/moneyCapture') as typeof import('../../../tools/capture/moneyCapture')).captureBuy();
    if (fake === 'success') return { status: 'success', result: { results: [{ transaction_id: 'dev', product_id: product.product_id, granted: product.grants, replay: false, revoked: false }], wallet: catalog?.wallet ?? { tickets: 0, coins: 0, energy: 0, rescue_passes: 0 } } };
    if (fake) return { status: fake };
  }
  return buyShopProduct(product.product_id, { accountToken: catalog?.account_token, shownDay: catalog?.day });
}

/** The one message for each purchase outcome, used by every offer. Null when nothing needs saying. */
export function outcomeMessage(outcome: ShopPurchaseOutcome | { status: 'declined' | 'busy' }, granted: ShopGrants | null):
  { title: string; body: string } | null {
  switch (outcome.status) {
    case 'success': return { title: 'You got it!', body: `${grantsText(granted ?? {})}. They’re yours now.` };
    case 'pending': return { title: 'Waiting for a grown-up', body: 'A grown-up needs to say yes on their phone. Your Supplies show up after that.' };
    case 'unverified': return { title: 'Almost there', body: 'It worked! Your Supplies show up in a minute. If not, they come next time you open the game.' };
    case 'other_account': return { title: 'Bought on another account', body: 'This was bought on a different Theme Park Shark account. Sign in to that account to get it.' };
    case 'unavailable': return { title: 'Update the game', body: 'Update Theme Park Shark in the App Store to buy Supplies.' };
    case 'failed': return { title: 'That didn’t work', body: 'You weren’t charged. Check your internet, then tap the price again.' };
    default: return null;
  }
}
