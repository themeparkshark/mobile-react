import { Image } from 'expo-image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Image as RNImage, Text, View, TouchableOpacity, StyleSheet } from 'react-native';
import Reanimated, { Easing, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import useReducedGameMotion from '../../hooks/useReducedGameMotion';
import { DURATION, EASE, HUD_BUMP } from '../../ui/motionEasing';
import { GOLD_FX } from '../../ui/motion';
import { hudGlow, hudPunch, rollMs } from '../map/alive/mapWow';
import { touchHeal, useCommitHeal } from '../map/alive/commitHeal';
import RollingDigits, { type DigitStream } from './RollingDigits';
import { hudClock, hudStreamId, onHudPulse } from './hudPulse';
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
const GLOW_TEX = require('../../../assets/images/map/fx/glow.png');
const COUNT_FONT = 19;
/** A plain gain's "+N": pop, a short hold, a float up and out (the same shape as a stream's, 920 ms in all). */
const PLUS_PLAIN_MS = 920;
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
  const [shown, setShownState] = useState<{ value: number; prev: number; stream?: DigitStream | null; key: number }>({ value: count, prev: count, key: 0 });
  const setShown = useCallback((next: { value: number; prev: number; stream?: DigitStream | null }) => setShownState(cur => ({ ...next, key: cur.key + 1 })), []);
  const shownRef = useRef(shown.value);
  shownRef.current = shown.value;
  const holdUntil = useRef(0);
  const pending = useRef<number | null>(null);
  const release = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bump = useSharedValue(1);
  const glow = useSharedValue(0);
  const plus = useSharedValue(0);
  const [plusText, setPlusText] = useState('');
  // Round 3: a coin stream on the catch's clock (its id and landing times), read by the worklets below.
  const streamId = useSharedValue(0);
  const streamLands = useSharedValue<number[]>([]);
  const celebrate = useCallback((gain: number) => {
    if (gain <= 0) return;
    if (reduced) { bump.value = 1; return; }
    bump.value = withSequence(withTiming(HUD_BUMP.peak, { duration: 90, easing: EASE.out }), withSpring(1, HUD_BUMP.spring));
    glow.value = withSequence(withTiming(0.5, { duration: 160, easing: EASE.out }), withTiming(0, { duration: DURATION.bloom - 160, easing: EASE.in }));
    setPlusText(`+${countText(gain)}`);
    plus.value = 0;
    plus.value = withTiming(1, { duration: PLUS_PLAIN_MS, easing: Easing.linear });
  }, [reduced, bump, glow, plus]);
  const rollTo = useCallback((next: number, landed: boolean) => {
    const from = shownRef.current;
    if (next === from) return;
    // A plain roll (a spend, a gain with nothing flying in) leaves any finished coin stream behind.
    streamId.value = 0;
    setShown({ value: next, prev: from });
    if (next > from) celebrate(next - from);
    else if (landed) celebrate(0);
  }, [celebrate, streamId, setShown]);
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
      if (event.kind === 'stream') {
        // The coins are on their way on the shared clock: the roll, the punches, the glow and "+N" are all
        // planned now and play on the UI thread exactly as each coin lands (no JS timer can stretch them).
        const { stream } = event;
        if (stream.gain <= 0 || stream.lands.length === 0) return;
        holdUntil.current = 0;
        pending.current = null;
        if (release.current) { clearTimeout(release.current); release.current = null; }
        const from = shownRef.current;
        const next = from + stream.gain;
        shownRef.current = next;
        streamLands.value = [...stream.lands];
        streamId.value = stream.id;
        setPlusText(`+${countText(stream.gain)}`);
        setShown({ value: next, prev: from, stream: reduced ? null : { id: stream.id, startAt: stream.lands[0] } });
        return;
      }
      if (event.kind === 'punch') {
        // A stream's later coins: a small punch each, the full bump on the last one (the roll is already going).
        if (reduced) return;
        const peak = event.last ? HUD_BUMP.peak : 1 + (HUD_BUMP.peak - 1) * 0.5;
        bump.value = withSequence(withTiming(peak, { duration: 60, easing: EASE.out }), withSpring(1, HUD_BUMP.spring));
        return;
      }
      holdUntil.current = 0;
      if (release.current) { clearTimeout(release.current); release.current = null; }
      if (pending.current != null) { const v = pending.current; pending.current = null; rollTo(v, true); return; }
      // Landed before the new balance arrived: bump now; the roll follows when the balance does.
      if (!reduced) bump.value = withSequence(withTiming(HUD_BUMP.peak, { duration: 90, easing: EASE.out }), withSpring(1, HUD_BUMP.spring));
    });
    return () => { off(); if (release.current) clearTimeout(release.current); };
  }, [flyTarget, rollTo, reduced, bump]);
  // Round 5: the chip re-renders when a stream starts; its icon, glow and "+N" re-send for a moment after (commitHeal).
  const heal = useCommitHeal();
  const iconStyle = useAnimatedStyle(() => {
    touchHeal(heal);
    const live = streamId.value > 0 && hudStreamId.value === streamId.value && !reduced;
    return { transform: [{ scale: bump.value * (live ? hudPunch(hudClock.value, streamLands.value) : 1) }] };
  });
  const glowStyle = useAnimatedStyle(() => {
    touchHeal(heal);
    const live = streamId.value > 0 && hudStreamId.value === streamId.value && !reduced && streamLands.value.length > 0;
    const g = Math.max(glow.value, live ? hudGlow(hudClock.value, streamLands.value[0]) : 0);
    return { opacity: g, transform: [{ scaleX: 1 + 0.12 * g }] };
  });
  // "+N" (round 4): pops in just right of the chip, on the header's blue (never across its white rim), on the
  // frame the first coin lands, holds while the coins arrive, then floats up and fades within 500 ms of the last.
  const plusStyle = useAnimatedStyle(() => {
    touchHeal(heal);
    const lands = streamLands.value;
    const live = streamId.value > 0 && hudStreamId.value === streamId.value && !reduced && lands.length > 0;
    let d: number, hold: number;
    if (live) { d = hudClock.value - lands[0]; hold = lands[lands.length - 1] - lands[0] + 100; }
    else { d = plus.value * PLUS_PLAIN_MS; hold = 300; }
    const out = (d - hold) / 400;
    if (d <= 0 || out >= 1 || (!live && plus.value <= 0)) return { opacity: 0, transform: [{ translateY: 0 }, { scale: 0.6 }] };
    const inn = Math.min(1, d / 220);
    const wave = inn >= 1 ? 0 : Math.exp(-4 * inn) * Math.cos(2.2 * Math.PI * inn) * (1 - inn);
    const o = Math.max(0, out);
    return { opacity: Math.min(1, d / 50) * (1 - o * o), transform: [{ translateY: -14 * o }, { scale: 1 - 0.4 * wave }] };
  });
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
          {/* The soft gold underglow on a gain: the map's glow texture tinted gold, opacity only (no live shadow pass). */}
          <Reanimated.View pointerEvents="none" style={[styles.gainGlow, glowStyle]}>
            <RNImage source={GLOW_TEX} style={[styles.glowFill, { tintColor: GOLD_FX.glow }]} resizeMode="stretch" fadeDuration={0} />
          </Reanimated.View>
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
              ms={rollMs(shown.prev, shown.value)} fontSize={COUNT_FONT} textStyle={styles.countText} reduced={reduced} stream={shown.stream ?? null} rollKey={shown.key} />
          </View>
        </View>
      </TouchableOpacity>
      {/* "+N" hangs off a zero-width anchor laid out right after the pill, so it always starts past the pill's
          right rim (round 4's left:'100%' resolved inside the pill and drew over the digits: "4310"). */}
      <View style={styles.plusAnchor} pointerEvents="none">
        <Reanimated.Text allowFontScaling={false} numberOfLines={1} style={[styles.plus, plusStyle]}>{plusText}</Reanimated.Text>
      </View>
      
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
    flexDirection: 'row',
    alignItems: 'center',
  },
  plusAnchor: { width: 0, height: 30, overflow: 'visible' },
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
  gainGlow: { position: 'absolute', left: -14, right: -14, top: -16, bottom: -16 },
  glowFill: { width: '100%', height: '100%' },
  // White with a navy outline (four hard shadows read as an outline at this size), 20 pt: readable at a glance.
  plus: { position: 'absolute', left: 5, top: 1, width: 72, fontFamily: 'Shark', fontSize: 20, color: '#ffffff',
    textShadowColor: '#05346e', textShadowOffset: { width: 2, height: 2 }, textShadowRadius: 1 },
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
