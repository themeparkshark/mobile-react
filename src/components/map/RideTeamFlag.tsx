import { Image } from 'expo-image';
import { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { TEAMS, teamName, type TeamId } from '../../constants/teams';
import useReducedGameMotion from '../../hooks/useReducedGameMotion';
import { GameIcon } from '../../ui';

/**
 * A held ride always wears a flag. Only an exact confirmed flip gets a finite
 * raise (the cloth climbs the pole with an overshoot and a flutter); a confirmed
 * hold gets a "Held!" tag instead. Reduced motion shows the final state.
 */
export default function RideTeamFlag({ team, contested = false, raiseKey, held = false }: {
  readonly team: TeamId;
  readonly contested?: boolean;
  readonly raiseKey?: string;
  /** The team kept this ride (a boss win on a ride it already held). */
  readonly held?: boolean;
}) {
  const reduced = useReducedGameMotion();
  const lift = useSharedValue(1);
  const flutter = useSharedValue(0);
  const raised = useRef(new Set<string>());
  useEffect(() => {
    cancelAnimation(lift); cancelAnimation(flutter);
    if (!raiseKey || reduced || raised.current.has(raiseKey)) {
      if (raiseKey) raised.current.add(raiseKey);
      lift.value = 1; flutter.value = 0; return;
    }
    raised.current.add(raiseKey);
    if (held) {
      lift.value = 1;
      flutter.value = withSequence(withTiming(1, { duration: 140 }), withTiming(-1, { duration: 180 }), withTiming(0, { duration: 220 }));
    } else {
      lift.value = 0;
      lift.value = withSequence(withTiming(1.12, { duration: 520, easing: Easing.out(Easing.cubic) }),
        withSpring(1, { damping: 8, stiffness: 260 }));
      flutter.value = withSequence(withTiming(0, { duration: 480 }), withTiming(1, { duration: 120 }), withTiming(-1, { duration: 160 }),
        withTiming(0, { duration: 200 }));
    }
    return () => { cancelAnimation(lift); cancelAnimation(flutter); };
  }, [lift, flutter, raiseKey, reduced, team, held]);
  const cloth = useAnimatedStyle(() => ({
    transform: [{ translateY: 17 * (1 - lift.value) }, { skewY: `${4 * flutter.value}deg` }, { scaleX: 1 - 0.06 * Math.abs(flutter.value) }],
  }));
  return <View style={styles.flag} accessibilityLabel={`${teamName(team)} holds this ride${contested ? '. Contested.' : '.'}`}>
    <View style={styles.finial} /><View style={styles.pole} /><View style={styles.foot} />
    <Animated.View style={[styles.cloth, { backgroundColor: TEAMS[team].color }, cloth]}>
      <Image source={TEAMS[team].badge} style={styles.badge} contentFit="contain" />
    </Animated.View>
    {contested && <View style={styles.contested}><GameIcon name="swords" size={15} /></View>}
    {held && raiseKey && <View style={styles.held}><Text style={styles.heldText}>HELD!</Text></View>}
  </View>;
}

const styles = StyleSheet.create({
  flag: { width: 30, height: 38 },
  pole: { position: 'absolute', top: 4, bottom: 3, left: 2, width: 3, borderRadius: 2, backgroundColor: '#fff9df' },
  finial: { position: 'absolute', top: 0, left: 0, width: 7, height: 7, borderRadius: 4, backgroundColor: '#ffcf3b' },
  foot: { position: 'absolute', bottom: 0, left: 0, width: 9, height: 4, borderRadius: 2, backgroundColor: '#71603b' },
  cloth: { position: 'absolute', top: 5, left: 5, width: 25, height: 22, borderTopRightRadius: 7,
    borderBottomRightRadius: 7, borderWidth: 1.5, borderColor: '#fff9df', alignItems: 'center', justifyContent: 'center' },
  badge: { width: 21, height: 19 },
  contested: { position: 'absolute', bottom: -2, right: -6 },
  held: { position: 'absolute', top: -14, left: 4, backgroundColor: '#ffcf3b', borderRadius: 6, borderWidth: 1.5, borderColor: '#ffffff',
    paddingHorizontal: 3, transform: [{ rotate: '-8deg' }] },
  heldText: { fontFamily: 'Shark', fontSize: 9, color: '#05346e' },
});
