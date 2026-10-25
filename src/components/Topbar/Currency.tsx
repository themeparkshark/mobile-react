import { Image } from 'expo-image';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import Reanimated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';
import { Animated, Text, View, TouchableOpacity, StyleSheet } from 'react-native';
import shortenNumber from '../../helpers/shorten-number';
import { useCurrencyFly } from '../../context/CurrencyFlyProvider';
import { useHelp } from '../help/HelpProvider';
import { glossaryKeyForName } from '../../services/help/glossary';
import { counterStep, counterTicks } from '../../services/retention/counterTicks';
import { withDelayAfter } from '../retention/delayUntil';

interface CurrencyProps {
  /** Remote icon URL or a bundled require(); falls back to the gold coin. */
  image?: string | number | null;
  count: number;
  name?: string;
  flyTarget?: string;
}

const FALLBACK_ICON = require('../../../assets/images/coingold.png');

export default function Currency({ image, count, name, flyTarget }: CurrencyProps) {
  const { registerTarget } = useCurrencyFly();
  const containerRef = useRef<View>(null);

  const measureAndRegister = useCallback(() => {
    if (flyTarget && containerRef.current) {
      containerRef.current.measureInWindow((x, y, width, height) => {
        if (x !== undefined && y !== undefined) {
          registerTarget(flyTarget, x + width / 2, y + height / 2);
        }
      });
    }
  }, [flyTarget, registerTarget]);
  const [displayCount, setDisplayCount] = useState(count);
  const [showTooltip, setShowTooltip] = useState(false);
  const prevCount = useRef(count);
  const shown = useRef(count);
  shown.current = displayCount;
  const queuedRef = useRef<number | null>(null);
  /** A prize flight is landing here: the number steps up per icon, and the read-back balance waits its turn. */
  const flight = useRef<{ until: number; timers: ReturnType<typeof setTimeout>[] } | null>(null);
  /** The number the last flight counted up to: shown until the read-back balance arrives (read after the moment). */
  const expect = useRef<number | null>(null);
  /**
   * A prize flight announced ahead: its new number is mounted hidden in the render that starts the flight and swapped
   * in on the UI thread as the first prize lands (no render while the prizes fly or the next card grows in).
   */
  const [queued, setQueued] = useState<number | null>(null);
  queuedRef.current = queued;
  const swap = useSharedValue(0);
  useEffect(() => {
    if (!flyTarget) return;
    return counterTicks.subscribeSwap(flyTarget, sw => {
      const base = expect.current ?? shown.current;
      expect.current = base + sw.amount;
      queuedRef.current = base + sw.amount;
      setQueued(base + sw.amount);
      swap.value = 0;
      swap.value = withDelayAfter(sw.mark as SharedValue<number>, sw.stepAt, withTiming(1, { duration: 90 }));
    });
  }, [flyTarget]); // eslint-disable-line react-hooks/exhaustive-deps
  // The read-back balance is in (the plain number shows it now): the swap layer goes, after that render is on screen.
  const hadQueued = useRef(false);
  useLayoutEffect(() => {
    if (queued !== null) { hadQueued.current = true; return; }
    if (hadQueued.current) { hadQueued.current = false; swap.value = 0; }
  }, [queued]); // eslint-disable-line react-hooks/exhaustive-deps
  /** The icon's hop as each prize lands (UI thread). */
  const hop = useSharedValue(1);
  const hopStyle = useAnimatedStyle(() => ({ transform: [{ scale: hop.value }] }));
  const oldNum = useAnimatedStyle(() => ({ opacity: 1 - swap.value }));
  const newNum = useAnimatedStyle(() => ({ opacity: swap.value, transform: [{ scale: 1 + 0.12 * (1 - swap.value) }] }));
  
  // Tooltip animation
  const tooltipAnim = useRef(new Animated.Value(0)).current;
  const tooltipScale = useRef(new Animated.Value(0.8)).current;
  
  // Idle pulse animation (gentle breathing)
  const pulseAnim = useRef(new Animated.Value(1)).current;
  
  // Bounce animation for value changes
  const bounceAnim = useRef(new Animated.Value(1)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  
  // Idle pulse disabled - was causing distracting flashing
  // useEffect(() => {
  //   const pulse = Animated.loop(
  //     Animated.sequence([
  //       Animated.timing(pulseAnim, {
  //         toValue: 1.08,
  //         duration: 1500,
  //         useNativeDriver: true,
  //       }),
  //       Animated.timing(pulseAnim, {
  //         toValue: 1,
  //         duration: 1500,
  //         useNativeDriver: true,
  //       }),
  //     ])
  //   );
  //   pulse.start();
  //   return () => pulse.stop();
  // }, []);
  
  // Show/hide tooltip animation
  useEffect(() => {
    if (showTooltip) {
      Animated.parallel([
        Animated.spring(tooltipAnim, {
          toValue: 1,
          friction: 6,
          tension: 100,
          useNativeDriver: true,
        }),
        Animated.spring(tooltipScale, {
          toValue: 1,
          friction: 6,
          tension: 100,
          useNativeDriver: true,
        }),
      ]).start();
      
      // Auto-hide after 2 seconds
      const timer = setTimeout(() => {
        setShowTooltip(false);
      }, 2000);
      
      return () => clearTimeout(timer);
    } else {
      Animated.parallel([
        Animated.timing(tooltipAnim, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(tooltipScale, {
          toValue: 0.8,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [showTooltip]);
  
  // Prizes landing from a flight: one step per icon, each with a little hop.
  useEffect(() => {
    if (!flyTarget) return;
    const off = counterTicks.subscribe(flyTarget, plan => {
      flight.current?.timers.forEach(clearTimeout);
      const base = shown.current;
      const n = plan.landings.length;
      const last = Math.max(...plan.landings);
      // Every landing hops the icon (native driver, no render). In a whole flight the number changes once, together
      // with every other counter (one render for the HUD), as soon as each has its first prize in; on its own it steps
      // per landing.
      // Announced ahead (the number swaps in on the UI thread): only the hops here.
      const swapped = queuedRef.current !== null;
      const step = swapped ? undefined : plan.step;
      if (!swapped) expect.current = base + plan.amount;
      if (step) step(() => setDisplayCount(base + plan.amount));
      const timers = plan.landings.map((ms, i) => setTimeout(() => {
        if (!step && !swapped) setDisplayCount(counterStep(base, plan.amount, i, n));
        // On the UI thread: a native-driver spring ends with a React render (Fabric syncs its final value), one per
        // landing; this hop never renders.
        hop.value = withSequence(withTiming(1.18, { duration: 0 }), withSpring(1, { damping: 7, stiffness: 260 }));
      }, ms));
      // After the last landing the counted-up number stays until the balance is read back (normally the same number,
      // so nothing moves, and no render at all if it is already in).
      timers.push(setTimeout(() => {
        flight.current = null;
        if (expect.current === null) setDisplayCount(prevCount.current);
      }, last + 450));
      flight.current = { until: Date.now() + last + 450, timers };
    });
    return () => { off(); flight.current?.timers.forEach(clearTimeout); };
  }, [flyTarget]); // eslint-disable-line react-hooks/exhaustive-deps

  // Bounce + tick animation when value changes
  useEffect(() => {
    if (flight.current && prevCount.current !== count) {
      // The read-back balance arrived mid-flight: the landings already count it up.
      prevCount.current = count;
      expect.current = null;
      return;
    }
    if (expect.current !== null && prevCount.current !== count) {
      const counted = expect.current;
      expect.current = null;
      // The balance the landings already counted up to: nothing moves.
      if (count === counted) { prevCount.current = count; setDisplayCount(count); setQueued(null); return; }
      setQueued(null);
      // Something else changed too: roll on from the number on screen (never back down to the old balance first).
      prevCount.current = counted;
    }
    if (prevCount.current !== count) {
      const increased = count > prevCount.current;
      
      // Bounce the icon
      Animated.sequence([
        Animated.parallel([
          // Pop up
          Animated.spring(bounceAnim, {
            toValue: 1.25,
            friction: 3,
            useNativeDriver: true,
          }),
          Animated.timing(translateY, {
            toValue: increased ? -8 : 4,
            duration: 150,
            useNativeDriver: true,
          }),
        ]),
        // Settle back
        Animated.parallel([
          Animated.spring(bounceAnim, {
            toValue: 1,
            friction: 4,
            useNativeDriver: true,
          }),
          Animated.timing(translateY, {
            toValue: 0,
            duration: 200,
            useNativeDriver: true,
          }),
        ]),
      ]).start();
      
      // Animate number tick (if increase)
      if (increased && count - prevCount.current <= 50) {
        // Tick up for small changes
        const start = prevCount.current;
        const end = count;
        const duration = 400;
        const startTime = Date.now();
        
        const tick = () => {
          const elapsed = Date.now() - startTime;
          const progress = Math.min(elapsed / duration, 1);
          // Ease out
          const eased = 1 - Math.pow(1 - progress, 3);
          const current = Math.round(start + (end - start) * eased);
          setDisplayCount(current);
          
          if (progress < 1) {
            requestAnimationFrame(tick);
          }
        };
        tick();
      } else {
        setDisplayCount(count);
      }
      
      prevCount.current = count;
    }
  }, [count]);
  
  // Sync display if count changes externally without animation
  useEffect(() => {
    if (!flight.current && expect.current === null && displayCount !== count && prevCount.current === count) {
      setDisplayCount(count);
    }
  }, [count, displayCount]);

  const { explain, glossary } = useHelp();
  const term = glossaryKeyForName(name);
  // Known currencies open the "What's this?" sheet; anything else keeps the name tooltip.
  const handlePress = () => {
    if (term) { explain(term, { count }); return; }
    setShowTooltip(prev => !prev);
  };
  const label = term ? glossary[term].label : name || 'Your stuff';

  return (
    <View style={styles.container} ref={containerRef} onLayout={measureAndRegister}>
      <TouchableOpacity onPress={handlePress} activeOpacity={0.7} accessibilityRole="button"
        accessibilityLabel={`${label}: ${count.toLocaleString()}`} accessibilityHint={term ? 'Tells you what this is and how to get more' : undefined}>
        <View style={styles.currencyRow}>
          <Animated.View
            style={{
              position: 'absolute',
              left: -18,
              top: -5,
              transform: [
                { scale: Animated.multiply(pulseAnim, bounceAnim) },
                { translateY: translateY },
              ],
            }}
          >
            <Reanimated.View style={hopStyle}>
              <Image
                source={typeof image === 'number' ? image : image ? { uri: image } : FALLBACK_ICON}
                placeholder={FALLBACK_ICON}
                style={styles.icon}
                contentFit="contain"
              />
            </Reanimated.View>
          </Animated.View>
          <View style={styles.countBox}>
            <Reanimated.Text style={[styles.countText, styles.countIn, oldNum]} numberOfLines={1} adjustsFontSizeToFit>
              {shortenNumber(displayCount)}
            </Reanimated.Text>
            {queued !== null && (
              <View style={styles.countOver} pointerEvents="none">
                <Reanimated.Text style={[styles.countText, styles.countIn, newNum]} numberOfLines={1} adjustsFontSizeToFit>
                  {shortenNumber(queued)}
                </Reanimated.Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
      
      {/* Tooltip popup */}
      <Animated.View 
        style={[
          styles.tooltip,
          {
            opacity: tooltipAnim,
            transform: [
              { scale: tooltipScale },
              { translateY: tooltipAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [-5, 0],
              })},
            ],
          },
        ]}
        pointerEvents="none"
      >
        <View style={styles.tooltipArrow} />
        <View style={styles.tooltipContent}>
          <Text style={styles.tooltipName}>{name || 'Your stuff'}</Text>
          <Text style={styles.tooltipCount}>{count.toLocaleString()}</Text>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  // Every balance wears the same pill: icon riding the left edge, number
  // centered in a navy capsule, so the bar reads as one tidy set.
  currencyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 30,
    minWidth: 72,
    marginLeft: 14,
    paddingLeft: 24,
    paddingRight: 10,
    borderRadius: 15,
    backgroundColor: 'rgba(3, 36, 82, 0.5)',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.9)',
  },
  icon: {
    width: 36,
    height: 36,
  },
  // The number's box takes the pill's free width; a queued number sits exactly over the shown one.
  countBox: { flex: 1, justifyContent: 'center' },
  countIn: { flex: 0, alignSelf: 'stretch' },
  countOver: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, justifyContent: 'center' },
  countText: {
    flex: 1,
    textAlign: 'center',
    fontSize: 19,
    color: 'white',
    fontFamily: 'Shark',
    textTransform: 'uppercase',
    textShadowColor: 'rgba(0, 0, 0, .5)',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 0,
  },
  tooltip: {
    position: 'absolute',
    top: '100%',
    left: '50%',
    marginLeft: -60,
    marginTop: 8,
    alignItems: 'center',
    zIndex: 1000,
  },
  tooltipArrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderBottomWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: 'rgba(0, 0, 0, 0.85)',
    marginBottom: -1,
  },
  tooltipContent: {
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    minWidth: 120,
    alignItems: 'center',
  },
  tooltipName: {
    color: '#facc15',
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 2,
  },
  tooltipCount: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
    fontFamily: 'Shark',
  },
});
