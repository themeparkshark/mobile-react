/**
 * The in-app Battery Saver switch (Settings). One tiny store, persisted.
 * Like Pokemon GO's Battery Saver: the game keeps every feature, it just does
 * less work in the background of what you are looking at.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

export const BATTERY_SAVER_KEY = 'tps.batterySaver.v1';

let saverOn = false;
let loaded = false;
/** The player flipped the switch: a slow storage read must never undo it. */
let userSet = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(fn => fn());

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  void loadBatterySaver();
  return () => { listeners.delete(listener); };
}

const read = () => saverOn;

export function isBatterySaverOn(): boolean { return saverOn; }

export function setBatterySaver(on: boolean): void {
  userSet = true;
  if (on === saverOn) return;
  saverOn = on;
  emit();
  void AsyncStorage.setItem(BATTERY_SAVER_KEY, on ? '1' : '0').catch(() => undefined);
}

/** Start reading the stored value (PowerProvider mounts early). */
export function loadBatterySaver(): Promise<void> {
  if (loaded) return Promise.resolve();
  loaded = true;
  return AsyncStorage.getItem(BATTERY_SAVER_KEY).then(value => {
    if (userSet) return;
    const next = value === '1';
    if (next !== saverOn) { saverOn = next; emit(); }
  }).catch(() => undefined);
}

/** Test hook. */
export function resetBatterySaver(): void { saverOn = false; loaded = false; userSet = false; listeners.clear(); }

export function useBatterySaver(): boolean {
  return useSyncExternalStore(subscribe, read, read);
}
