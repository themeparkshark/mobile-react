/**
 * Current Quest entry (design v7.1 0.A.11, 4.1, 14.3): the Daily Tide hero
 * tile with its streak, the multiplayer row (Challenge a Friend, Ghost Race,
 * and Live Showdown only when the queue has 2 or more people playing), the
 * Quick Run, and the Lagoon Chart v0 map with its medals.
 *
 * WS5 owns where this lives in LinePlay; this component only reports what the
 * player picked through `onPlay`. A room with 1 person filled by ghosts is
 * labelled Ghost Race, never Live (0.A.11).
 */

import React, { useEffect, useMemo, useState } from 'react';
import { CQ_RUN_ART, preloadCqImages } from './cqImages';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';
import { CQ } from './theme';
import { CARD_CREAM } from './ResultsCard';
import { CHART_V0, chapterOpen, markOf, nodeOpen, type ChartNode } from './chart';
import { dailyNumber, liveStreak, loadProgress, localDate, type CqProgress } from './progress';
import type { RunContext } from './library';
import * as Linking from 'expo-linking';
import { parseChallengeUrl, type ChallengeLink } from './challengeLink';

const BACKDROP = require('../../assets/games/current-quest/backdrop.jpg');
const SHARK = require('../../assets/games/current-quest/cq_shark_cheer.png');
const SOCKET = require('../../assets/games/current-quest/shell_socket.png');
const LOCK = require('../../assets/games/current-quest/padlock.png');
const CHEST = require('../../assets/games/current-quest/chest_closed.png');
const CREW = require('../../assets/games/current-quest/avatar_blue.png');

export interface HubPick {
  context: RunContext;
  chartNodeId?: string;
  /** A friend's challenge opened from a link (0.A.11). */
  challenge?: ChallengeLink;
}

export function CurrentQuestHub({ onPlay, liveHumans = 1, today = localDate(), refreshKey = 0 }: {
  onPlay: (pick: HubPick) => void;
  /** People (not ghosts) present in this queue's signal round; Live Showdown needs 2+. */
  liveHumans?: number;
  today?: string;
  refreshKey?: number;
}) {
  const [p, setP] = useState<CqProgress | null>(null);
  useEffect(() => { void loadProgress().then((x) => setP({ ...x })); }, [refreshKey]);
  useEffect(() => { void preloadCqImages(CQ_RUN_ART); }, []);
  // A friend's challenge link (opened from the share sheet message) becomes the top tile.
  const [incoming, setIncoming] = useState<ChallengeLink | null>(null);
  useEffect(() => {
    const take = (url: string | null) => { const c = parseChallengeUrl(url); if (c) setIncoming(c); };
    void Linking.getInitialURL().then(take).catch(() => undefined);
    const sub = Linking.addEventListener('url', ({ url }) => take(url));
    return () => sub.remove();
  }, []);
  const streak = p ? liveStreak(p, today) : 0;
  const playedToday = !!p?.daily[today];
  const n = dailyNumber(today);
  const medals = p?.chart ?? {};

  return (
    <View style={styles.root}>
      <Image source={BACKDROP} style={StyleSheet.absoluteFill} resizeMode="cover" />
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>Current Quest</Text>
        {incoming ? (
          <Animated.View entering={ZoomIn.springify().damping(12)}>
            <Pressable onPress={() => onPlay({ context: 'challenge', challenge: incoming })} style={({ pressed }) => [styles.daily, styles.friend, pressed && styles.pressed]}
              accessibilityRole="button" accessibilityLabel={`${incoming.name} challenged you: ${incoming.shells} shells in ${incoming.strokes} strokes`}>
              <Image source={SOCKET} style={styles.friendImg} />
              <View style={{ flex: 1 }}>
                <Text style={styles.dailyTitle}>{`${incoming.name} challenged you`}</Text>
                <Text style={styles.dailySub}>{`Beat ${incoming.shells} shells in ${incoming.strokes} strokes. Same boards.`}</Text>
              </View>
            </Pressable>
          </Animated.View>
        ) : null}
        <Animated.View entering={ZoomIn.springify().damping(12)}>
          <Pressable onPress={() => onPlay({ context: 'daily' })} style={({ pressed }) => [styles.daily, pressed && styles.pressed]}
            accessibilityRole="button" accessibilityLabel={`Daily Tide number ${n}${streak ? `, streak ${streak}` : ''}`}>
            <Image source={SHARK} style={styles.dailyShark} />
            <View style={{ flex: 1 }}>
              <Text style={styles.dailyTitle}>{`Daily Tide #${n}`}</Text>
              <Text style={styles.dailySub}>{playedToday ? 'Played today. Practice any time.' : 'One scored try today. Three voyages.'}</Text>
            </View>
            {streak > 0 ? (
              <View style={styles.streak}>
                <Text style={styles.streakNum}>{streak}</Text>
                <Text style={styles.streakLbl}>streak</Text>
              </View>
            ) : null}
          </Pressable>
        </Animated.View>
        <View style={styles.row}>
          <Tile label="Quick Run" sub="2 voyages, about a minute" onPress={() => onPlay({ context: 'quick' })} img={CHEST} />
          <Tile label="Challenge a Friend" sub="play, then send your run" onPress={() => onPlay({ context: 'challenge' })} img={SOCKET} />
        </View>
        <View style={styles.row}>
          <Tile label="Ghost Race" sub="3 voyages vs the crew" onPress={() => onPlay({ context: 'showdown' })} img={CREW} />
          {liveHumans >= 2 ? (
            <Tile label="Live Showdown" sub={`${liveHumans} sharks in this line`} onPress={() => onPlay({ context: 'showdown' })} img={CREW} gold />
          ) : <View style={{ flex: 1 }} />}
        </View>
        <Text style={styles.chartTitle}>Lagoon Chart</Text>
        {CHART_V0.map((ch) => (
          <View key={`ch${ch.chapter}`} style={styles.chapter}>
            <View style={styles.chapterHead}>
              <Text style={styles.chapterName}>{`${ch.chapter}. ${ch.name}`}</Text>
              {!chapterOpen(ch.chapter, medals) ? <Text style={styles.chapterLock}>Clear 10 boards in Current Cove</Text> : null}
            </View>
            <ChartPath nodes={ch.nodes} medals={medals} onPick={(node) => onPlay({ context: 'chart', chartNodeId: node.id })} />
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

function Tile({ label, sub, onPress, img, gold }: { label: string; sub: string; onPress: () => void; img: number; gold?: boolean }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.tile, gold && styles.tileGold, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={label}>
      <Image source={img} style={styles.tileImg} />
      <Text style={styles.tileLabel}>{label}</Text>
      <Text style={styles.tileSub}>{sub}</Text>
    </Pressable>
  );
}

/** A winding row of chart nodes: ink on 3 shells, a pencil sketch on a clear, a padlock until the node before is cleared. */
function ChartPath({ nodes, medals, onPick }: { nodes: readonly ChartNode[]; medals: Record<string, { medal: number; shells: number }>; onPick: (n: ChartNode) => void }) {
  const rows = useMemo(() => [nodes.slice(0, 4), nodes.slice(4, 8).reverse(), nodes.slice(8, 12)], [nodes]);
  return (
    <View style={styles.path}>
      {rows.map((row, r) => (
        <View key={`row${r}`} style={styles.pathRow}>
          {row.map((node) => {
            const open = nodeOpen(node, medals);
            const entry = medals[node.id];
            const mark = markOf(entry);
            return (
              <Animated.View key={node.id} entering={FadeIn.delay(node.index * 30)} style={styles.nodeWrap}>
                <Pressable disabled={!open} onPress={() => onPick(node)} accessibilityRole="button"
                  accessibilityLabel={`${node.name}${open ? '' : ', locked'}${entry ? `, ${entry.shells} shells` : ''}`}
                  style={({ pressed }) => [styles.node, mark === 'ink' && styles.nodeInk, mark === 'sketch' && styles.nodeSketch, !open && styles.nodeLocked, node.index === 12 && styles.nodeDeep, pressed && styles.pressed]}>
                  {open ? <Text style={[styles.nodeNum, mark === 'ink' && styles.nodeNumInk]}>{node.index}</Text> : <Image source={LOCK} style={styles.lock} />}
                </Pressable>
                <View style={styles.medals}>
                  {[0, 1, 2].map((k) => <View key={`m${k}`} style={[styles.medal, (entry?.shells ?? 0) > k && styles.medalOn]} />)}
                  {entry && entry.medal >= 4 ? <View style={[styles.medal, styles.author]} /> : null}
                </View>
                <Text style={styles.nodeName} numberOfLines={1}>{node.name}</Text>
              </Animated.View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  friend: { backgroundColor: '#fff3c2', marginBottom: 10 },
  friendImg: { width: 56, height: 56, resizeMode: 'contain', marginRight: 10 },
  root: { flex: 1, backgroundColor: CQ.water },
  scroll: { padding: 14, paddingTop: 54, paddingBottom: 60, gap: 10 },
  title: { fontFamily: 'Shark', fontSize: 34, color: '#ffffff', textAlign: 'center', textShadowColor: CQ.ink, textShadowRadius: 1, textShadowOffset: { width: 2, height: 2 } },
  daily: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 22, backgroundColor: CARD_CREAM, borderWidth: 4, borderColor: CQ.gold },
  dailyShark: { width: 64, height: 76, resizeMode: 'contain' },
  dailyTitle: { fontFamily: 'Shark', fontSize: 26, color: CQ.navy },
  dailySub: { fontFamily: 'Knockout', fontSize: 14, color: CQ.navy },
  streak: { alignItems: 'center', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 14, backgroundColor: CQ.gold, borderWidth: 2.5, borderColor: CQ.ink },
  streakNum: { fontFamily: 'Shark', fontSize: 24, color: CQ.navy },
  streakLbl: { fontFamily: 'Knockout', fontSize: 11, color: CQ.navy },
  row: { flexDirection: 'row', gap: 10 },
  tile: { flex: 1, alignItems: 'center', padding: 10, borderRadius: 18, backgroundColor: '#ffffff', borderWidth: 2.5, borderColor: CQ.ink },
  tileGold: { backgroundColor: '#fff3c2', borderColor: CQ.goldDeep },
  tileImg: { width: 44, height: 40, resizeMode: 'contain' },
  tileLabel: { marginTop: 4, fontFamily: 'Shark', fontSize: 17, color: CQ.navy, textAlign: 'center' },
  tileSub: { fontFamily: 'Knockout', fontSize: 12, color: CQ.navy, textAlign: 'center' },
  pressed: { transform: [{ scale: 0.96 }] },
  chartTitle: { marginTop: 8, fontFamily: 'Shark', fontSize: 26, color: '#ffffff', textShadowColor: CQ.ink, textShadowRadius: 1, textShadowOffset: { width: 2, height: 2 } },
  chapter: { padding: 10, borderRadius: 20, backgroundColor: 'rgba(255,248,228,0.92)', borderWidth: 2.5, borderColor: CQ.ink },
  chapterHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  chapterName: { fontFamily: 'Shark', fontSize: 19, color: CQ.navy },
  chapterLock: { fontFamily: 'Knockout', fontSize: 12, color: CQ.coral },
  path: { gap: 8 },
  pathRow: { flexDirection: 'row', justifyContent: 'space-between' },
  nodeWrap: { width: '24%', alignItems: 'center' },
  node: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#ffffff', borderWidth: 3, borderColor: CQ.ink, alignItems: 'center', justifyContent: 'center' },
  nodeInk: { backgroundColor: CQ.gold },
  nodeSketch: { borderColor: '#8a8a96', backgroundColor: '#f4f1e8' },
  nodeLocked: { backgroundColor: 'rgba(255,255,255,0.55)', borderColor: 'rgba(47,47,58,0.4)' },
  nodeDeep: { width: 58, height: 58, borderRadius: 29, borderWidth: 4 },
  nodeNum: { fontFamily: 'Shark', fontSize: 20, color: CQ.navy },
  nodeNumInk: { color: CQ.navy },
  lock: { width: 22, height: 26, resizeMode: 'contain', opacity: 0.7 },
  medals: { flexDirection: 'row', gap: 2, marginTop: 3 },
  medal: { width: 9, height: 9, borderRadius: 5, backgroundColor: 'rgba(47,47,58,0.15)', borderWidth: 1, borderColor: CQ.ink },
  medalOn: { backgroundColor: CQ.gold },
  author: { backgroundColor: CQ.coral },
  nodeName: { fontFamily: 'Knockout', fontSize: 10, color: CQ.navy, marginTop: 2, maxWidth: 84, textAlign: 'center' },
});
