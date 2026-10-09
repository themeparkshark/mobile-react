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
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { catchPinOfTheDay, getPinOfTheDay } from '../../api/endpoints/pins';
import { LocationContext } from '../../context/LocationProvider';
import { queueHaptic } from '../../gamekit/Haptics';
import { BRAND, FONT, GameButton, GameIcon, OUTLINE, RADIUS, SPACE } from '../../ui';
import { PIN_ART } from './PinArt';
import { warmthView, type HuntStatus, type ParkSet } from './pinsModel';

const POLL_MS = 6000;

type Props = {
  readonly set: ParkSet;
  readonly onClose: () => void;
  readonly onCaught: (result: { new: boolean; coins: number; pin: NonNullable<HuntStatus['pin']> & { rarity?: string }; park_name?: string | null; day?: string; catch_number?: number }) => void;
};

export default function HuntSheet({ set, onClose, onCaught }: Props) {
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
        if (s.warmth && s.warmth !== last) {
          queueHaptic(s.warmth === 'here' ? 'success' : 'tickSelection', 1);
          last = s.warmth;
        }
      } catch { /* keep the last reading */ }
      if (live) timer = setTimeout(tick, POLL_MS);
    };
    void tick();
    return () => { live = false; if (timer) clearTimeout(timer); };
  }, [set.park_id]);

  useEffect(() => { fill.value = withSpring(view.fill, { damping: 16, stiffness: 120 }); }, [view.fill, fill]);
  const fillStyle = useAnimatedStyle(() => ({ width: `${Math.max(6, fill.value * 100)}%` }));

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
        <Image source={PIN_ART.seal} style={styles.seal} contentFit="contain" />
        <Text maxFontSizeMultiplier={1.2} style={styles.title}>
          {status?.status === 'none' ? 'No pin today' : status?.status === 'caught' ? 'You got today’s pin!' : 'A pin is hiding!'}
        </Text>
        <Text maxFontSizeMultiplier={1.2} style={styles.sub}>{set.park_name ?? set.name}</Text>
        {hunting && (
          <>
            <View style={styles.meter} accessible accessibilityLabel={view.word}>
              <Animated.View style={[styles.meterFill, { backgroundColor: view.color }, fillStyle]} />
              <View style={styles.meterIcons} pointerEvents="none">
                <GameIcon name="moon" size={22} />
                <GameIcon name="streak" size={22} />
              </View>
            </View>
            <Text maxFontSizeMultiplier={1.2} style={[styles.word, { color: status?.warmth === 'here' ? BRAND.red : BRAND.navy }]}>{view.word}</Text>
            {!status?.here && <Text maxFontSizeMultiplier={1.2} style={styles.note}>Get inside the park to hunt.</Text>}
            {miss && <Text maxFontSizeMultiplier={1.2} style={styles.note}>Not quite. Keep looking!</Text>}
            <GameButton label="Catch it!" icon="search" disabled={status?.warmth !== 'here' || busy} loading={busy} onPress={tryCatch} />
          </>
        )}
        {status?.status === 'none' && <Text maxFontSizeMultiplier={1.2} style={styles.note}>Check back tomorrow. Every day is a new chance.</Text>}
        <GameButton variant="ghost" label="Close" onPress={onClose} />
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
  seal: { width: 76, height: 76, marginTop: -54 },
  title: { fontFamily: FONT.display, fontSize: 30, color: BRAND.navy, paddingTop: 4 },
  sub: { fontFamily: FONT.body, fontSize: 18, color: BRAND.navySoft },
  meter: { width: '100%', height: 30, borderRadius: 15, borderWidth: 3, borderColor: BRAND.navy, backgroundColor: BRAND.white, overflow: 'hidden', marginTop: SPACE.sm, justifyContent: 'center' },
  meterFill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 12 },
  meterIcons: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 6 },
  word: { fontFamily: FONT.display, fontSize: 28, paddingTop: 3 },
  note: { fontFamily: FONT.body, fontSize: 17, color: BRAND.navySoft, textAlign: 'center' },
});
