import { useCallback, useContext, useRef } from 'react';
import { SoundEffectContext } from '../../context/SoundEffectProvider';

const tapSound = require('../../../assets/sounds/tap.mp3');

/**
 * The tap sound as a function whose identity never changes. SoundEffectProvider
 * hands out a new playSound whenever the player updates; holding it in a ref
 * keeps memoized cards and reader pages from re-drawing because of it.
 */
export default function useTapSound(): () => void {
  const { playSound } = useContext(SoundEffectContext);
  const ref = useRef(playSound);
  ref.current = playSound;
  return useCallback(() => ref.current(tapSound), []);
}
