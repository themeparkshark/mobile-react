/**
 * audioRoute.ts: where the sound is going, and what that allows (pure).
 *
 *   - Whack v5: column panning only on a headphone route; pan is 0 on the speaker.
 *   - Line Party: only the crew host's phone plays music on speaker, quick rooms
 *     play no speaker music, and music turns on by itself on a headphone route.
 *   - Parade Beat races: the first speaker phone is the Lead Speaker; other
 *     speaker phones become Pocket seats (song gain 0, own keysounds only).
 *   - Calibration is stored per route (speaker / wired / bluetooth / airplay).
 *
 * The route comes from react-native-audio-api's AudioManager (getDevicesInfo
 * currentOutputs[].category = the AVAudioSessionPort name, plus routeChange
 * events), wired in audio/useAudioRoute.ts. No new native code.
 */

export type AudioRoute = 'speaker' | 'receiver' | 'wired' | 'bluetooth' | 'airplay' | 'car' | 'unknown';

/** Map an AVAudioSessionPort / Android device type string to a route. */
export function classifyPort(category: string): AudioRoute {
  const c = (category || '').toLowerCase();
  if (c.includes('speaker')) return 'speaker';
  if (c.includes('receiver') || c.includes('earpiece')) return 'receiver';
  if (c.includes('bluetooth') || c.includes('a2dp') || c.includes('hfp') || c.includes('ble')) return 'bluetooth';
  if (c.includes('headphone') || c.includes('headset') || c.includes('usb') || c.includes('lineout') || c.includes('wired')) return 'wired';
  if (c.includes('airplay')) return 'airplay';
  if (c.includes('car')) return 'car';
  if (c.includes('hdmi')) return 'airplay';
  return 'unknown';
}

/** The route for a list of current outputs (the most private one wins). */
export function routeFromOutputs(outputs: ReadonlyArray<{ category?: string; name?: string }>): AudioRoute {
  const order: AudioRoute[] = ['wired', 'bluetooth', 'receiver', 'car', 'airplay', 'speaker'];
  let best: AudioRoute = 'unknown';
  let bestRank = order.length;
  for (const o of outputs) {
    const r = classifyPort(o.category ?? o.name ?? '');
    const rank = order.indexOf(r);
    if (rank >= 0 && rank < bestRank) {
      best = r;
      bestRank = rank;
    }
  }
  return best;
}

/** Only this player hears it (headphones or Bluetooth buds). */
export function isPrivateRoute(route: AudioRoute): boolean {
  return route === 'wired' || route === 'bluetooth';
}

/** Stereo pan actually applied: full on a private route, 0 everywhere else. */
export function routePan(route: AudioRoute, pan: number): number {
  if (!isPrivateRoute(route)) return 0;
  return pan < -1 ? -1 : pan > 1 ? 1 : pan;
}

/** Calibration bucket for a route (core/calibration DEFAULT_ROUTE_LATENCY keys). */
export function calibrationRoute(route: AudioRoute): 'speaker' | 'wired' | 'bluetooth' | 'airplay' | 'unknown' {
  if (route === 'receiver') return 'speaker';
  if (route === 'car') return 'bluetooth';
  return route;
}

export type RoomKind = 'solo' | 'ghost' | 'crew' | 'quick';

export interface MusicPolicyInput {
  route: AudioRoute;
  roomKind: RoomKind;
  /** This phone hosts the crew room (or is the Lead Speaker). */
  isHost: boolean;
  /** The player's LinePlay music setting. */
  musicSetting: boolean;
}

/**
 * Line Party speaker policy: should this phone play the music bed?
 *   - headphones: always (the bed follows the player)
 *   - solo / ghost rounds: the normal music setting
 *   - live crew rooms on speaker: only the host's phone
 *   - live quick rooms on speaker: never (strangers in a queue)
 */
export function musicAllowed(p: MusicPolicyInput): boolean {
  if (isPrivateRoute(p.route)) return true;
  if (p.roomKind === 'solo' || p.roomKind === 'ghost') return p.musicSetting;
  if (p.roomKind === 'crew') return p.isHost && p.musicSetting;
  return false;
}

/**
 * Parade Beat race seats: 'lead' plays bed and drumline aloud; 'pocket' plays
 * own keysounds only (song gain 0); 'private' is on headphones and hears all.
 * `firstSpeakerSeat` is the lowest seat index whose phone is on a speaker.
 */
export function raceAudioRole(route: AudioRoute, seat: number, firstSpeakerSeat: number): 'lead' | 'pocket' | 'private' {
  if (isPrivateRoute(route)) return 'private';
  return seat === firstSpeakerSeat ? 'lead' : 'pocket';
}
