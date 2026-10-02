/**
 * ShareCard (design v5 6.11, Wordle steal): a QUICK / GOOD / LATE tile grid of
 * the Run on the cream plate, with the ride's in-app name, the score and the
 * stars. No emoji. It is captured off-screen and handed to the system share
 * sheet only when the player taps SHARE; nothing is ever posted for them.
 */

import React, { useCallback, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';

/** Tile codes: 0 LATE, 1 GOOD, 2 QUICK, 9 decoy hit. */
export const TILE_LATE = 0;
export const TILE_GOOD = 1;
export const TILE_QUICK = 2;
export const TILE_DECOY = 9;

const NAVY = '#0b3a66';
const CREAM = '#fff8e4';
const TILE_COLORS: Record<number, string> = { 0: '#f3e6c4', 1: '#3aa0e6', 2: '#ffcf3b', 9: NAVY };
const MAX_TILES = 120;
const COLS = 12;

/** Grid rows for the card (most recent tiles kept when a Run is very long). */
export function shareRows(tiles: number[], cols = COLS, max = MAX_TILES): number[][] {
  const t = tiles.length > max ? tiles.slice(tiles.length - max) : tiles;
  const rows: number[][] = [];
  for (let i = 0; i < t.length; i += cols) rows.push(t.slice(i, i + cols));
  return rows;
}

/** The share text that goes with the image (no emoji). */
export function shareText(rideName: string | null, score: number, stars: number): string {
  const where = rideName ? ` in line for ${rideName}` : '';
  return `I scored ${score.toLocaleString()} in Whack-a-Shark${where}. ${stars} of 3 stars. Can you beat it?`;
}

export function ShareCardButton({ tiles, rideName, score, stars }: { tiles: number[]; rideName: string | null; score: number; stars: number }) {
  const ref = useRef<View>(null);
  const [busy, setBusy] = useState(false);
  const share = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const uri = await captureRef(ref, { format: 'png', quality: 1, result: 'tmpfile' });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: shareText(rideName, score, stars), UTI: 'public.png' });
      }
    } catch {
      // The share sheet is optional; a failure never blocks the results.
    } finally {
      setBusy(false);
    }
  }, [busy, rideName, score, stars]);
  const quick = tiles.filter((t) => t === TILE_QUICK).length;
  return (
    <View>
      <TouchableOpacity style={styles.button} onPress={share} accessibilityRole="button" accessibilityLabel="Share your run">
        <Text style={styles.buttonText}>{busy ? 'SHARING...' : 'SHARE'}</Text>
      </TouchableOpacity>
      {/* Off-screen card (captured on demand). */}
      <View style={styles.offscreen} pointerEvents="none">
        <View ref={ref} collapsable={false} style={styles.card}>
          <Text style={styles.title}>WHACK-A-SHARK</Text>
          {rideName ? <Text style={styles.ride}>{rideName.toUpperCase()}</Text> : null}
          <Text style={styles.score}>{score.toLocaleString()}</Text>
          <View style={styles.stars}>
            {[0, 1, 2].map((k) => <View key={k} style={[styles.star, k < stars ? styles.starOn : null]} />)}
          </View>
          <View style={styles.grid}>
            {shareRows(tiles).map((row, r) => (
              <View key={r} style={styles.row}>
                {row.map((t, c) => (
                  <View key={c} style={[styles.tile, { backgroundColor: TILE_COLORS[t] ?? CREAM }]}>
                    {t === TILE_DECOY ? <Text style={styles.bang}>!</Text> : null}
                  </View>
                ))}
              </View>
            ))}
          </View>
          <Text style={styles.foot}>{`${quick} QUICK BONKS`}</Text>
          <Text style={styles.brand}>THEME PARK SHARK</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    alignSelf: 'center', marginTop: 10, paddingHorizontal: 28, paddingVertical: 10, borderRadius: 22,
    backgroundColor: '#ffffff', borderWidth: 3, borderColor: NAVY, borderBottomWidth: 6,
  },
  buttonText: { fontFamily: 'Shark', fontSize: 20, color: NAVY },
  offscreen: { position: 'absolute', left: -4000, top: 0 },
  card: {
    width: 360, padding: 20, borderRadius: 24, backgroundColor: CREAM, borderWidth: 4, borderColor: NAVY, alignItems: 'center',
  },
  title: { fontFamily: 'Shark', fontSize: 30, color: NAVY },
  ride: { fontFamily: 'Knockout', fontSize: 16, color: '#0768b9', marginTop: 2 },
  score: { fontFamily: 'Shark', fontSize: 44, color: NAVY, marginTop: 6 },
  stars: { flexDirection: 'row', marginTop: 4, marginBottom: 10 },
  star: { width: 22, height: 22, borderRadius: 11, marginHorizontal: 4, borderWidth: 3, borderColor: NAVY, backgroundColor: '#ffffff' },
  starOn: { backgroundColor: '#ffcf3b' },
  grid: { alignItems: 'flex-start' },
  row: { flexDirection: 'row' },
  tile: {
    width: 22, height: 22, margin: 2, borderRadius: 5, borderWidth: 2, borderColor: NAVY, alignItems: 'center', justifyContent: 'center',
  },
  bang: { fontFamily: 'Shark', fontSize: 13, color: '#ffffff' },
  foot: { fontFamily: 'Knockout', fontSize: 15, color: NAVY, marginTop: 10 },
  brand: { fontFamily: 'Shark', fontSize: 14, color: '#0768b9', marginTop: 4 },
});
