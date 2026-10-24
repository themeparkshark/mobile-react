/**
 * List rows that arrive one after another, only the first time a list paints.
 *
 *   <Animated.View entering={firstPaint && staggerIn(index)}>{row}</Animated.View>
 *
 * Each row rises STAGGER.risePt and fades in over DURATION.base on EASE.out, STAGGER.stepMs apart;
 * only the first STAGGER.maxItems rows animate and the whole list lands inside STAGGER.capMs.
 * Rows scrolled into view later, refreshed data and Reduce Motion get no entrance (undefined).
 * Reanimated layout animations run on the UI thread.
 */
import { Easing, FadeInDown } from 'react-native-reanimated';
import { BEZIER, DURATION, staggerDelay } from './motion';

const OUT = Easing.bezierFn(BEZIER.out[0], BEZIER.out[1], BEZIER.out[2], BEZIER.out[3]);

export function staggerIn(index: number, options: { readonly count?: number; readonly reduced?: boolean } = {}) {
  if (options.reduced) return undefined;
  const delay = staggerDelay(index, options.count);
  if (delay === null) return undefined;
  return FadeInDown.delay(delay).duration(DURATION.base).easing(OUT);
}
