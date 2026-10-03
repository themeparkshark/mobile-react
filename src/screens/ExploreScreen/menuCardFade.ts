import { useEffect } from 'react';
import { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import * as QuickMenu from '../../components/QuickAccessMenu';
import useReducedGameMotion from '../../hooks/useReducedGameMotion';
import { catchShown } from './catchPresence';

const NEVER_OPEN = () => false;
/** The quick menu's open state (QuickAccessMenu.useQuickMenuOpen, from the menu branch), when present. */
export const useMenuOpen: () => boolean = (QuickMenu as { useQuickMenuOpen?: () => boolean }).useQuickMenuOpen ?? NEVER_OPEN;

/**
 * Floating cards on the home map (the focus card, the find card, status and chips) leave while the quick
 * menu is open: opacity 0 over 150 ms (instant under Reduce Motion) and no touches, so nothing reads
 * through the menu's scrim. They also leave on the tap frame of a catch.
 */
export function useMenuCardFade() {
  const menuOpen = useMenuOpen();
  const reduced = useReducedGameMotion();
  const shown = useSharedValue(menuOpen ? 0 : 1);
  useEffect(() => {
    shown.value = withTiming(menuOpen ? 0 : 1, { duration: reduced ? 0 : 150 });
  }, [menuOpen, reduced, shown]);
  const style = useAnimatedStyle(() => ({ opacity: Math.max(0, 1 - catchShown.value * 1.6) * shown.value }));
  const pointerEvents: 'none' | 'box-none' = menuOpen ? 'none' : 'box-none';
  return { style, pointerEvents, menuOpen };
}
