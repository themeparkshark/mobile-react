/**
 * Dev-only visual QA switch for WS7 economy surfaces (never set in release:
 * EXPO_PUBLIC_* is inlined at bundle time and __DEV__ is false in store builds).
 *
 *   EXPO_PUBLIC_WS7_PREVIEW=chest       daily chest opens itself over the map
 *   EXPO_PUBLIC_WS7_PREVIEW=store       Shark Shop
 *   EXPO_PUBLIC_WS7_PREVIEW=store-poor  Shark Shop with the not-enough sheet
 *   EXPO_PUBLIC_WS7_PREVIEW=vip         VIP paywall
 *   EXPO_PUBLIC_WS7_PREVIEW=hud         home stats menu open
 */
export type Ws7Preview = '' | 'chest' | 'store' | 'store-poor' | 'vip' | 'hud';

export function ws7Preview(): Ws7Preview {
  if (!__DEV__) return '';
  const value = process.env.EXPO_PUBLIC_WS7_PREVIEW ?? '';
  return (['chest', 'store', 'store-poor', 'vip', 'hud'] as const).find(v => v === value) ?? '';
}
