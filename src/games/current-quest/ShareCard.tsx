/**
 * Spoiler-free share card (design 14.3 Wordle, 0.A.5, 0.A.11): a shell grid,
 * the board's curator title, strokes vs par per voyage, the land subtitle,
 * date and streak, framed by Alex's compass rose. No route, no ride name.
 * Shared through the system share sheet only when the player taps Share; the
 * app never posts or sends anything itself.
 */

import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import { Image, Share, StyleSheet, Text, View } from 'react-native';
import ViewShot from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { CQ } from './theme';
import { CARD_CREAM } from './ResultsCard';

const SOCKET = require('../../assets/games/current-quest/shell_socket.png');
const COMPASS = require('../../assets/games/current-quest/compass.png');

export interface ShareCardData {
  /** "Daily Tide #12", "Ride Challenge", "Quick Run". */
  heading: string;
  /** Curator title of the Deep board ("Wait For It"), or the land subtitle. */
  title: string;
  grid: boolean[][];
  strokes: number[];
  pars: number[];
  place: string;
  date: string;
  streak: number;
  stamp: string | null;
}

export interface ShareCardHandle { share: (message: string) => Promise<boolean> }

export const ShareCard = forwardRef<ShareCardHandle, { data: ShareCardData }>(function ShareCard({ data }, ref) {
  const shot = useRef<ViewShot>(null);
  useImperativeHandle(ref, () => ({
    share: async (message: string) => {
      try {
        const uri = await shot.current?.capture?.();
        if (uri && (await Sharing.isAvailableAsync())) {
          await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: message });
          return true;
        }
        await Share.share({ message });
        return true;
      } catch {
        return false;
      }
    },
  }), []);
  return (
    <View style={styles.offscreen} pointerEvents="none">
      <ViewShot ref={shot} options={{ format: 'png', quality: 1 }}>
        <View style={styles.card} collapsable={false}>
          <Image source={COMPASS} style={styles.compass} />
          <Text style={styles.heading}>{data.heading}</Text>
          <Text style={styles.title}>{data.title}</Text>
          {data.grid.map((row, v) => (
            <View key={`r${v}`} style={styles.row}>
              {row.map((on, k) => (
                <View key={`s${k}`} style={styles.box}>
                  <Image source={SOCKET} style={[styles.socket, !on && styles.empty]} />
                  {on ? <View style={styles.gold} /> : null}
                </View>
              ))}
              <Text style={styles.strokes}>{data.strokes[v] != null ? `${data.strokes[v]} / par ${data.pars[v]}` : ''}</Text>
            </View>
          ))}
          {data.stamp ? <Text style={styles.stamp}>{data.stamp}</Text> : null}
          <Text style={styles.foot}>{`${data.place}  ${data.date}${data.streak > 1 ? `  streak ${data.streak}` : ''}`}</Text>
        </View>
      </ViewShot>
    </View>
  );
});

const styles = StyleSheet.create({
  offscreen: { position: 'absolute', left: -2000, top: 0 },
  card: { width: 320, padding: 18, borderRadius: 24, backgroundColor: CARD_CREAM, borderWidth: 4, borderColor: CQ.gold, alignItems: 'center' },
  compass: { position: 'absolute', right: 10, top: 10, width: 40, height: 40, opacity: 0.9 },
  heading: { fontFamily: 'Shark', fontSize: 24, color: CQ.ink },
  title: { fontFamily: 'Knockout', fontSize: 16, color: CQ.ink, marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 4, marginVertical: 2 },
  box: { width: 36, height: 36 },
  socket: { width: 36, height: 36, resizeMode: 'contain' },
  empty: { opacity: 0.35 },
  gold: { position: 'absolute', left: 5, top: 6, width: 26, height: 22, borderRadius: 11, backgroundColor: CQ.gold, opacity: 0.55 },
  strokes: { marginLeft: 8, fontFamily: 'Knockout', fontSize: 14, color: CQ.ink, minWidth: 90 },
  stamp: { marginTop: 6, fontFamily: 'Shark', fontSize: 18, color: CQ.ink, backgroundColor: CQ.gold, paddingHorizontal: 10, borderRadius: 8, overflow: 'hidden' },
  foot: { marginTop: 10, fontFamily: 'Knockout', fontSize: 12, color: CQ.ink },
});
