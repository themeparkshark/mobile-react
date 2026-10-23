import { Image } from 'expo-image';
import { useContext, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as RootNavigation from '../../RootNavigation';
import Animated, {
  Easing, FadeInUp, ZoomIn, cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withTiming,
} from 'react-native-reanimated';
import HomeArcade from '../../components/HomeArcade';
import YellowButton from '../../components/YellowButton';
import { LocationStatusContext } from '../../context/LocationProvider';

/** "Not now" is a real choice: games and a park pick, with location one tap away. */
export const NOT_NOW_COPY = {
  title: 'Play while you decide!',
  games: 'Games',
  park: 'Pick a park',
  hint: 'Turn on location any time to find treasures near you.',
  news: 'Read park news',
} as const;

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
  if (playing) return <NotNowPlay asking={asking} onTurnOn={turnOn} arcadeOpen={arcadeOpen} setArcadeOpen={setArcadeOpen} />;

  return (
    <View style={styles.wrap}>
      <Image source={require('../../../assets/images/water_background.png')} style={StyleSheet.absoluteFill} contentFit="cover" />
      <View style={[StyleSheet.absoluteFill, styles.tint]} />
      <Animated.View entering={FadeInUp.duration(450).springify().damping(14)} style={styles.card}>
        <Image source={require('../../../assets/images/screens/welcome/shark.png')}
          style={styles.shark} contentFit="contain" />
        <Text style={styles.title}>Let’s find your first treasures!</Text>
        <View style={styles.finds}>
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
  );
}

/** The "Not now" card: two big picture buttons, then location and News as quiet options. */
function NotNowPlay({ asking, onTurnOn, arcadeOpen, setArcadeOpen }: {
  asking: boolean; onTurnOn: () => void; arcadeOpen: boolean; setArcadeOpen: (open: boolean) => void;
}) {
  return (
    <View style={styles.wrap}>
      <Image source={require('../../../assets/images/water_background.png')} style={StyleSheet.absoluteFill} contentFit="cover" />
      <View style={[StyleSheet.absoluteFill, styles.tint]} />
      <Animated.View entering={FadeInUp.duration(380).springify().damping(14)} style={styles.card}>
        <Image source={require('../../../assets/images/screens/welcome/shark.png')} style={styles.shark} contentFit="contain" />
        <Text style={styles.title}>{NOT_NOW_COPY.title}</Text>
        <View style={styles.tiles}>
          <Pressable onPress={() => setArcadeOpen(true)} accessibilityRole="button" accessibilityLabel={NOT_NOW_COPY.games}
            accessibilityHint="Opens the home arcade" style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}>
            <Image source={require('../../../assets/images/screens/social/arcade.png')} style={styles.tileIcon} contentFit="contain" />
            <Text style={styles.tileText}>{NOT_NOW_COPY.games}</Text>
          </Pressable>
          <Pressable onPress={() => RootNavigation.navigate('CoinShelf')} accessibilityRole="button" accessibilityLabel={NOT_NOW_COPY.park}
            accessibilityHint="Opens every park and its ride coins" style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}>
            <Image source={require('../../../assets/images/share/props/gold-fin-coin.webp')} style={styles.tileIcon} contentFit="contain" />
            <Text style={styles.tileText}>{NOT_NOW_COPY.park}</Text>
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
  );
}

const styles = StyleSheet.create({
  tiles: { flexDirection: 'row', gap: 12, marginTop: 14, alignSelf: 'stretch', justifyContent: 'center' },
  tile: { flex: 1, maxWidth: 150, alignItems: 'center', backgroundColor: '#fff8e4', borderRadius: 20, borderWidth: 3,
    borderColor: '#ffffff', paddingVertical: 12, shadowColor: '#021e45', shadowOpacity: 0.3, shadowRadius: 6,
    shadowOffset: { width: 0, height: 4 } },
  tilePressed: { backgroundColor: '#ffefb3', transform: [{ scale: 0.97 }] },
  tileIcon: { width: 76, height: 76 },
  tileText: { fontFamily: 'Shark', fontSize: 20, color: '#05346e', marginTop: 4, textAlign: 'center' },
  wrap: { ...StyleSheet.absoluteFillObject, zIndex: 30, justifyContent: 'center', alignItems: 'center', padding: 22 },
  tint: { backgroundColor: 'rgba(3, 38, 92, 0.35)' },
  card: { width: '100%', alignItems: 'center', backgroundColor: '#0768b9', borderRadius: 26,
    borderWidth: 4, borderColor: '#fff', paddingVertical: 20, paddingHorizontal: 18,
    shadowColor: '#021e45', shadowOpacity: 0.45, shadowRadius: 16, shadowOffset: { width: 0, height: 10 } },
  shark: { width: 170, height: 150, marginTop: -78 },
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
