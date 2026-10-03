/**
 * The fright layer's derived state, shared by the map-anchored sources (inside
 * MapView) and the screen-space overlay (above it). Both compute it from the
 * same input, so they always agree without a provider around the MapView.
 */
import { useEffect, useRef, useState } from 'react';
import { makeMutable } from 'react-native-reanimated';
import { useMapAlive } from '../alive/MapAliveContext';
import { frightCaps, frightTier, frightVisibility, isLivePhase, showLiveFromSpots } from './frightBudget';
import type { FrightMapInput } from './types';

/**
 * The intro cinematic's progress, 0..1 over ~4 s (1 when no intro plays).
 * One UI-thread value: the overlay drives it, the lanterns read it.
 */
export const frightIntro = makeMutable(1);

export function useFrightState(input: FrightMapInput) {
  const alive = useMapAlive();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!alive.active) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, [alive.active]);

  const serverNow = now + (Number.isFinite(input.nowOffsetMs) ? input.nowOffsetMs : 0);
  const { phase, night, spots, enabled } = input.tonight;
  const livePhase = enabled && input.active && isLivePhase(phase);
  const wasActive = useRef(false);
  if (livePhase) wasActive.current = true;
  else if (phase === 'off') wasActive.current = false;
  const visible = enabled ? frightVisibility({ active: input.active, phase, serverNowMs: serverNow, night, wasActive: wasActive.current }) : 0;
  const tier = frightTier({ alive: alive.tier, spooky: input.spooky, reducedMotion: alive.reducedMotion });
  const caps = frightCaps(tier);
  const showLive = !!input.showLive || showLiveFromSpots(spots, serverNow);
  const quiet = !!input.quiet;
  // Sprites move: the ambient clock runs, the tier allows it, and no night show is on.
  const moving = alive.running && tier !== 'calm' && visible > 0 && !showLive;
  // Thunder, pops, haptics and sound: the mode is ON, Spooky effects on, phones up, map on screen.
  const effectsOn = livePhase && input.spooky && !quiet && tier !== 'calm' && alive.active;
  return { alive, serverNow, phase, visible, tier, caps, showLive, livePhase, quiet, moving, effectsOn };
}

export type FrightState = ReturnType<typeof useFrightState>;
