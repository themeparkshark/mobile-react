import { Image } from 'expo-image';
import { useContext, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import * as RootNavigation from '../../RootNavigation';
import Animated, {
  Easing, FadeInUp, ZoomIn, cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withTiming,
} from 'react-native-reanimated';
import HomeArcade from '../../components/HomeArcade';
import { BOTTOM_BAR_OVERHANG } from '../../components/Wrapper';
import YellowButton from '../../components/YellowButton';
import { LocationStatusContext } from '../../context/LocationProvider';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** "Not now" is a real choice: games and the ride coins to win, with location one tap away. */
export const NOT_NOW_COPY = {
  title: 'Play while you decide!',
  games: 'Games',
  gamesHint: 'Play at home',
  park: 'Ride coins',
  parkHint: 'Win these at the park',
  hint: 'Turn on location any time to find treasures near you.',
  news: 'Read park news',
} as const;

/** One Finn and one underwater scene in the first minute (no castle or globe shapes behind him). */
const FINN = require('../../../assets/images/tutorial/teacher-shark.png');
const BACKDROP = require('../../../assets/images/screens/park/background-new.png');
/** How far Finn's cap rises above the card (his negative top margin). */
const FINN_OVERHANG = 84;
const FINN_OVERHANG_COMPACT = 64;

// Once a player picks "Not now", the card stays in play mode for this app session.
let choseNotNow = false;
/** Test hook: forget the session choice. */
export function resetNotNowChoice() { choseNotNow = false; }

const FINDS = [
  require('../../../assets/images/prep-items/churros/churro_01.png'),
  require('../../../assets/images/coingold.png'),
  require('../../../assets/images/prep-items/pretzels/base_pretzel.png'),
  require('../../../assets/images/prep-items/cameras/camera_01.png'),
];

/** One find floating on the backdrop, bobbing out of step with the others. */
function Find({ source, i }: { source: number; i: number }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withDelay(i * 300, withRepeat(withTiming(1, { duration: 1800 + i * 200, easing: Easing.inOut(Easing.sin) }), -1, true));
    return () => cancelAnimation(p);
  }, [p, i]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: -p.value * 8 }, { rotate: `${(i % 2 ? 1 : -1) * (6 - p.value * 12)}deg` }] }));
  return (
    <Animated.View entering={ZoomIn.delay(350 + i * 120).springify().damping(10)} style={styles.find}>
      <Animated.View style={style}>
        <Image source={source} style={styles.findImg} contentFit="contain" />
      </Animated.View>
    </Animated.View>
  );
}

/**
 * Location primer. Explains the payoff first (with the things you'll find),
 * then shows the iOS prompt from a button tap; only after iOS stops asking
 * does the button open Settings.
 */
export default function PermissionsNotGranted() {
  const { requestPermission } = useContext(LocationStatusContext);
  const [asking, setAsking] = useState(false);
  const [playing, setPlaying] = useState(choseNotNow);
  const [arcadeOpen, setArcadeOpen] = useState(false);
  const turnOn = async () => {
    if (asking) return;
    setAsking(true);
    try { await requestPermission(); } finally { setAsking(false); }
  };
  // Short phones (iPhone SE): a smaller Finn and finds, so his cap stays clear of the status bar.
  const compact = useWindowDimensions().height < 700;
  // Finn's cap rises above the card: the card layer starts below the status bar, plus his overhang.
  const top = useSafeAreaInsets().top;
  if (playing) return <NotNowPlay asking={asking} onTurnOn={turnOn} arcadeOpen={arcadeOpen} setArcadeOpen={setArcadeOpen} compact={compact} top={top} />;

  return (
    <>
    <Backdrop />
    <View style={[styles.wrap, { paddingTop: top + 8 + (compact ? FINN_OVERHANG_COMPACT : FINN_OVERHANG) }]}>
      <FullBackdrop />
      <Animated.View entering={FadeInUp.duration(450).springify().damping(14)} style={styles.card}>
        <Image source={FINN} style={[styles.shark, compact && styles.sharkCompact]} contentFit="contain" accessibilityLabel="Finn the shark" />
        <Text style={[styles.title, compact && styles.titleCompact]}>Let’s find your first treasures!</Text>
        <View style={[styles.finds, compact && styles.findsCompact]}>
          {FINDS.map((source, i) => <Find key={i} source={source} i={i} />)}
        </View>
        <Text style={styles.body}>
          Treasures pop up around you, even at home. At the park, walk up to a ride to win its ride coin.
        </Text>
        <Text style={styles.small}>Your location is only used to place items and rides near you.</Text>
        <View style={{ width: '82%', marginTop: 16 }}>
          <YellowButton text={asking ? 'One sec…' : 'Turn On Location'} onPress={turnOn} />
        </View>
        {/* The way out is still play: games and a park pick need no location. */}
        <Pressable onPress={() => { choseNotNow = true; setPlaying(true); }} hitSlop={8} accessibilityRole="button"
          accessibilityHint="Shows games you can play now. You can turn on location later." style={styles.notNow}>
          <Text style={styles.notNowText}>Not now</Text>
        </Pressable>
      </Animated.View>
    </View>
    </>
  );
}

/** The "Not now" card: two big picture buttons, then location and News as quiet options. */
function NotNowPlay({ asking, onTurnOn, arcadeOpen, setArcadeOpen, compact, top }: {
  asking: boolean; onTurnOn: () => void; arcadeOpen: boolean; setArcadeOpen: (open: boolean) => void; compact: boolean; top: number;
}) {
  return (
    <>
    <Backdrop />
    <View style={[styles.wrap, { paddingTop: top + 8 + (compact ? FINN_OVERHANG_COMPACT : FINN_OVERHANG) }]}>
      <FullBackdrop />
      <Animated.View entering={FadeInUp.duration(380).springify().damping(14)} style={styles.card}>
        <Image source={FINN} style={[styles.shark, compact && styles.sharkCompact]} contentFit="contain" accessibilityLabel="Finn the shark" />
        <Text style={[styles.title, compact && styles.titleCompact]}>{NOT_NOW_COPY.title}</Text>
        <View style={styles.tiles}>
          <Pressable onPress={() => setArcadeOpen(true)} accessibilityRole="button" accessibilityLabel={NOT_NOW_COPY.games}
            accessibilityHint="Opens the home arcade" style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}>
            <Image source={require('../../../assets/images/screens/social/arcade.png')} style={[styles.tileIcon, compact && styles.tileIconCompact]} contentFit="contain" />
            <Text style={styles.tileText}>{NOT_NOW_COPY.games}</Text>
            <Text style={styles.tileSub}>{NOT_NOW_COPY.gamesHint}</Text>
          </Pressable>
          <Pressable onPress={() => RootNavigation.navigate('CoinShelf')} accessibilityRole="button" accessibilityLabel={NOT_NOW_COPY.park}
            accessibilityHint="Shows the ride coins you can win at each park" style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}>
            <Image source={require('../../../assets/images/coingold.png')} style={[styles.tileIcon, compact && styles.tileIconCompact]} contentFit="contain" />
            <Text style={styles.tileText}>{NOT_NOW_COPY.park}</Text>
            <Text style={styles.tileSub}>{NOT_NOW_COPY.parkHint}</Text>
          </Pressable>
        </View>
        <Text style={styles.small}>{NOT_NOW_COPY.hint}</Text>
        <View style={{ width: '82%', marginTop: 12 }}>
          <YellowButton text={asking ? 'One sec…' : 'Turn On Location'} onPress={onTurnOn} />
        </View>
        <Pressable onPress={() => RootNavigation.navigate('News')} hitSlop={8} accessibilityRole="button"
          accessibilityHint="Opens News" style={styles.notNow}>
          <Text style={styles.notNowText}>{NOT_NOW_COPY.news}</Text>
        </Pressable>
      </Animated.View>
      <HomeArcade visible={arcadeOpen} onClose={() => setArcadeOpen(false)} />
    </View>
    </>
  );
}

/**
 * The underwater scene runs full-bleed down behind the footer. It is drawn in
 * two layers with the same geometry, so they meet with no seam:
 * - Backdrop: the whole screen with no zIndex, so the footer and its raised
 *   MAP compass (later in the tree) paint over it and stay whole.
 * - FullBackdrop: the same picture inside the raised card layer (zIndex 30,
 *   above the top bar), sized to the whole screen and clipped where that layer
 *   ends, just above the compass.
 */
function Backdrop() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Image source={BACKDROP} style={StyleSheet.absoluteFill} contentFit="cover" />
      <View style={[StyleSheet.absoluteFill, styles.tint]} />
    </View>
  );
}
function FullBackdrop() {
  const [h, setH] = useState(0);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} onLayout={(e) => setH(e.nativeEvent.layout.height)}>
      {h > 0 ? <View style={{ position: 'absolute', left: 0, right: 0, top: 0, height: h + BOTTOM_BAR_OVERHANG }}>
        <Image source={BACKDROP} style={StyleSheet.absoluteFill} contentFit="cover" />
        <View style={[StyleSheet.absoluteFill, styles.tint]} />
      </View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tiles: { flexDirection: 'row', gap: 12, marginTop: 14, alignSelf: 'stretch', justifyContent: 'center' },
  tile: { flex: 1, maxWidth: 150, alignItems: 'center', backgroundColor: '#fff8e4', borderRadius: 20, borderWidth: 3,
    borderColor: '#ffffff', paddingVertical: 12, shadowColor: '#021e45', shadowOpacity: 0.3, shadowRadius: 6,
    shadowOffset: { width: 0, height: 4 } },
  tilePressed: { backgroundColor: '#ffefb3', transform: [{ scale: 0.97 }] },
  tileIcon: { width: 76, height: 76 },
  tileIconCompact: { width: 60, height: 60 },
  tileText: { fontFamily: 'Shark', fontSize: 20, color: '#05346e', marginTop: 4, textAlign: 'center' },
  tileSub: { fontFamily: 'Knockout', fontSize: 14, color: '#3d6a96', marginTop: 2, textAlign: 'center' },
  // The raised card layer ends where the footer's MAP compass begins, so the 5-icon footer shows whole.
  // Its picture continues below it in Backdrop with no seam or rounded edge.
  wrap: { ...StyleSheet.absoluteFillObject, bottom: BOTTOM_BAR_OVERHANG, zIndex: 30, justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 22, paddingBottom: 12, overflow: 'hidden' },
  tint: { backgroundColor: 'rgba(3, 38, 92, 0.18)' },
  card: { width: '100%', alignItems: 'center', backgroundColor: '#0768b9', borderRadius: 26,
    borderWidth: 4, borderColor: '#fff', paddingVertical: 20, paddingHorizontal: 18,
    shadowColor: '#021e45', shadowOpacity: 0.45, shadowRadius: 16, shadowOffset: { width: 0, height: 10 } },
  shark: { width: 150, height: 150, marginTop: -FINN_OVERHANG },
  sharkCompact: { width: 112, height: 112, marginTop: -FINN_OVERHANG_COMPACT },
  titleCompact: { fontSize: 24 },
  findsCompact: { marginTop: 6, transform: [{ scale: 0.85 }] },
  title: { fontFamily: 'Shark', fontSize: 28, color: '#ffcf3b', textAlign: 'center',
    textShadowColor: '#7a3d00', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0 },
  finds: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginTop: 12 },
  find: { width: 62, height: 62, borderRadius: 31, backgroundColor: 'rgba(255,255,255,0.16)', borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.5)', alignItems: 'center', justifyContent: 'center' },
  findImg: { width: 46, height: 46 },
  body: { fontFamily: 'Knockout', fontSize: 18, color: '#fff', textAlign: 'center', marginTop: 12, lineHeight: 23 },
  notNow: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 18, marginTop: 4 },
  notNowText: { fontFamily: 'Shark', fontSize: 18, color: '#ffffff' },
  small: { fontFamily: 'Knockout', fontSize: 14, color: '#cdeaff', textAlign: 'center', marginTop: 8 },
});
