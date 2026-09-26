import { Image } from 'expo-image';
import { useContext, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing, FadeInUp, ZoomIn, cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withTiming,
} from 'react-native-reanimated';
import YellowButton from '../../components/YellowButton';
import { LocationContext } from '../../context/LocationProvider';

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
  const { requestPermission } = useContext(LocationContext);
  const [asking, setAsking] = useState(false);

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
          Treats and park gear pop up around you, even at home. At the park, walk up to a ride to catch its coin.
        </Text>
        <Text style={styles.small}>Your location is only used to place items and rides near you.</Text>
        <View style={{ width: '82%', marginTop: 16 }}>
          <YellowButton text={asking ? 'One sec…' : 'Turn On Location'} onPress={async () => {
            if (asking) return;
            setAsking(true);
            try { await requestPermission(); } finally { setAsking(false); }
          }} />
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
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
  small: { fontFamily: 'Knockout', fontSize: 14, color: '#cdeaff', textAlign: 'center', marginTop: 8 },
});
