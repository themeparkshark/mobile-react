/**
 * Desk front (design 8, 12.2; rev 7 H12): the answer zone sits on the front
 * panel of a game-show contestant desk. Alex-style plank art from the
 * gate-passed tv_desk_front_v2 9-patch: the left and right end posts stay
 * fixed, the plank tile repeats (never stretches soft), and the bulb row and
 * gold trim run along the top and bottom. The railing strip sits on top.
 */
import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { ART } from '../art';

const SRC_H = 532;
const CAP_L = 226;
const CAP_R = 125;
const TILE = 258;

export function DeskFront({ width, height }: { width: number; height: number }) {
  const k = height / SRC_H;
  const capL = Math.round(CAP_L * k);
  const capR = Math.round(CAP_R * k);
  const tileW = TILE * k;
  const mid = Math.max(0, width - capL - capR);
  const tiles = Math.ceil(mid / tileW);
  return (
    <View style={[styles.row, { width, height }]} pointerEvents="none">
      <Image source={ART.deskCapL} style={{ width: capL, height }} resizeMode="stretch" />
      <View style={{ width: mid, height, overflow: 'hidden', flexDirection: 'row' }}>
        {Array.from({ length: tiles }, (_, i) => (
          <Image key={i} source={ART.deskTile} style={{ width: tileW + 0.5, height, marginRight: -0.5 }} resizeMode="stretch" />
        ))}
      </View>
      <Image source={ART.deskCapR} style={{ width: capR, height }} resizeMode="stretch" />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
});
