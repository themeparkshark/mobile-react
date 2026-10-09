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
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(fn => fn());

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!loaded) {
    loaded = true;
    void AsyncStorage.getItem(BATTERY_SAVER_KEY).then(value => {
      const next = value === '1';
      if (next !== saverOn) { saverOn = next; emit(); }
    }).catch(() => undefined);
  }
  return () => { listeners.delete(listener); };
}

const read = () => saverOn;

export function isBatterySaverOn(): boolean { return saverOn; }

export function setBatterySaver(on: boolean): void {
  if (on === saverOn) return;
  saverOn = on;
  loaded = true;
  emit();
  void AsyncStorage.setItem(BATTERY_SAVER_KEY, on ? '1' : '0').catch(() => undefined);
}

export function useBatterySaver(): boolean {
  return useSyncExternalStore(subscribe, read, read);
}
