/**
 * Dev-only: the REAL Shark Shop screen (StoreScreen: top bar, tabs, Gear, Supplies, Secret Shop)
 * against fixture API answers, for captures and the critic panel (dustin-feedback-oct8/shop).
 * Never ships (devRoutes.tsx is __DEV__ only).
 *
 *   EXPO_PUBLIC_SHOP_TABS_PREVIEW=legacy         Gear as live production serves it today (no shelves engine: classic grid)
 *   EXPO_PUBLIC_SHOP_TABS_PREVIEW=v2             Gear on the v2 shelves (rotation engine on)
 *   EXPO_PUBLIC_SHOP_TABS_PREVIEW=supplies       Supplies, a regular player
 *   EXPO_PUBLIC_SHOP_TABS_PREVIEW=supplies-vip   Supplies, a VIP member (free daily ticket card)
 *   EXPO_PUBLIC_SHOP_TABS_PREVIEW=supplies-buy   Supplies; the grown-up gate auto-passes after 1.2 s so the buy moment can be recorded
 *   EXPO_PUBLIC_SHOP_TABS_PREVIEW=secret         The Secret Shop (secret_shop_v2 on), as a member
 *   EXPO_PUBLIC_SHOP_TABS_PREVIEW=secret-guest   The Secret Shop as a non-member
 *   append -low to any mode for a player with 120 coins
 *
 * Switch modes without a Metro restart: xcrun simctl openurl <udid> "themeparkshark://x?stmode=<mode>", or serve the
 * mode as plain text at http://127.0.0.1:8806/mode (polled every 0.5 s).
 */
import type { AxiosAdapter, AxiosRequestConfig, AxiosResponse } from 'axios';
import { useEffect, useMemo, useState } from 'react';
import { Image as RNImage, Linking, LogBox, View } from 'react-native';
import client from '../../api/client';
import { AuthContext, type AuthContextType } from '../../context/AuthProvider';
import type { PlayerType } from '../../models/player-type';
import type { ShopToday } from '../../models/shop-today';
import { fixturePlayer, fixtureToday } from './SecretShopPreviewScreen';
import { sharkToday } from './ShopLifecyclePreviewScreen';
import { resetSecretShopFlag } from '../../services/secretShopFlag';
import { slotForItem } from '../../helpers/wardrobe';
import { LEGACY_CATALOG, LEGACY_ITEMS, LEGACY_STORE } from './shopTabsFixture';

LogBox.ignoreAllLogs();

const uri = (asset: number) => RNImage.resolveAssetSource(asset).uri;

// ── Supplies: exactly what GET /me/shop serves (config/shop.php, ShopCatalog::forPlayer) ──
const PRICES: Record<string, string> = {
  'com.themeparkshark.app.pack.starter': '$1.99', 'com.themeparkshark.app.deal.daily': '$0.99', 'com.themeparkshark.app.pack.parkday': '$2.99',
  'com.themeparkshark.app.tickets.5': '$0.99', 'com.themeparkshark.app.tickets.12': '$1.99', 'com.themeparkshark.app.tickets.25': '$3.99',
  'com.themeparkshark.app.coins.500': '$0.99', 'com.themeparkshark.app.coins.1200': '$1.99', 'com.themeparkshark.app.coins.3250': '$4.99',
  'com.themeparkshark.app.coins.7000': '$9.99', 'com.themeparkshark.app.rescue.3': '$0.99',
};
type Grants = { tickets?: number; coins?: number; energy?: number; rescue_passes?: number };
const product = (id: string, section: string, title: string, grants: Grants, extra: Record<string, unknown> = {}) => ({
  product_id: `com.themeparkshark.app.${id}`, section, title, badge: null, grants, limit: null, deal_key: null, available: true,
  unavailable_reason: null, ...extra,
});
function shopCatalog(wallet: Required<Grants>) {
  return {
    enabled: true, day: new Date().toISOString().slice(0, 10), day_ends_at: new Date(Date.now() + 5 * 3600_000).toISOString(),
    account_token: '00000000-0000-4000-8000-000000000000', wallet, ticket_hold_cap: 30,
    sections: [{ key: 'featured', title: 'Featured' }, { key: 'tickets', title: 'Tickets' }, { key: 'coins', title: 'Coins' }, { key: 'rescue', title: 'Rescue Passes' }],
    products: [
      product('pack.starter', 'featured', 'Starter Pack', { tickets: 15, coins: 1500, energy: 150, rescue_passes: 2 }, { badge: 'Just once', limit: 'once' }),
      product('deal.daily', 'featured', 'Coin Chest', { coins: 1000 }, { badge: 'Changes each day', limit: 'daily', deal_key: 'coin_chest' }),
      product('pack.parkday', 'featured', 'Park Day Pack', { tickets: 20, coins: 500, energy: 200, rescue_passes: 2 }, { limit: 'daily' }),
      product('tickets.5', 'tickets', '5 Tickets', { tickets: 5 }),
      product('tickets.12', 'tickets', '12 Tickets', { tickets: 12 }),
      product('tickets.25', 'tickets', '25 Tickets', { tickets: 25 }, wallet.tickets + 25 > 30
        ? { available: false, unavailable_reason: 'pouch_full', badge: 'Best value' } : { badge: 'Best value' }),
      product('coins.500', 'coins', '500 Coins', { coins: 500 }),
      product('coins.1200', 'coins', '1,200 Coins', { coins: 1200 }),
      product('coins.3250', 'coins', '3,250 Coins', { coins: 3250 }),
      product('coins.7000', 'coins', '7,000 Coins', { coins: 7000 }, { badge: 'Best value' }),
      product('rescue.3', 'rescue', '3 Rescue Passes', { rescue_passes: 3 }),
    ],
    rules: [
      "Supplies cost real money. The App Store charges the grown-up's Apple ID.",
      'You get exactly what the pack shows. No surprise prizes.',
      'Ride Parts, ride coins and coin levels are never sold. You win them at the park.',
      'Grown-ups: Ask to Buy in Family Sharing lets you OK each buy first.',
    ],
  };
}
function adSummary(vip: boolean) {
  const p = (cap: number, used = 0) => ({ daily_cap: cap, used, remaining: cap - used });
  return { enabled: true, vip, day: new Date().toISOString().slice(0, 10), day_ends_at: new Date(Date.now() + 5 * 3600_000).toISOString(),
    placements: { double_coins: p(3), daily_ticket: { ...p(1), ref: 'day' }, retry: p(3), line_energy: p(3) } };
}

type Fixture = { mode: string; player: PlayerType; wallet: Required<Grants> };

function route(fx: Fixture, config: AxiosRequestConfig): { status: number; data: unknown } {
  const url = (config.url ?? '').replace(/^https?:\/\/[^/]+/, '').replace(/^\/api/, '');
  const secret = fx.mode.startsWith('secret');
  if (url === '/stores') return { status: 200, data: { data: [LEGACY_STORE] } };
  const today = /^\/stores\/(\d+)\/today/.exec(url);
  if (today) {
    if (fx.mode === 'legacy' || fx.mode.startsWith('supplies')) return { status: 404, data: { message: 'This store does not rotate.' } };
    const day: ShopToday = secret ? fixtureToday(1, 0) : sharkToday();
    return { status: 200, data: { data: { ...day, store_id: Number(today[1]) } } };
  }
  if (/^\/stores\/\d+\/rotation/.test(url)) return { status: 200, data: { next_rotation_at: new Date(Date.now() + (3 * 86400 + 4 * 3600 + 12 * 60) * 1000).toISOString() } };
  const store = /^\/stores\/(\d+)$/.exec(url);
  if (store) {
    return { status: 200, data: { data: secret
      ? { ...LEGACY_STORE, id: store[1], name: 'Secret Store', is_secret_store: true, current_catalog_id: 77 }
      : LEGACY_STORE } };
  }
  if (/^\/catalogs\/\d+\/items/.test(url)) {
    const page = Number((config.params as { page?: number } | undefined)?.page ?? /page=(\d+)/.exec(url)?.[1] ?? 1);
    return { status: 200, data: { data: page === 1 ? LEGACY_ITEMS : [] } };
  }
  if (/^\/catalogs\/\d+$/.test(url)) return { status: 200, data: { data: LEGACY_CATALOG } };
  if (url === '/me/wishlist') return { status: 200, data: { data: { item_ids: [], items: [] } } };
  if (/^\/me\/wishlist\/\d+/.test(url)) {
    return { status: 200, data: { data: { item_ids: config.method === 'delete' ? [] : [Number(url.split('/').pop())] } } };
  }
  if (url === '/me/inventory' && config.method === 'put') {
    // Wear: the piece goes into its slot, so the shelf and the stage show "Wearing".
    const id = Number((typeof config.data === 'string' ? JSON.parse(config.data) : config.data)?.item_id);
    const all = [...LEGACY_ITEMS, ...sharkToday().sections.flatMap(x => x.items), ...fixtureToday(1, 0).sections.flatMap(x => x.items)];
    const worn = all.find(i => i.id === id);
    const slot = worn ? slotForItem(worn as never) : null;
    if (worn && slot) fx.player = { ...fx.player, inventory: { ...(fx.player.inventory as object), [slot]: worn } } as unknown as PlayerType;
    return { status: 200, data: { data: fx.player.inventory } };
  }
  const buy = /^\/me\/inventory\/items\/(\d+)\/purchase/.exec(url);
  if (buy) {
    const all = [...LEGACY_ITEMS, ...sharkToday().sections.flatMap(x => x.items), ...fixtureToday(1, 0).sections.flatMap(x => x.items)];
    const item = all.find(i => i.id === Number(buy[1]));
    fx.player = { ...fx.player, coins: Number(fx.player.coins ?? 0) - (item?.cost ?? 0) } as PlayerType;
    fx.wallet = { ...fx.wallet, coins: Number(fx.player.coins) };
    return { status: 200, data: { data: { ...(item ?? { id: Number(buy[1]) }), has_purchased: true }, set_reward: null } };
  }
  if (url === '/me/shop') return { status: 200, data: { data: shopCatalog(fx.wallet) } };
  if (url === '/me/ads') return { status: 200, data: { data: adSummary(!!fx.player.is_subscribed) } };
  if (url === '/me/secret-shop') return { status: 200, data: { data: { secret_shop_v2: secret, preview: secret } } };
  if (url.startsWith('/feature-flags')) return { status: 200, data: { data: { flags: { secret_shop_v2: secret } } } };
  // eslint-disable-next-line no-console
  console.log(`[shop-tabs] unhandled ${config.method} ${url}`);
  return { status: 404, data: { message: 'fixture: not served' } };
}

let current: Fixture | null = null;
const fixtureAdapter: AxiosAdapter = async (config) => {
  await new Promise(r => setTimeout(r, 120));
  const answer = current ? route(current, config) : { status: 503, data: {} };
  const response = { data: answer.data, status: answer.status, statusText: String(answer.status), headers: {}, config, request: {} } as AxiosResponse;
  if (answer.status >= 400) {
    const error = Object.assign(new Error(`fixture ${answer.status}`), { response, config, isAxiosError: true });
    throw error;
  }
  return response;
};

/** StoreKit stand-ins: Apple's localized prices, and a buy that the server grants after a beat. */
function stubStoreKit(fx: () => Fixture | null) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const purchases = require('../../services/purchases');
  purchases.storeAvailable = () => true;
  purchases.loadShopPrices = async (ids: readonly string[]) => Object.fromEntries(ids.filter(id => PRICES[id])
    .map(id => [id, { productId: id, price: PRICES[id], amount: Number(PRICES[id].slice(1)) }]));
  purchases.buyShopProduct = async (id: string) => {
    await new Promise(r => setTimeout(r, 900));
    const p = shopCatalog(fx()?.wallet ?? { tickets: 0, coins: 0, energy: 0, rescue_passes: 0 }).products.find(x => x.product_id === id);
    const granted = (p?.grants ?? {}) as Grants;
    const f = fx();
    if (f) {
      f.wallet = { tickets: f.wallet.tickets + (granted.tickets ?? 0), coins: f.wallet.coins + (granted.coins ?? 0),
        energy: f.wallet.energy + (granted.energy ?? 0), rescue_passes: f.wallet.rescue_passes + (granted.rescue_passes ?? 0) };
    }
    return { status: 'success', result: { results: [{ transaction_id: 't1', product_id: id, granted, replay: false, revoked: false }], wallet: f?.wallet } };
  };
}

function autoGate() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const gate = require('../../components/GrownUpGate');
  gate.askGrownUp = () => new Promise<boolean>(resolve => setTimeout(() => resolve(true), 300));
}

function useMode(): string {
  const [mode, setMode] = useState((__DEV__ ? process.env.EXPO_PUBLIC_SHOP_TABS_PREVIEW : '') || 'legacy');
  useEffect(() => {
    const read = (u: string | null) => { const m = u && /[?&]stmode=([a-z0-9_-]+)/.exec(u); if (m) setMode(m[1]); };
    void Linking.getInitialURL().then(read);
    const sub = Linking.addEventListener('url', e => read(e.url));
    // Capture rigs: the shop stream's own mode server (tools/modeserver), no "Open in" prompt.
    let last = '';
    const poll = setInterval(() => {
      fetch(`http://127.0.0.1:8806/mode?t=${Date.now()}`, { cache: 'no-store' }).then(r => r.text()).then(t => { const m = t.trim(); if (m && m !== last) { last = m; setMode(m); } }, () => undefined);
    }, 500);
    return () => { sub.remove(); clearInterval(poll); };
  }, []);
  return mode;
}

export default function ShopTabsPreviewScreen() {
  const mode = useMode();
  return <View key={mode} style={{ flex: 1 }}><Body mode={mode} /></View>;
}

function Body({ mode: raw }: { mode: string }) {
  // "-low": a player with 120 coins (short tiles, the try-on's out-of-coins step).
  const low = raw.endsWith('-low');
  const mode = raw.replace(/-low$/, '');
  const member = mode === 'supplies-vip' || mode === 'secret';
  const [ready, setReady] = useState(false);
  const fx = useMemo<Fixture>(() => {
    const coins = low ? 120 : 1240;
    const player = { ...fixturePlayer(member), coins, tickets: 7, energy: 85, rescue_passes: 1 } as unknown as PlayerType;
    return { mode, player, wallet: { tickets: 7, coins, energy: 85, rescue_passes: 1 } };
  }, [mode, low]);
  const [player, setPlayer] = useState(fx.player);
  useEffect(() => {
    current = fx;
    resetSecretShopFlag();
    client.defaults.adapter = fixtureAdapter;
    stubStoreKit(() => current);
    if (mode === 'supplies-buy') autoGate();
    setReady(true);
  }, [fx]);
  const auth = useMemo(() => ({
    player, isReady: true, setPlayer: () => undefined,
    refreshPlayer: async () => {
      const next = { ...player, inventory: fx.player.inventory, coins: fx.wallet.coins, tickets: fx.wallet.tickets, energy: fx.wallet.energy, rescue_passes: fx.wallet.rescue_passes } as PlayerType;
      setPlayer(next);
      return next;
    },
  }) as unknown as AuthContextType, [player, fx]);
  if (!ready) return null;
  const StoreScreen = require('../StoreScreen').default;
  const params = mode.startsWith('secret') ? { store: 77, secret: true }
    : { store: 'shark-shop', tab: mode.startsWith('supplies') ? 'supplies' : 'gear' };
  return (
    <AuthContext.Provider value={auth}>
      <StoreScreen route={{ key: 'Store-preview', name: 'Store', params }} navigation={undefined as never} />
    </AuthContext.Provider>
  );
}

export { uri };
