/**
 * Dev-only capture fixtures for the money screens (the simulator has no App
 * Store products). Never in a store build: __DEV__ is false there and
 * EXPO_PUBLIC_* values are inlined at bundle time.
 *
 *   EXPO_PUBLIC_CAPTURE_PRICES=1   US App Store prices for VIP and Supplies
 *   EXPO_PUBLIC_CAPTURE_TRIAL=0    VIP without the intro trial
 *   EXPO_PUBLIC_CAPTURE_BUY=success|pending|failed  what a Buy returns after the gate
 */
import type { ShopPrice, VipPlan } from '../services/purchases';

export function capturePrices(): boolean {
  return __DEV__ && process.env.EXPO_PUBLIC_CAPTURE_PRICES === '1';
}

export function captureVipPlans(): VipPlan[] {
  const trial = process.env.EXPO_PUBLIC_CAPTURE_TRIAL === '0' ? null : 'One week free';
  return [
    { productId: 'com.themeparkshark.app.vip.yearly', title: 'VIP Yearly', price: '$39.99', amount: 39.99, period: 'year', trial },
    { productId: 'com.themeparkshark.app.vip.monthly', title: 'VIP Monthly', price: '$4.99', amount: 4.99, period: 'month', trial: null },
  ];
}

const USD: Record<string, number> = {
  'com.themeparkshark.app.pack.starter': 1.99,
  'com.themeparkshark.app.deal.daily': 0.99,
  'com.themeparkshark.app.pack.parkday': 2.99,
  'com.themeparkshark.app.tickets.5': 0.99,
  'com.themeparkshark.app.tickets.12': 1.99,
  'com.themeparkshark.app.tickets.25': 3.99,
  'com.themeparkshark.app.coins.500': 0.99,
  'com.themeparkshark.app.coins.1200': 1.99,
  'com.themeparkshark.app.coins.3250': 4.99,
  'com.themeparkshark.app.coins.7000': 9.99,
  'com.themeparkshark.app.rescue.3': 0.99,
};

export function captureShopPrices(ids: readonly string[]): Record<string, ShopPrice> {
  return Object.fromEntries(ids.filter(id => USD[id] !== undefined)
    .map(id => [id, { productId: id, price: `$${USD[id].toFixed(2)}`, amount: USD[id] }]));
}

export function captureBuy(): 'success' | 'pending' | 'failed' | null {
  if (!__DEV__) return null;
  const v = process.env.EXPO_PUBLIC_CAPTURE_BUY;
  return v === 'success' || v === 'pending' || v === 'failed' ? v : null;
}

/**
 * Dev-only deep links, so captures switch money screens without a rebundle:
 *   xcrun simctl openurl <sim> "themeparkshark://dev-money/supplies"
 *   .../dev-money/vip  .../dev-money/topup  .../dev-money/store
 * Never installed outside __DEV__.
 */
export function installMoneyDevLinks(go: (screen: string, query: Record<string, string>) => void): () => void {
  if (!__DEV__) return () => undefined;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Linking } = require('react-native') as typeof import('react-native');
  const handle = ({ url }: { url: string }) => {
    const match = url.match(/dev-money\/([a-z-]+)(?:\?(.*))?$/);
    if (!match) return;
    const query = Object.fromEntries((match[2] ?? '').split('&').filter(Boolean).map(kv => kv.split('=').map(decodeURIComponent) as [string, string]));
    go(match[1], query);
  };
  const sub = Linking.addEventListener('url', handle);
  return () => sub.remove();
}
