/**
 * The free-trial reminder (money stream round 4, App Store 3.1.2 spirit): one local notification the
 * day before a VIP free trial turns into a paid plan, written to the grown-up. No server push.
 *
 * - Only when notifications are already allowed: this never asks for permission (a kids app does not
 *   prompt for a sale reminder). Best effort; a failure never touches the purchase.
 * - One reminder per trial (an id per end day); a new trial replaces the old one.
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
      content: { title, body, data: { screen: 'Membership' } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at },
    });
    await AsyncStorage.setItem(KEY, id).catch(() => undefined);
  } catch {
    // Best effort: never blocks or breaks a purchase.
  }
}
