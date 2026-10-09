import AsyncStorage from '@react-native-async-storage/async-storage';
import { pushState } from '../push';
import { pushAskAllowed, type PushAskRecord } from './logic';

const KEY = 'tps.retention.pushAsk.v1';

async function read(): Promise<PushAskRecord> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const v = raw ? JSON.parse(raw) : null;
    return { asks: Number(v?.asks) || 0, lastAt: typeof v?.lastAt === 'number' ? v.lastAt : null };
  } catch {
    return { asks: 0, lastAt: null };
  }
}

/** May the reminders pre-prompt show right now (after a win)? */
export async function mayAskForPush(now = Date.now()): Promise<boolean> {
  try {
    return pushAskAllowed(await read(), await pushState(), now);
  } catch {
    return false;
  }
}

/** The pre-prompt was shown (answered either way). */
export async function notePushAsked(now = Date.now()): Promise<void> {
  const r = await read();
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify({ asks: r.asks + 1, lastAt: now }));
  } catch {
    // Storage is best effort; worst case the card shows once more later.
  }
}
