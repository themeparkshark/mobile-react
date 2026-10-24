import { useAnimatedStyle } from 'react-native-reanimated';
import { catchDim, catchDimBack, catchShown, chromeBack } from './catchPresence';

/**
 * A map control layer that steps back on the tap frame of a catch and comes back in its stagger slot
 * (catchPresence.chromeBack). Full-screen layers drop the last few points into place with the spring
 * ('drop', so nothing scales around the screen centre); a compact control pops from 0.85 ('pop').
 * Slots: 0 the HUD chips (the close goal), 1 the menus, 2 the map's control rail, 3 edge arrows and cards.
 */
export function useChromeBack(slot: number, mode: 'drop' | 'pop' = 'drop', extraHidden = 0) {
  return useAnimatedStyle(() => {
    const c = chromeBack(slot, catchShown.value, catchDim.value, catchDimBack.value);
    const opacity = Math.max(0, c.opacity * (1 - extraHidden));
    if (mode === 'pop') return { opacity, transform: [{ scale: c.scale }] };
    return { opacity, transform: [{ translateY: -(1 - c.scale) * 48 }] };
  }, [slot, mode, extraHidden]);
}
