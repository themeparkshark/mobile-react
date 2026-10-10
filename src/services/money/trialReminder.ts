/**
 * The free-trial reminder (money stream round 4, App Store 3.1.2 spirit): one local notification the
 * day before a VIP free trial turns into a paid plan, written to the grown-up. No server push.
 *
 * - Only when notifications are already allowed: this never asks for permission (a kids app does not
 *   prompt for a sale reminder). Best effort; a failure never touches the purchase.
 * - One reminder per trial; a new trial replaces the old one. The end is the server's real App Store
 *   period end when it has it. When VIP stops (cancelled and run out, refunded), the reminder is dropped.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'money:trial-reminder-id';

/** The reminder's words, exported for tests. Calm, to the grown-up, with how to cancel. */
export function trialReminderText(billing: string): { title: string; body: string } {
  return {
    title: 'For grown-ups: the VIP free trial ends tomorrow',
    body: `Tomorrow VIP becomes ${billing} unless it is turned off. To cancel: Settings, your name, Subscriptions.`,
  };
}

/** When it fires: 24 hours before the trial ends, or null when that is already past. Exported for tests. */
export function trialReminderAt(end: Date, now: Date = new Date()): Date | null {
  const at = new Date(end.getTime() - 24 * 3600_000);
  return at.getTime() > now.getTime() + 60_000 ? at : null;
}

/** The plan stopped (not VIP any more): drop a waiting reminder so it never fires for a plan that ended. */
export async function cancelTrialReminder(): Promise<void> {
  try {
    const old = await AsyncStorage.getItem(KEY).catch(() => null);
    if (!old) return;
    const Notifications = require('expo-notifications') as typeof import('expo-notifications');
    await Notifications.cancelScheduledNotificationAsync(old).catch(() => undefined);
    await AsyncStorage.removeItem(KEY).catch(() => undefined);
  } catch {
    // best effort
  }
}

export async function scheduleTrialReminder(end: Date, billing: string): Promise<void> {
  try {
    const at = trialReminderAt(end);
    if (!at) return;
    const Notifications = require('expo-notifications') as typeof import('expo-notifications');
    const perm = await Notifications.getPermissionsAsync();
    if (!perm.granted) return;
    const old = await AsyncStorage.getItem(KEY).catch(() => null);
    if (old) await Notifications.cancelScheduledNotificationAsync(old).catch(() => undefined);
    const { title, body } = trialReminderText(billing);
    const id = await Notifications.scheduleNotificationAsync({
      content: { title, body },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at },
    });
    await AsyncStorage.setItem(KEY, id).catch(() => undefined);
  } catch {
    // Best effort: never blocks or breaks a purchase.
  }
}
