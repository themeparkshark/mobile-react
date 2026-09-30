/**
 * snapshotStore: persists interruption snapshots so a run survives the app
 * being backgrounded, the phone pocketed or the screen locked, and even the OS
 * killing the app while it sits in a pocket.
 *
 * Memory first (instant), AsyncStorage second (survives a kill). One slot per
 * session key; stale snapshots (30 min) are ignored.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { SNAPSHOT_TTL_MS, snapshotUsable, type SessionSnapshot } from '../core/session';

const PREFIX = 'gamekit:snapshot:';
const memory = new Map<string, SessionSnapshot>();

export async function saveSnapshot(snap: SessionSnapshot): Promise<void> {
  memory.set(snap.key, snap);
  try {
    await AsyncStorage.setItem(PREFIX + snap.key, JSON.stringify(snap));
  } catch {
    // Memory copy still covers the common case (background -> foreground).
  }
}

export async function loadSnapshot<T = unknown>(key: string, now = Date.now(), ttlMs = SNAPSHOT_TTL_MS): Promise<SessionSnapshot<T> | null> {
  const mem = memory.get(key);
  if (snapshotUsable(mem, key, now, ttlMs)) return mem as SessionSnapshot<T>;
  try {
    const raw = await AsyncStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return snapshotUsable(parsed, key, now, ttlMs) ? (parsed as SessionSnapshot<T>) : null;
  } catch {
    return null;
  }
}

export async function clearSnapshot(key: string): Promise<void> {
  memory.delete(key);
  try {
    await AsyncStorage.removeItem(PREFIX + key);
  } catch {
    // Ignore.
  }
}
