/**
 * useAudioRoute: the live output route (speaker / wired / bluetooth ...) from
 * react-native-audio-api's AudioManager, pushed into GameAudio so pan and the
 * speaker policy follow it. JS-only on the current binary; on a binary without
 * the module the route stays 'unknown' (treated like the speaker: no pan).
 */

import { useEffect, useState } from 'react';
import { GameAudio } from './GameAudio';
import { routeFromOutputs, type AudioRoute } from '../core/audioRoute';

/* eslint-disable @typescript-eslint/no-explicit-any */
function audioManager(): any | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('react-native-audio-api');
    return mod?.AudioManager ?? null;
  } catch {
    return null;
  }
}

/** Read the current route once (null when the module is missing). */
export async function readAudioRoute(): Promise<AudioRoute | null> {
  const am = audioManager();
  if (!am || typeof am.getDevicesInfo !== 'function') return null;
  try {
    const info = await am.getDevicesInfo();
    return routeFromOutputs(info?.currentOutputs ?? []);
  } catch {
    return null;
  }
}

let listeners = 0;
let sub: { remove: () => void } | null = null;

/** Start following route changes app-wide (ref-counted). Returns a stop function. */
export function followAudioRoute(): () => void {
  listeners += 1;
  const refresh = () => void readAudioRoute().then((r) => { if (r) GameAudio.setRoute(r); });
  refresh();
  if (!sub) {
    const am = audioManager();
    try {
      sub = am?.addSystemEventListener?.('routeChange', refresh) ?? null;
    } catch {
      sub = null;
    }
  }
  return () => {
    listeners = Math.max(0, listeners - 1);
    if (listeners === 0 && sub) {
      try {
        sub.remove();
      } catch {
        // Already gone.
      }
      sub = null;
    }
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** React hook: the current route, kept live while mounted. */
export function useAudioRoute(): AudioRoute {
  const [route, setRoute] = useState<AudioRoute>(GameAudio.route);
  useEffect(() => {
    const stop = followAudioRoute();
    const off = GameAudio.onRouteChange((r) => setRoute(r));
    return () => {
      off();
      stop();
    };
  }, []);
  return route;
}
