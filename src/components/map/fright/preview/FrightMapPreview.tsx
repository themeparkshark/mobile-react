import { useEffect, useMemo, useState } from 'react';
import Map from '../../../Map';
import type { FrightMapInput } from '../types';
import { usfFrightFixture } from './usfFixture';

/**
 * Development-only visual QA for the Fin-ister Nights map (captures): the
 * real map with the USF fixture. EXPO_PUBLIC_FRIGHT_SCENE pins one scene
 * (intro, live, early, calm, done, show); otherwise it plays the intro, then live.
 * Set the simulator location to USF (28.4767, -81.4687). Not routed by
 * default: register it next to MapAlivePreviewScreen to use it.
 */
export default function FrightMapPreview() {
  const scene = process.env.EXPO_PUBLIC_FRIGHT_SCENE ?? 'intro';
  const [now] = useState(() => Date.now());
  const [cinematic, setCinematic] = useState<'intro' | null>(scene === 'intro' ? 'intro' : null);
  useEffect(() => { console.log(`FRIGHT_SCENE ${scene}`); }, [scene]);
  const fright = useMemo<FrightMapInput>(() => ({
    tonight: usfFrightFixture(now, scene === 'early' ? 'early' : 'live', scene === 'show'),
    active: true,
    nowOffsetMs: 0,
    player: { latitude: 28.4756, longitude: -81.4679 },
    spooky: scene !== 'calm',
    doneKeys: scene === 'done' ? ['usf26-tug-of-the-tides', 'usf26-robot-city', 'usf26-robot-city'] : [],
    cinematic,
    onCinematicDone: () => setCinematic(null),
  }), [now, scene, cinematic]);
  return <Map fright={fright}>{null}</Map>;
}
