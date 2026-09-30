import { useSyncExternalStore } from 'react';
import type { PartyClient } from './PartyClient';
import type { PartyState } from './roomState';

/** Subscribe a component to one PartyClient's state (no extra renders between pushes). */
export function usePartyState(client: PartyClient): PartyState {
  return useSyncExternalStore(client.subscribe, client.getState, client.getState);
}
