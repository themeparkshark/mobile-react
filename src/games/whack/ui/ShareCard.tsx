/**
 * ShareCard (design v5 6.11, Wordle steal): a QUICK / GOOD / LATE tile grid of
 * the Run on the cream plate, with the score and the stars. No emoji. It is
 * captured off-screen in a story-size frame (1080x1920) with the TPS link and a
 * QR, and handed to the share sheet only when the player taps SHARE; nothing is
 * ever posted for them. Kid safety: no ride name on the picture or in the text
 * (it would say where the player is standing right now).
 */

import React, { useCallback, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { captureFlex, openShareSheet } from '../../../share/capture';
import { campaignUrl, shareMessage } from '../../../share/link';
import { OFFSCREEN, StoryShareFrame } from '../../../share/StoryShareFrame';
import { ShareFace } from '../../../share/FlexShareButton';

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

/** The share text (no emoji, no ride name: it would say where the player is right now). */
export function shareText(_rideName: string | null, score: number, stars: number): string {
  return `I scored ${score.toLocaleString()} in Whack-a-Shark. ${stars} of 3 stars. Can you beat it?`;
}

/** `rideName` is kept for callers; it never goes on the picture. */
export function ShareCardButton({ tiles, score, stars }: { tiles: number[]; rideName: string | null; score: number; stars: number }) {
  const ref = useRef<View>(null);
  const [busy, setBusy] = useState(false);
  const share = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const uri = await captureFlex(ref, 'story');
      await openShareSheet(uri, shareMessage(campaignUrl('whack')), `Whack-a-Shark ${score}`);
    } catch {
      // The share sheet is optional; a failure never blocks the results.
    } finally {
      setBusy(false);
    }
  }, [busy]);
  const quick = tiles.filter((t) => t === TILE_QUICK).length;
  return (
    <View>
      {/* The one share pill every reveal uses (gold rim, glyph, "Share"). */}
      <TouchableOpacity style={styles.button} onPress={share} disabled={busy} accessibilityRole="button" accessibilityLabel="Share your run"
        accessibilityState={{ busy, disabled: busy }}>
        <ShareFace size="reveal" dim={busy} />
      </TouchableOpacity>
      {/* Off-screen card (captured on demand). */}
      <View style={OFFSCREEN} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <StoryShareFrame ref={ref} ribbon="WHACK-A-SHARK!" cta="Can you beat my score?" campaign="whack" withShark>
        <View style={styles.card}>
          {/* The ribbon already says WHACK-A-SHARK: the card leads with the run itself. */}
          <Text style={styles.title}>MY RUN</Text>
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
        </View>
        </StoryShareFrame>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  button: { alignSelf: 'center', marginTop: 10 },
  card: {
    width: 320, padding: 20, borderRadius: 24, backgroundColor: CREAM, borderWidth: 4, borderColor: NAVY, alignItems: 'center',
  },
  title: { fontFamily: 'Shark', fontSize: 30, color: NAVY },
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
