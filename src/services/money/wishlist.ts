/**
 * The kid's wishlist (money stream round 6): a heart on a pack or the Shark Pass saves it on this
 * phone, and the grown-up page lists it. Nothing is sent anywhere, no message, no nudge, no timer.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

export type Wish = { readonly id: string; readonly name: string };
const KEY = 'money:wishlist';
let wishes: Wish[] = [];
let loaded = false;
const listeners = new Set<(w: Wish[]) => void>();

async function load() {
  if (loaded) return;
  loaded = true;
  try { wishes = JSON.parse((await AsyncStorage.getItem(KEY)) ?? '[]') as Wish[]; } catch { wishes = []; }
  listeners.forEach(l => l(wishes));
}

/** Add or remove a wish (pure, exported for tests). At most 10, newest first. */
export function toggled(list: readonly Wish[], wish: Wish): Wish[] {
  return list.some(w => w.id === wish.id) ? list.filter(w => w.id !== wish.id) : [wish, ...list].slice(0, 10);
}

export function toggleWish(wish: Wish): void {
  wishes = toggled(wishes, wish);
  listeners.forEach(l => l(wishes));
  void AsyncStorage.setItem(KEY, JSON.stringify(wishes)).catch(() => undefined);
}

export function useWishlist(): Wish[] {
  const [now, setNow] = useState(wishes);
  useEffect(() => { listeners.add(setNow); void load(); setNow(wishes); return () => { listeners.delete(setNow); }; }, []);
  return now;
}
