import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Launch-critical reads (copy, currencies, theme) must never strand a player
 * on a blank screen. Each successful response is kept as the "last good"
 * copy; when the API is unreachable the last good copy is used, and on a
 * first launch with no network the bundled defaults are.
 */
export type LastGoodSource = 'network' | 'saved' | 'bundled';

const PREFIX = 'tps.lastGood.v1.';

type Storage = Pick<typeof AsyncStorage, 'getItem' | 'setItem'>;

export async function getWithLastGood<T>({
  key,
  request,
  unwrap,
  bundled,
  storage = AsyncStorage,
}: {
  readonly key: string;
  readonly request: () => Promise<{ data: unknown }>;
  readonly unwrap: (body: unknown) => T | undefined;
  readonly bundled: T;
  readonly storage?: Storage;
}): Promise<{ data: T; source: LastGoodSource }> {
  try {
    const response = await request();
    let body = response.data;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        // Leave as is; unwrap rejects it.
      }
    }
    const data = unwrap(body);
    if (data !== undefined) {
      storage.setItem(PREFIX + key, JSON.stringify(data)).catch(() => undefined);
      return { data, source: 'network' };
    }
  } catch {
    // Fall through to the saved copy.
  }
  try {
    const saved = await storage.getItem(PREFIX + key);
    if (saved) {
      const data = unwrap({ data: JSON.parse(saved) });
      if (data !== undefined) return { data, source: 'saved' };
    }
  } catch {
    // Corrupt or unavailable storage: use the bundled copy.
  }
  return { data: bundled, source: 'bundled' };
}
