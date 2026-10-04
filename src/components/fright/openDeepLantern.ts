/**
 * Open the Deep Lantern (route FrightCard, a screen, not a modal) for an event.
 * `section: 'pins'` scrolls to the pins; `nightOn` features that night's share
 * row at the top. Fright pins always open here, never PinCollections.
 */
import * as RootNavigation from '../../RootNavigation';
import type { FrightCardParams } from './FrightCardScreen';

export function deepLanternParams(eventSlug: string, extra: { readonly section?: 'pins' | null; readonly nightOn?: string | null } = {}): FrightCardParams {
  return {
    eventSlug,
    ...(extra.section ? { section: extra.section } : {}),
    ...(extra.nightOn ? { nightOn: extra.nightOn } : {}),
  };
}

export function openDeepLantern(eventSlug: string, extra: { readonly section?: 'pins' | null; readonly nightOn?: string | null } = {}): void {
  RootNavigation.navigate('FrightCard', deepLanternParams(eventSlug, extra));
}
