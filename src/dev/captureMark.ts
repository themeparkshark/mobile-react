/**
 * Release-like hook capture only (EXPO_PUBLIC_MOTION_CAPTURE=HookSoundPreview, set by the lane tooling, never in a store
 * or OTA bundle): logs the UI-thread frame where a shared value crosses a threshold (a lid's peak, a pip's pop), so the
 * capture can put each buzz and sound next to the frame it belongs to. In every other bundle the flag is inlined to
 * false and this is an empty function: no reaction, no work.
 */
import { runOnJS, useAnimatedReaction, type SharedValue } from 'react-native-reanimated';
import { captureLine } from '../gamekit/audio/studioTrace';

const ON = process.env.EXPO_PUBLIC_MOTION_CAPTURE === 'HookSoundPreview';

function log(label: string, at: number): void {
  captureLine(`[frame] ${at} ${label}`);
}

type Mark = (value: SharedValue<number>, label: string, threshold: number, dir?: 'up' | 'down') => void;

function useMark(value: SharedValue<number>, label: string, threshold: number, dir: 'up' | 'down' = 'up'): void {
  useAnimatedReaction(() => (dir === 'up' ? value.value >= threshold : value.value <= threshold), (hit, was) => {
    if (hit && was === false) runOnJS(log)(label, Date.now());
  });
}
function noMark(): void { /* every bundle but the hook capture */ }

/** Picked once per bundle (ON is an inlined constant), so a component always calls the same one: hook order holds. */
export const useCaptureMark: Mark = ON ? useMark : noMark;
