import { Audio } from 'expo-av';

/**
 * Studio mute: EXPO_PUBLIC_STUDIO_MUTE=1 keeps every sound silent on test simulators, in dev and in
 * release-like JS. Only the polish lane tooling sets it at bundle time; store and OTA bundles never do.
 * GameAudio pins its master gain to 0 on the same flag; this covers every expo-av Sound (menu music,
 * screen sounds, game banks) by forcing isMuted on load, status changes and replays.
 */
export const STUDIO_MUTE = process.env.EXPO_PUBLIC_STUDIO_MUTE === '1';

type Status = Record<string, unknown>;

if (STUDIO_MUTE) {
  const proto = Audio.Sound.prototype as unknown as {
    loadAsync: (source: unknown, initialStatus?: Status, downloadFirst?: boolean) => Promise<unknown>;
    setStatusAsync: (status: Status) => Promise<unknown>;
    replayAsync: (status?: Status) => Promise<unknown>;
  };
  const load = proto.loadAsync;
  const setStatus = proto.setStatusAsync;
  const replay = proto.replayAsync;
  proto.loadAsync = function (source, initialStatus = {}, downloadFirst) {
    return load.call(this, source, { ...initialStatus, isMuted: true }, downloadFirst);
  };
  proto.setStatusAsync = function (status = {}) {
    return setStatus.call(this, { ...status, isMuted: true });
  };
  proto.replayAsync = function (status = {}) {
    return replay.call(this, { ...status, isMuted: true });
  };
}
