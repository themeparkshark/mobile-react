/**
 * reverbSocket: a pusher-js client for Laravel Reverb that runs on Hermes
 * without native modules.
 *
 * pusher-js's React Native build imports @react-native-community/netinfo, a
 * native module this dev client does not have. The worker build only needs
 * WebSocket and fetch, which React Native provides; it reads `self` and uses
 * crypto.getRandomValues for a stats session id, which Hermes lacks. Both are
 * covered here. Reachability comes from AppState in PartyClient instead of
 * NetInfo, and channel auth goes through the app's own API client (Sanctum).
 */
import type { Authorize, SocketLike } from './PartyClient';

export interface ReverbConfig {
  key: string;
  host: string;
  port: number;
  /** wss:// in production, ws:// only against a local dev server. */
  tls: boolean;
}

let PusherCtor: any = null;
let pusherMissing = false;

function loadPusher(): any {
  if (PusherCtor || pusherMissing) return PusherCtor;
  const g = globalThis as any;
  if (typeof g.self === 'undefined') g.self = g;
  try {
    // Optional dependency (Expo's Metro allows it inside try/catch): a build
    // without pusher-js still runs Line Party over HTTP polling.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('pusher-js/dist/worker/pusher.worker.js');
    PusherCtor = mod?.default ?? mod;
  } catch {
    pusherMissing = true;
    return null;
  }
  if (!(g.crypto && typeof g.crypto.getRandomValues === 'function')) {
    // Only seeds pusher's anonymous stats session id; never used for security.
    PusherCtor.Runtime.randomInt = (max: number) => Math.floor(Math.random() * max);
  }
  return PusherCtor;
}

/** A Reverb socket, or null when pusher-js is not in this build (HTTP polling then). */
export function createReverbSocket(config: ReverbConfig, authorize: Authorize): SocketLike | null {
  const Pusher = loadPusher();
  if (!Pusher) return null;
  return new Pusher(config.key, {
    wsHost: config.host,
    wsPort: config.port,
    wssPort: config.port,
    forceTLS: config.tls,
    enabledTransports: config.tls ? ['wss'] : ['ws'],
    cluster: '',
    disableStats: true,
    activityTimeout: 30000,
    pongTimeout: 8000,
    unavailableTimeout: 6000,
    channelAuthorization: {
      customHandler: ({ socketId, channelName }: { socketId: string; channelName: string }, callback: (e: Error | null, auth: any) => void) => {
        authorize(socketId, channelName)
          .then((auth) => callback(null, auth))
          .catch((e) => callback(e instanceof Error ? e : new Error('auth failed'), null));
      },
    },
  }) as SocketLike;
}

/** Reverb settings from the bundle (EXPO_PUBLIC_*), or null to run HTTP-only. */
export function reverbConfigFromEnv(env: Record<string, string | undefined>): ReverbConfig | null {
  const key = env.EXPO_PUBLIC_REVERB_KEY;
  const host = env.EXPO_PUBLIC_REVERB_HOST;
  if (!key || !host) return null;
  const tls = (env.EXPO_PUBLIC_REVERB_SCHEME ?? 'https') === 'https';
  const port = Number(env.EXPO_PUBLIC_REVERB_PORT ?? (tls ? 443 : 80));
  return { key, host, port: Number.isFinite(port) ? port : 443, tls };
}
