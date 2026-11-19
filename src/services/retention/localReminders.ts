/**
 * Gentle local reminders (fix round w3, T226). No push key needed: the phone itself schedules them.
 *
 * Behind the served switch `local_reminders` (read with the other retention switches). The rules match the server's
 * reminder pushes (config/retention.php `push`): at most one a day, inside the chest window (10 AM to noon local),
 * never at night, kid-safe words, never a countdown, and they stop after 3 in a row go unanswered. That last rule is
 * built in: every app open replaces ours with the next 3 days (one each), so a player who never comes back gets 3 and
 * then nothing, and a player who opens the app every day only ever gets tomorrow's.
 *
 * The ask is the existing Reminders card (first home open after the first park day, one automatic open). Turning
 * reminders off on the Daily 3 card cancels these too.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { flagOn, type RetentionFlags } from './flags';

/** Inside the server's chest window [10, 12). */
export const REMINDER_HOUR = 10;
export const REMINDER_MINUTE = 30;
/** Reminders in a row with no app open, then they stop (the server's ignored_stop). */
export const REMINDER_DAYS = 3;
export const REMINDER_ID = 'tps-local-reminder';
/** Kid-safe, no clock, the same words as the server's daily chest reminder. */
export const REMINDER_COPY = { title: 'Your daily chest is ready', body: 'Tap to open today’s prize.' } as const;

/**
 * Lane testing only: EXPO_PUBLIC_LOCAL_REMINDERS_DEV=1 turns the switch on and lets the ask show on a simulator.
 * `__DEV__` is false in every store and OTA bundle, so this can never run there.
 */
export function localRemindersDevOverride(): boolean {
  return __DEV__ && process.env.EXPO_PUBLIC_LOCAL_REMINDERS_DEV === '1';
}

/** The served switch (or the dev-only override). */
export function localRemindersOn(flags: RetentionFlags | null | undefined): boolean {
  return flagOn(flags, 'local_reminders') || localRemindersDevOverride();
}

/** The next `days` reminder times: 10:30 local on each following day (never today, so never a same-day nag). */
export function reminderTimes(now: Date, days: number = REMINDER_DAYS): Date[] {
  const out: Date[] = [];
  for (let i = 1; i <= days; i++) {
    out.push(new Date(now.getFullYear(), now.getMonth(), now.getDate() + i, REMINDER_HOUR, REMINDER_MINUTE, 0, 0));
  }
  return out;
}

/** This phone can schedule them (iOS, the native scheduler is in the binary). */
export function localRemindersSupported(): boolean {
  return Platform.OS === 'ios' && typeof Notifications.scheduleNotificationAsync === 'function';
}

const ASKED_KEY = 'tps.retention.localReminders.v1';

/** The player said yes on the Reminders card (kept on this phone). */
export async function localRemindersChosen(): Promise<boolean> {
  try { return (await AsyncStorage.getItem(ASKED_KEY)) === 'on'; } catch { return false; }
}

async function choose(on: boolean): Promise<void> {
  try { await AsyncStorage.setItem(ASKED_KEY, on ? 'on' : 'off'); } catch { /* best effort */ }
}

/** May the Reminders card show for local reminders: supported, never asked by iOS yet. */
export async function mayAskForLocalReminders(): Promise<boolean> {
  if (!localRemindersSupported()) return false;
  try {
    const { status } = await Notifications.getPermissionsAsync();
    return status === 'undetermined';
  } catch {
    return false;
  }
}

/** Replace ours with the next 3 days. Returns how many are scheduled (0 when not allowed). */
export async function scheduleLocalReminders(now: Date = new Date()): Promise<number> {
  if (!localRemindersSupported()) return 0;
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return 0;
    await cancelLocalReminders();
    const times = reminderTimes(now);
    for (let i = 0; i < times.length; i++) {
      await Notifications.scheduleNotificationAsync({
        identifier: `${REMINDER_ID}-${i + 1}`,
        content: {
          title: REMINDER_COPY.title, body: REMINDER_COPY.body,
          // Silent: a reminder never makes a sound (a kids' app, and the lanes' simulators stay quiet).
          sound: false,
          data: { route: { screen: 'Explore', params: { open: 'chest' } }, local: true },
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: times[i] },
      });
    }
    return times.length;
  } catch {
    return 0;
  }
}

/** Cancel ours only (never another feature's notifications). */
export async function cancelLocalReminders(): Promise<void> {
  try {
    const all = await Notifications.getAllScheduledNotificationsAsync();
    for (const n of all) {
      if (n.identifier?.startsWith(REMINDER_ID)) await Notifications.cancelScheduledNotificationAsync(n.identifier);
    }
  } catch { /* nothing scheduled */ }
}

/** The player said yes: ask iOS, then schedule. */
export async function turnOnLocalReminders(): Promise<boolean> {
  if (!localRemindersSupported()) return false;
  try {
    const { status } = await Notifications.requestPermissionsAsync();
    await choose(status === 'granted');
    if (status !== 'granted') return false;
    return (await scheduleLocalReminders()) > 0;
  } catch {
    return false;
  }
}

/** Turned off (Daily 3 card switch, or NOT NOW on the card): cancel and remember. */
export async function turnOffLocalReminders(): Promise<void> {
  await choose(false);
  await cancelLocalReminders();
}

/**
 * Each app open: when the switch is on and the player chose them (and did not turn reminders off on the Daily 3 card),
 * replace ours with the next 3 days; when the switch is off, cancel ours.
 */
export async function refreshLocalReminders(on: boolean, remindersOff: boolean, now: Date = new Date()): Promise<number> {
  if (!on || remindersOff) { await cancelLocalReminders(); return 0; }
  if (!(await localRemindersChosen())) return 0;
  return scheduleLocalReminders(now);
}

// Dev JS only (never in a store or OTA bundle): lane checks read what is scheduled.
if (__DEV__) {
  (globalThis as { __tpsLocalReminders?: unknown }).__tpsLocalReminders = {
    read: () => {
      void Notifications.getAllScheduledNotificationsAsync().then(all => {
        (globalThis as { __tpsLocalRemindersLast?: unknown }).__tpsLocalRemindersLast = all.map(n => ({
          id: n.identifier, title: n.content.title, body: n.content.body, sound: n.content.sound,
          trigger: n.trigger,
        }));
      }).catch(e => { (globalThis as { __tpsLocalRemindersLast?: unknown }).__tpsLocalRemindersLast = String(e); });
    },
  };
}
