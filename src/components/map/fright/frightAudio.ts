/**
 * Sound for the fright map: one-shots through the app-wide sfxLimiter and a
 * quiet ambient bed. Everything respects the player's sound effects setting
 * (SFX.isEnabled, wired to the account in SoundEffectProvider) and fails
 * silently: audio is decoration.
 *
 * Silent switch: the app's audio session plays in silent mode
 * (MusicProvider sets playsInSilentModeIOS: true) and expo-av cannot read the
 * ringer switch, so the bed cannot follow it without a native module. It
 * follows the sound effects setting and the Spooky effects toggle instead.
 */
import { Audio } from 'expo-av';
import { useEffect, useRef } from 'react';
import { playLimited, sfxLimiter, SFX_PRIORITY } from '../../../audio/sfxLimiter';
import { SFX } from '../../../gamekit/SFX';
import { seededRandom } from './random';

export const FRIGHT_SOUNDS = {
  thunder: require('../../../../assets/sounds/fright/thunder-distant.mp3'),
  pop: require('../../../../assets/sounds/fright/critter-pop.mp3'),
  raven: require('../../../../assets/sounds/fright/raven-call.mp3'),
  wind: require('../../../../assets/sounds/fright/wind-howl.mp3'),
  bed: require('../../../../assets/sounds/fright/eerie-atmosphere-loop.mp3'),
  buzz: require('../../../../assets/sounds/fright/lantern-buzz-loop.mp3'),
} as const;

export const BED_VOLUME = 0.15;
export const BED_DUCKED = 0.05;
export const BUZZ_VOLUME = 0.08;

export function soundAllowed(): boolean {
  try {
    return SFX.isEnabled();
  } catch {
    return false;
  }
}

/** Play a one-shot through the limiter. Returns false when dropped or not allowed. */
export function playFrightSfx(name: string, source: number, volume: number, durationMs: number,
  priority: number = SFX_PRIORITY.whoosh): boolean {
  if (!soundAllowed()) return false;
  return playLimited(name, { priority, durationMs, dropIfActive: true }, () => {
    let sound: Audio.Sound | null = null;
    let stopped = false;
    void Audio.Sound.createAsync(source, { volume, shouldPlay: true }).then(({ sound: created }) => {
      sound = created;
      if (stopped) { void created.unloadAsync().catch(() => undefined); return; }
      created.setOnPlaybackStatusUpdate(status => {
        if (status.isLoaded && status.didJustFinish) void created.unloadAsync().catch(() => undefined);
      });
    }).catch(() => undefined);
    return () => {
      stopped = true;
      if (sound) void sound.stopAsync().then(() => sound?.unloadAsync()).catch(() => undefined);
    };
  });
}

/**
 * The ambient bed: the eerie loop at 0.15, ducked to 0.05 while any limited
 * app SFX plays, a wind gust or a raven every 45 to 120 s, and a lantern buzz
 * while the player stands by a lit haunt. Plays only while `on`.
 */
export function useFrightSoundBed(on: boolean, nearLantern: boolean): void {
  const buzzRef = useRef<Audio.Sound | null>(null);
  useEffect(() => {
    if (!on || !soundAllowed()) return;
    let live = true;
    let bed: Audio.Sound | null = null;
    let current = 0;
    const setVolume = (v: number) => {
      if (!bed || Math.abs(v - current) < 0.005) return;
      current = v;
      void bed.setVolumeAsync(v).catch(() => undefined);
    };
    void Audio.Sound.createAsync(FRIGHT_SOUNDS.bed, { isLooping: true, volume: 0, shouldPlay: true }).then(({ sound }) => {
      if (!live) { void sound.unloadAsync().catch(() => undefined); return; }
      bed = sound;
    }).catch(() => undefined);
    // Fade in over ~2 s, then follow the limiter for ducking.
    let ramp = 0;
    const duck = setInterval(() => {
      ramp = Math.min(1, ramp + 0.25);
      const target = sfxLimiter.active().some(v => !v.name.startsWith('fright-')) ? BED_DUCKED : BED_VOLUME;
      setVolume(target * ramp);
    }, 500);
    const random = seededRandom(Date.now());
    let gust: ReturnType<typeof setTimeout>;
    const scheduleGust = () => {
      gust = setTimeout(() => {
        if (!live) return;
        const raven = random() < 0.3;
        playFrightSfx(raven ? 'fright-raven' : 'fright-gust', raven ? FRIGHT_SOUNDS.raven : FRIGHT_SOUNDS.wind,
          raven ? 0.16 : 0.2, raven ? 1800 : 8000);
        scheduleGust();
      }, 45_000 + random() * 75_000);
    };
    scheduleGust();
    return () => {
      live = false;
      clearInterval(duck);
      clearTimeout(gust);
      const sound = bed;
      bed = null;
      if (sound) void sound.stopAsync().then(() => sound.unloadAsync()).catch(() => undefined);
    };
  }, [on]);

  useEffect(() => {
    if (!on || !nearLantern || !soundAllowed()) return;
    let live = true;
    void Audio.Sound.createAsync(FRIGHT_SOUNDS.buzz, { isLooping: true, volume: BUZZ_VOLUME, shouldPlay: true }).then(({ sound }) => {
      if (!live) { void sound.unloadAsync().catch(() => undefined); return; }
      buzzRef.current = sound;
    }).catch(() => undefined);
    return () => {
      live = false;
      const sound = buzzRef.current;
      buzzRef.current = null;
      if (sound) void sound.stopAsync().then(() => sound.unloadAsync()).catch(() => undefined);
    };
  }, [on, nearLantern]);
}
