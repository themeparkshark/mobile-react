import { Image } from 'expo-image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Text, View, TouchableOpacity, StyleSheet } from 'react-native';
import Reanimated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import useReducedGameMotion from '../../hooks/useReducedGameMotion';
import { DURATION, EASE, HUD_BUMP } from '../../ui/motionEasing';
import { GOLD_FX } from '../../ui/motion';
import { rollMs } from '../map/alive/mapWow';
import RollingDigits from './RollingDigits';
import { onHudPulse } from './hudPulse';
import shortenNumber from '../../helpers/shorten-number';
import { useCurrencyFly } from '../../context/CurrencyFlyProvider';
import { useHelp } from '../help/HelpProvider';
import { glossaryKeyForName } from '../../services/help/glossary';

interface CurrencyProps {
  /** Remote icon URL or a bundled require(); falls back to the gold coin. */
  image?: string | number | null;
  count: number;
  name?: string;
  flyTarget?: string;
}

const FALLBACK_ICON = require('../../../assets/images/coingold.png');
const COUNT_FONT = 19;
/** The icon's centre from the chip container's left edge (currencyRow marginLeft 14, icon left -18, 36 wide). */
const ICON_CENTER_X = 14 - 18 + 18;
/** "+25", "+1,200" for the float-up over the chip. */
function countText(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

export default function Currency({ image, count, name, flyTarget }: CurrencyProps) {
  const { registerTarget } = useCurrencyFly();
  const containerRef = useRef<View>(null);

  const measureAndRegister = useCallback(() => {
    if (flyTarget && containerRef.current) {
      containerRef.current.measureInWindow((x, y, width, height) => {
        if (x !== undefined && y !== undefined) {
          // Coins aim at the icon riding the chip's left edge (it punches as they land), never at the
          // middle, where a pile of landing coins would cover the digits rolling up.
          registerTarget(flyTarget, x + ICON_CENTER_X, y + height / 2);
        }
      });
    }
  }, [flyTarget, registerTarget]);
  const [showTooltip, setShowTooltip] = useState(false);

  // Tooltip animation
  const tooltipAnim = useRef(new Animated.Value(0)).current;
  const tooltipScale = useRef(new Animated.Value(0.8)).current;

  // Show/hide tooltip animation
  useEffect(() => {
    if (showTooltip) {
      Animated.parallel([
        Animated.spring(tooltipAnim, { toValue: 1, friction: 6, tension: 100, useNativeDriver: true }),
        Animated.spring(tooltipScale, { toValue: 1, friction: 6, tension: 100, useNativeDriver: true }),
      ]).start();
      // Auto-hide after 2 seconds
      const timer = setTimeout(() => setShowTooltip(false), 2000);
      return () => clearTimeout(timer);
    }
    Animated.parallel([
      Animated.timing(tooltipAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
      Animated.timing(tooltipScale, { toValue: 0.8, duration: 150, useNativeDriver: true }),
    ]).start();
    return undefined;
  }, [showTooltip]);

  // ── The counter (Brawl Stars / Clash Royale chips): the number rolls like an odometer, the icon
  // punches to HUD_BUMP when a coin lands, a soft gold glow says "you got more" and "+N" floats up.
  // A spend just rolls down quietly. A coin flying in holds the roll until it lands (hudPulse).
  const reduced = useReducedGameMotion();
  const [shown, setShown] = useState({ value: count, prev: count });
  const shownRef = useRef(shown.value);
  shownRef.current = shown.value;
  const holdUntil = useRef(0);
  const pending = useRef<number | null>(null);
  const release = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bump = useSharedValue(1);
  const glow = useSharedValue(0);
  const plus = useSharedValue(0);
  const [plusText, setPlusText] = useState('');
  const celebrate = useCallback((gain: number) => {
    if (gain <= 0) return;
    if (reduced) { bump.value = 1; return; }
    bump.value = withSequence(withTiming(HUD_BUMP.peak, { duration: 90, easing: EASE.out }), withSpring(1, HUD_BUMP.spring));
    glow.value = withSequence(withTiming(0.5, { duration: 160, easing: EASE.out }), withTiming(0, { duration: DURATION.bloom - 160, easing: EASE.in }));
    setPlusText(`+${countText(gain)}`);
    plus.value = 0;
    plus.value = withTiming(1, { duration: 600, easing: EASE.out });
  }, [reduced, bump, glow, plus]);
  const rollTo = useCallback((next: number, landed: boolean) => {
    const from = shownRef.current;
    if (next === from) return;
    setShown({ value: next, prev: from });
    if (next > from) celebrate(next - from);
    else if (landed) celebrate(0);
  }, [celebrate]);
  useEffect(() => {
    if (count === shownRef.current) return;
    // A coin is on its way in: the number waits for it (at most the hold), then rolls on landing.
    if (count > shownRef.current && Date.now() < holdUntil.current) {
      pending.current = count;
      if (release.current) clearTimeout(release.current);
      release.current = setTimeout(() => {
        release.current = null;
        if (pending.current != null) { const v = pending.current; pending.current = null; rollTo(v, false); }
      }, holdUntil.current - Date.now());
      return;
    }
    pending.current = null;
    rollTo(count, false);
  }, [count, rollTo]);
  useEffect(() => {
    if (!flyTarget) return undefined;
    const off = onHudPulse(flyTarget, event => {
      if (event.kind === 'hold') { holdUntil.current = Math.max(holdUntil.current, event.untilMs); return; }
      holdUntil.current = 0;
      if (release.current) { clearTimeout(release.current); release.current = null; }
      if (pending.current != null) { const v = pending.current; pending.current = null; rollTo(v, true); return; }
      // Landed before the new balance arrived: bump now; the roll follows when the balance does.
      if (!reduced) bump.value = withSequence(withTiming(HUD_BUMP.peak, { duration: 90, easing: EASE.out }), withSpring(1, HUD_BUMP.spring));
    });
    return () => { off(); if (release.current) clearTimeout(release.current); };
  }, [flyTarget, rollTo, reduced, bump]);
  const iconStyle = useAnimatedStyle(() => ({ transform: [{ scale: bump.value }] }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: glow.value, transform: [{ scaleX: 1 + 0.12 * glow.value }] }));
  const plusStyle = useAnimatedStyle(() => ({
    opacity: plus.value <= 0 || plus.value >= 1 ? 0 : plus.value < 0.15 ? plus.value / 0.15 : 1 - (plus.value - 0.15) / 0.85,
    transform: [{ translateY: -20 * plus.value }, { scale: 0.8 + 0.25 * Math.min(1, plus.value * 4) }],
  }));
  const up = shown.value >= shown.prev;

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
          {/* The soft gold underglow on a gain (code-drawn, no new art). */}
          <Reanimated.View pointerEvents="none" style={[styles.gainGlow, glowStyle]} />
          <Reanimated.View style={[styles.iconWrap, iconStyle]}>
            <Image
              source={typeof image === 'number' ? image : image ? { uri: image } : FALLBACK_ICON}
              placeholder={FALLBACK_ICON}
              style={styles.icon}
              contentFit="contain"
            />
          </Reanimated.View>
          <View style={styles.countBox}>
            <RollingDigits text={shortenNumber(shown.value)} previous={shortenNumber(shown.prev)} up={up}
              ms={rollMs(shown.prev, shown.value)} fontSize={COUNT_FONT} textStyle={styles.countText} reduced={reduced} />
          </View>
          <Reanimated.Text allowFontScaling={false} style={[styles.plus, plusStyle]}>{plusText}</Reanimated.Text>
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
  iconWrap: { position: 'absolute', left: -18, top: -5 },
  countBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  gainGlow: { position: 'absolute', left: 6, right: 6, top: -4, bottom: -4, borderRadius: 18,
    backgroundColor: GOLD_FX.glow, shadowColor: GOLD_FX.glow, shadowOpacity: 0.9, shadowRadius: 10, shadowOffset: { width: 0, height: 0 } },
  plus: { position: 'absolute', right: 2, top: 22, fontFamily: 'Shark', fontSize: 16, color: GOLD_FX.raysSoft,
    textShadowColor: 'rgba(5,52,110,0.9)', textShadowOffset: { width: 1.5, height: 1.5 }, textShadowRadius: 0 },
  countText: {
    textAlign: 'center',
    fontSize: COUNT_FONT,
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
