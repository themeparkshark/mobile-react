import { Image } from 'expo-image';
import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { TEAMS, type TeamId } from '../../constants/teams';
import useReducedGameMotion from '../../hooks/useReducedGameMotion';

/** A held ride always wears a flag. Only an exact confirmed flip gets a finite raise. */
export default function RideTeamFlag({ team, contested = false, raiseKey }: {
  readonly team: TeamId;
  readonly contested?: boolean;
  readonly raiseKey?: string;
}) {
  const reduced = useReducedGameMotion();
  const lift = useRef(new Animated.Value(1)).current;
  const raised = useRef(new Set<string>());
  useEffect(() => {
    lift.stopAnimation();
    if (!raiseKey || reduced || raised.current.has(raiseKey)) {
      if (raiseKey) raised.current.add(raiseKey);
      lift.setValue(1); return;
    }
    raised.current.add(raiseKey);
    lift.setValue(0);
    const animation = Animated.timing(lift, { toValue: 1, duration: 560, easing: Easing.out(Easing.cubic), useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [lift, raiseKey, reduced, team]);
  return <View style={styles.flag} accessibilityLabel={`${TEAMS[team].name} holds this ride${contested ? '. Contested.' : '.'}`}>
    <View style={styles.finial} /><View style={styles.pole} /><View style={styles.foot} />
    <Animated.View style={[styles.cloth, { backgroundColor: TEAMS[team].color,
      transform: [{ translateY: lift.interpolate({ inputRange: [0, 1], outputRange: [17, 0] }) }] }]}>
      <Image source={TEAMS[team].badge} style={styles.badge} contentFit="contain" />
    </Animated.View>
    {contested && <Text style={styles.contested}>⚔</Text>}
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
  contested: { position: 'absolute', bottom: 0, right: -3, fontSize: 13 },
});
