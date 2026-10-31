/**
 * Where rewards fly (core loop 4.2): Shark Coins and Tickets to their header pills, Energy to the
 * Shelf button (it is spent on the coin card), XP to the Profile tab. The header pills register
 * themselves; this registers the Shelf button and the Profile tab as fly targets.
 */
import { useCallback, useEffect, useRef } from 'react';
import { Dimensions, type View } from 'react-native';
import { useCurrencyFly } from '../../context/CurrencyFlyProvider';

/** The Profile tab's centre: the last of the five footer icons, measured from the bottom-right corner. */
export function profileTabCenter(width: number, height: number, bottomInset: number): { x: number; y: number } {
  return { x: width - width / 10 - 18, y: height - Math.max(bottomInset, 8) - 22 };
}

/** Registers a view's centre as the fly target `name` (re-measured on layout). Pass a ref the view already has, or use the one returned. */
export function useFlyAnchor(name: string, existing?: React.RefObject<View | null>): { ref: React.RefObject<View | null>; onLayout: () => void } {
  const { registerTarget } = useCurrencyFly();
  const own = useRef<View>(null);
  const ref = existing ?? own;
  const measure = useCallback(() => {
    requestAnimationFrame(() => ref.current?.measureInWindow((x, y, w, h) => {
      if (Number.isFinite(x) && Number.isFinite(y) && w > 0) registerTarget(name, x + w / 2, y + h / 2);
    }));
  }, [name, registerTarget]);
  return { ref, onLayout: measure };
}

/** XP flies to the Profile tab in the footer. */
export function useProfileTabAnchor(bottomInset: number): void {
  const { registerTarget } = useCurrencyFly();
  useEffect(() => {
    const { width, height } = Dimensions.get('window');
    const at = profileTabCenter(width, height, bottomInset);
    registerTarget('xp', at.x, at.y);
  }, [registerTarget, bottomInset]);
}
