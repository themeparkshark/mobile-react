/**
 * Push notifications for live moments (a boss surfacing, a Rush, your team
 * losing a ride). We never ask at launch: the soft ask appears where it makes
 * sense (live parks, boss raids), and the iOS prompt only follows a tap.
 */
import { openServerRoute } from '../components/GrownUpGate';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import client from '../api/client';
import * as RootNavigation from '../RootNavigation';

export type PushState = 'granted' | 'undetermined' | 'denied' | 'unsupported';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: false }),
});

export async function pushState(): Promise<PushState> {
  if (Platform.OS !== 'ios' || !Device.isDevice) return 'unsupported';
  const { status } = await Notifications.getPermissionsAsync();
  return status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'undetermined';
}

async function register(): Promise<boolean> {
  const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
  const { data: token } = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
  if (!token) return false;
  await client.post('/me/push-tokens', { token, provider: 'expo', platform: 'ios' });
  return true;
}

/**
 * Sign-out: detach this device from the account so the next player on a
 * shared iPad never gets the last player's pushes. Best effort, 3 s cap.
 */
export async function unregisterPush(): Promise<void> {
  try {
    if ((await pushState()) !== 'granted') return;
    const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
    const { data: token } = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    if (!token) return;
    await client.delete('/me/push-tokens', { data: { token }, timeout: 3000 });
  } catch { /* offline or already gone: the server prunes dead tokens */ }
}

/** Ask (after the player tapped "turn on"), then register this device. */
export async function enablePush(): Promise<PushState> {
  const state = await pushState();
  if (state === 'unsupported' || state === 'denied') return state;
  if (state === 'undetermined') {
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') return 'denied';
  }
  await register().catch(() => false);
  return 'granted';
}

/** On sign-in: keep an already-allowed device's token fresh. Never prompts. */
export async function refreshPushRegistration(): Promise<void> {
  if ((await pushState()) === 'granted') await register().catch(() => false);
}

type PushRoute = { screen?: string; params?: object };
const routeOf = (response: Notifications.NotificationResponse | null) =>
  response?.notification.request.content.data?.route as PushRoute | undefined;

// A tap that launched the app waits here until sign-in and Loading are done;
// opened earlier, the Loading hop to Explore would wipe it out.
let coldStartRoute: PushRoute | null = null;

/** Loading calls this right after it lands on Explore. */
export function openColdStartPush(): void {
  const route = coldStartRoute;
  coldStartRoute = null;
  if (route?.screen) openServerRoute(route.screen, route.params ?? {});
}

/** A tapped notification opens the screen it names. */
export function listenForPushTaps(): () => void {
  const open = (response: Notifications.NotificationResponse | null) => {
    const route = routeOf(response);
    // Server-named screens: the paywall is gated (openServerRoute), never opened directly.
    if (route?.screen) openServerRoute(route.screen, route.params ?? {});
  };
  Notifications.getLastNotificationResponseAsync()
    .then(response => { const route = routeOf(response); if (route?.screen) coldStartRoute = route; })
    .catch(() => undefined);
  const sub = Notifications.addNotificationResponseReceivedListener(open);
  return () => sub.remove();
}
