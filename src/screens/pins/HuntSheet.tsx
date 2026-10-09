/**
 * Pin of the Day hunt, at the park. "A pin is hiding!" Which pin stays a
 * surprise until you catch it. A big warmer/colder meter updates as you walk
 * (the server measures, from your position, every few seconds while this is
 * open); at "It's right here!" the Catch button lights up.
 *
 * Location is read from the app's existing GPS watch (no new watch, no extra
 * battery); polling stops when the sheet closes or the app is backgrounded.
 */
import { Image } from 'expo-image';
import { useContext, useEffect, useRef, useState } from 'react';
import { AppState, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { catchPinOfTheDay, getPinOfTheDay } from '../../api/endpoints/pins';
import { LocationContext } from '../../context/LocationProvider';
import { queueHaptic } from '../../gamekit/Haptics';
import { BRAND, FONT, GameButton, GameIcon, OUTLINE, RADIUS, SPACE } from '../../ui';
import { PIN_ART } from './PinArt';
import { warmthView, type HuntStatus, type ParkSet } from './pinsModel';

const POLL_MS = 3000;
const SONAR_MS = { here: 500, hot: 800, warm: 1300, cold: 2000 } as const;

/** Sonar rings around the seal: they ping faster and turn warmer as you get close. */
function Sonar({ warmth, color }: { warmth: HuntStatus['warmth']; color: string }) {
  const t = useSharedValue(0);
  const ms = warmth ? SONAR_MS[warmth] : 2400;
  useEffect(() => {
    t.value = 0;
    t.value = withRepeat(withTiming(1, { duration: ms, easing: Easing.out(Easing.quad) }), -1, false);
    return () => cancelAnimation(t);
  }, [ms, t]);
  const a = useAnimatedStyle(() => ({ opacity: 1 - t.value, transform: [{ scale: 0.6 + t.value * 1.4 }] }));
  const b = useAnimatedStyle(() => { const v = (t.value + 0.5) % 1; return { opacity: 1 - v, transform: [{ scale: 0.6 + v * 1.4 }] }; });
  return (
    <View pointerEvents="none" style={styles.sonar}>
      <Animated.View style={[styles.ring, { borderColor: color }, a]} />
      <Animated.View style={[styles.ring, { borderColor: color }, b]} />
    </View>
  );
}

type Props = {
  readonly set: ParkSet;
  readonly onClose: () => void;
  readonly onCaught: (result: { new: boolean; coins: number; pin: NonNullable<HuntStatus['pin']> & { rarity?: string }; park_name?: string | null; day?: string; catch_number?: number }) => void;
};

export default function HuntSheet({ set, onClose, onCaught, still = false }: Props & { still?: boolean }) {
  const insets = useSafeAreaInsets();
  const { location } = useContext(LocationContext);
  const [status, setStatus] = useState<HuntStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [miss, setMiss] = useState(false);
  const loc = useRef(location);
  loc.current = location;
  const fill = useSharedValue(0);
  const view = warmthView(status?.warmth ?? null);

  useEffect(() => {
    if (!set.park_id) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let last: HuntStatus['warmth'] = null;
    const tick = async () => {
      if (AppState.currentState !== 'active') { timer = setTimeout(tick, POLL_MS); return; }
      try {
        const l = loc.current;
        const s = await getPinOfTheDay(set.park_id!, l ? { latitude: l.latitude, longitude: l.longitude } : null);
        if (!live) return;
        setStatus(s);
        // Nothing left to hunt today: stop asking.
        if (s.status !== 'hunt') return;
        if (s.warmth === 'here') setMiss(false);
        if (s.warmth && s.warmth !== last) {
          queueHaptic(s.warmth === 'here' ? 'success' : 'tickSelection', 1);
          last = s.warmth;
        }
        // Away from the park there's nothing to measure: check rarely.
        if (live) timer = setTimeout(tick, s.here ? POLL_MS : POLL_MS * 5);
        return;
      } catch {
        // Keep the last reading and back off.
        if (live) timer = setTimeout(tick, POLL_MS * 3);
        return;
      }
    };
    void tick();
    return () => { live = false; if (timer) clearTimeout(timer); };
  }, [set.park_id]);

  useEffect(() => { fill.value = withSpring(view.fill, { damping: 16, stiffness: 120 }); }, [view.fill, fill]);
  const fillStyle = useAnimatedStyle(() => ({ width: `${Math.max(6, fill.value * 100)}%` }));

  const hold = useSharedValue(0);
  const notYet = useSharedValue(0);
  const notYetStyle = useAnimatedStyle(() => ({ transform: [{ translateX: notYet.value }] }));
  const [holdHint, setHoldHint] = useState(false);
  const holdTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => holdTimers.current.forEach(clearTimeout), []);
  const holdStyle = useAnimatedStyle(() => ({ width: `${hold.value * 100}%` }));
  const startHold = () => {
    if (busy) return;
    holdTimers.current.forEach(clearTimeout); holdTimers.current = [];
    hold.value = withTiming(1, { duration: 700 });
    [0.2, 0.45, 0.7].forEach((f, k) => holdTimers.current.push(setTimeout(() => queueHaptic(k === 2 ? 'hitMedium' : 'tickSelection', 1), 700 * f)));
    holdTimers.current.push(setTimeout(() => { if (hold.value > 0.97) void tryCatch(); }, 730));
  };
  const endHold = () => {
    if (hold.value > 0.97) return;
    const quick = hold.value < 0.5;
    holdTimers.current.forEach(clearTimeout); holdTimers.current = [];
    hold.value = withTiming(0, { duration: 150 });
    if (quick) { setHoldHint(true); holdTimers.current.push(setTimeout(() => setHoldHint(false), 1400)); }
  };

  const tryCatch = async () => {
    const l = loc.current;
    if (!set.park_id || !l || busy) return;
    setBusy(true); setMiss(false);
    try {
      const r = await catchPinOfTheDay(set.park_id, { latitude: l.latitude, longitude: l.longitude });
      if (r.caught) onCaught({ new: r.new, coins: r.coins, pin: r.pin, park_name: r.park_name, day: r.day, catch_number: r.catch_number });
      else onClose();
    } catch {
      setMiss(true);
      queueHaptic('failBuzz', 1);
    } finally { setBusy(false); }
  };

  const hunting = status?.status === 'hunt';
  return (
    <Modal transparent visible animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close" />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + SPACE.lg }]}>
        <Pressable onPress={onClose} hitSlop={10} style={styles.x} accessibilityRole="button" accessibilityLabel="Close">
          <GameIcon name="close" size={34} />
        </Pressable>
        <Text maxFontSizeMultiplier={1.35} style={styles.title}>
          {status?.status === 'none' ? 'No pin today' : status?.status === 'caught' ? 'You got today’s pin!' : 'A pin is hiding!'}
        </Text>
        <Text maxFontSizeMultiplier={1.35} style={styles.sub}>{set.park_name ?? set.name}</Text>
        {/* Warmer / colder in the medallion: the rings change colour and ping faster as you get close. */}
        <View style={styles.medal} accessible accessibilityLabel={hunting ? view.word : 'Pin of the Day'}>
          {hunting && !still && <Sonar warmth={status?.warmth ?? null} color={view.color} />}
          {hunting && <View style={[styles.medalRing, { borderColor: view.color }]} />}
          <Image source={PIN_ART.seal} style={styles.seal} contentFit="contain" />
        </View>
        {hunting && (
          <>
            <Text maxFontSizeMultiplier={1.35} style={[styles.word, { color: status?.warmth === 'here' ? BRAND.red : BRAND.navy }]}>{view.word}</Text>
            {!status?.here && <Text maxFontSizeMultiplier={1.35} style={styles.note}>Get inside the park to hunt.</Text>}
            {miss && <Text maxFontSizeMultiplier={1.3} style={styles.note}>Not here yet. Watch the rings!</Text>}
            <Text maxFontSizeMultiplier={1.3} style={styles.note}>Look up while you walk!</Text>
            {status?.warmth === 'here' ? (
              // Hold to catch: a gold bar fills with rising ticks, then it's yours (let go early to wait).
              <View style={{ width: '100%' }}>
              {holdHint && <View style={styles.holdHint} pointerEvents="none"><Text maxFontSizeMultiplier={1.3} style={styles.holdHintText}>Hold it down!</Text></View>}
              <Pressable onPressIn={startHold} onPressOut={endHold} disabled={busy}
                style={[styles.catchBtn, busy && { opacity: 0.6 }]} accessibilityRole="button" accessibilityLabel="Hold to catch it"
                accessibilityActions={[{ name: 'activate' }]} onAccessibilityAction={() => void tryCatch()}>
                <Animated.View style={[styles.catchFill, holdStyle]} />
                <GameIcon name="search" size={28} />
                <Text maxFontSizeMultiplier={1.3} style={styles.catchText}>{busy ? 'Catching\u2026' : 'Hold to catch!'}</Text>
              </Pressable>
              </View>
            ) : (
              // Not there yet: a dashed "not yet" slot that wiggles softly (no buzz, nothing to mash).
              <Animated.View style={[{ width: '100%' }, notYetStyle]}>
                <Pressable onPress={() => { queueHaptic('tapLight', 1); setMiss(true); notYet.value = withSequence(withTiming(-4, { duration: 60 }), withTiming(4, { duration: 70 }), withTiming(0, { duration: 60 })); }}
                  style={styles.notYet} accessibilityRole="button" accessibilityLabel="Not here yet. Watch the rings">
                  <GameIcon name="search" size={26} />
                  <Text maxFontSizeMultiplier={1.3} style={styles.notYetText}>Not here yet</Text>
                </Pressable>
              </Animated.View>
            )}
          </>
        )}
        {status?.status === 'none' && <Text maxFontSizeMultiplier={1.35} style={styles.note}>Check back tomorrow. Every day is a new chance.</Text>}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: BRAND.scrim },
  sheet: {
    backgroundColor: BRAND.cream, borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl, borderWidth: OUTLINE.heavy,
    borderColor: BRAND.navy, borderBottomWidth: 0, alignItems: 'center', paddingHorizontal: SPACE.lg, paddingTop: SPACE.lg, gap: SPACE.sm,
  },
  x: { position: 'absolute', top: 12, right: 12, zIndex: 3, minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  medal: { width: 150, height: 150, alignItems: 'center', justifyContent: 'center', marginVertical: SPACE.sm },
  medalRing: { position: 'absolute', width: 130, height: 130, borderRadius: 65, borderWidth: 8, opacity: 0.85 },
  seal: { width: 96, height: 96 },
  sonar: { position: 'absolute', width: 130, height: 130, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', width: 130, height: 130, borderRadius: 65, borderWidth: 6 },
  title: { fontFamily: FONT.display, fontSize: 30, color: BRAND.navy, paddingTop: 4 },
  sub: { fontFamily: FONT.body, fontSize: 18, color: BRAND.navySoft },
  meter: { width: '100%', height: 30, borderRadius: 15, borderWidth: 3, borderColor: BRAND.navy, backgroundColor: BRAND.white, overflow: 'hidden', marginTop: SPACE.sm, justifyContent: 'center' },
  meterFill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 12 },
  meterIcons: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 6 },
  coldDot: { width: 16, height: 16, borderRadius: 8, backgroundColor: '#7cc6f5', borderWidth: 2, borderColor: BRAND.navy },
  word: { fontFamily: FONT.display, fontSize: 28, paddingTop: 3 },
  catchBtn: {
    width: '100%', minHeight: 64, borderRadius: RADIUS.lg, borderWidth: 4, borderColor: BRAND.navy, backgroundColor: BRAND.gold,
    shadowColor: BRAND.goldLip, shadowOffset: { width: 0, height: 5 }, shadowOpacity: 1, shadowRadius: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, overflow: 'hidden',
  },
  catchFill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: '#ffae00' },
  holdHint: { position: 'absolute', top: -36, alignSelf: 'center', zIndex: 2, backgroundColor: BRAND.navy, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 3 },
  holdHintText: { fontFamily: FONT.display, fontSize: 18, color: BRAND.white, paddingTop: 3 },
  notYet: { minHeight: 64, borderRadius: RADIUS.lg, borderWidth: 3, borderStyle: 'dashed', borderColor: '#9fb3cb', backgroundColor: '#eef6ff', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  notYetText: { fontFamily: FONT.display, fontSize: 22, color: BRAND.navySoft, paddingTop: 3 },
  catchText: { fontFamily: FONT.display, fontSize: 26, color: BRAND.navy, paddingTop: 4 },
  note: { fontFamily: FONT.body, fontSize: 17, color: BRAND.navySoft, textAlign: 'center' },
});
