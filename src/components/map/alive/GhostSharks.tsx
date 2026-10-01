/**
 * Friends in the park as small ghost sharks: a pale, see-through fin with the
 * friend's name, gently bobbing on the map's ambient clock. Only drawn when the
 * server shares friends' positions (an optional field on the live park feed);
 * otherwise nothing renders and nothing is requested.
 */
import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { BRAND } from '../../../ui';
import { Marker } from '../Marker';
import { hash01 } from './ambientBudget';
import { useMapAlive } from './MapAliveContext';
import type { GhostShark } from './friendsNearby';

const FIN = require('../../../../assets/images/map/fx/fin.png');

function Ghost({ ghost }: { readonly ghost: GhostShark }) {
  const { clock, tier } = useMapAlive();
  const moving = tier !== 'calm';
  const phase = hash01(ghost.id);
  const bob = useAnimatedStyle(() => ({
    transform: [{ translateY: moving ? Math.sin((clock.value / 2.6 + phase) * Math.PI * 2) * 3 : 0 }],
  }));
  return (
    <View style={[styles.box, { opacity: ghost.fade }]} accessible accessibilityLabel={`Your friend ${ghost.name} is nearby`}>
      <Animated.View style={bob}>
        <View style={styles.glow} />
        <Animated.Image source={FIN} tintColor="#e8f7ff" resizeMode="contain" style={styles.fin} />
      </Animated.View>
      <Text style={styles.name} numberOfLines={1}>{ghost.name}</Text>
    </View>
  );
}

export const GhostSharks = memo(function GhostSharks({ ghosts }: { readonly ghosts: readonly GhostShark[] }) {
  return <>{ghosts.map(ghost => (
    <Marker key={ghost.id} coordinate={ghost} anchor={{ x: 0.5, y: 0.7 }}><Ghost ghost={ghost} /></Marker>
  ))}</>;
});

const styles = StyleSheet.create({
  box: { width: 90, alignItems: 'center' },
  glow: { position: 'absolute', left: 4, right: 4, bottom: -2, height: 10, borderRadius: 10, backgroundColor: 'rgba(191,229,255,0.55)' },
  fin: { width: 34, height: 30, opacity: 0.75 },
  name: { marginTop: 1, maxWidth: 88, fontFamily: 'Shark', fontSize: 11, color: BRAND.white, backgroundColor: 'rgba(5,52,110,0.55)',
    borderRadius: 7, overflow: 'hidden', paddingHorizontal: 5, paddingVertical: 1 },
});
