/**
 * MemoryMenu.tsx: the public Memory Match component (keeps MemoryGame's props).
 *
 * The paid Ride Challenge (mode="ride"), Finn's warm-up (difficulty 0), Line Party and fixed-mode callers go straight
 * into the game. Queue callers that pass `menu` get the barker's booth menu
 * first: Time Attack, the Daily Deck (streak, ranked try, friend or par ghost)
 * and Pass & Play for 2-4 sharks on one phone. Everything sits in the bottom
 * thumb zone with 64pt+ targets, so it works one-handed while the line moves.
 * Closing a game comes back to the booth; the booth's X leaves.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GameAudio, Haptic } from '../../gamekit';
import GameIcon from '../../ui/GameIcon';
import useReducedGameMotion from '../../hooks/useReducedGameMotion';
import MemoryGame, { type DailySetup, type MemoryGameProps } from './MemoryGame';
import PassPlayGame from './PassPlayGame';
import { deckById, deckIdForRideName } from './decks';
import { faceFor } from './faces';
import { FaceThumb, AlbumSheet } from './MemoryExtras';
import { MM } from './theme';
import { dailyDeckId, dailyFaceSeed, dailyLayoutSeed, dayKey, liveStreak, parGhost } from './modes/daily';
import { fetchDailyGhosts, pickGhost } from './modes/dailyApi';
import { emptyAlbum, type Album } from './modes/album';
import { loadAlbum, loadDaily, loadPersonalBest, loadPlayerKey, loadStreak, type DailyRecord } from './storage';

const BARKER_WAVE = require('../../assets/games/memory/studio/barker_wave.png');
const BOOTH = require('../../assets/games/memory/studio/booth_frame.png');
const STREAK = require('../../assets/games/memory/studio/streak.png');
const STOPWATCH = require('../../assets/games/memory/studio/stopwatch.png');
const CARD_BACK = require('../../assets/games/memory/card-back.png');

export interface MemoryMatchProps extends MemoryGameProps {
  /** Queue entry: show the booth menu (Time Attack, Daily Deck, Pass & Play). */
  menu?: boolean;
}

type Pick = { kind: 'timeAttack' } | { kind: 'daily'; setup: DailySetup } | { kind: 'passPlay'; players: number };

export default function MemoryMatch(props: MemoryMatchProps) {
  const { visible, onClose, mode, party, difficulty } = props;
  // Dev capture: EXPO_PUBLIC_MEMORY_MENU=1 opens the booth from any entry.
  const devMenu = typeof __DEV__ !== 'undefined' && __DEV__ && process.env.EXPO_PUBLIC_MEMORY_MENU === '1';
  const menu = props.menu || devMenu;
  const direct = !menu || !!party || (!devMenu && (!!mode || difficulty === 0));
  const [pick, setPick] = useState<Pick | null>(null);
  useEffect(() => { if (!visible) setPick(null); }, [visible]);

  if (direct) return <MemoryGame {...props} />;
  if (!visible) return null;
  if (pick?.kind === 'timeAttack') return <MemoryGame {...props} mode="timeAttack" onClose={() => setPick(null)} />;
  if (pick?.kind === 'daily') return <MemoryGame {...props} mode="daily" daily={pick.setup} onClose={() => setPick(null)} />;
  if (pick?.kind === 'passPlay') {
    return <PassPlayGame visible players={pick.players} deckId={props.deckId ?? deckIdForRideName(props.taskName)} seed={props.seed}
      onClose={() => setPick(null)} onQuit={props.onQuit} />;
  }
  return <BoothMenu taskName={props.taskName} deckId={props.deckId} onPick={setPick} onClose={onClose} />;
}

function BoothMenu({ taskName, deckId, onPick, onClose }: { taskName?: string; deckId?: string; onPick: (p: Pick) => void; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedGameMotion();
  const [best, setBest] = useState(0);
  const [today] = useState(() => dayKey(new Date()));
  const [rec, setRec] = useState<DailyRecord | null>(null);
  const [streak, setStreak] = useState<Awaited<ReturnType<typeof loadStreak>> | null>(null);
  const [player, setPlayer] = useState<string | null>(null);
  const [ghost, setGhost] = useState<DailySetup['ghost']>(null);
  const [album, setAlbum] = useState<Album>(emptyAlbum());
  const [albumOpen, setAlbumOpen] = useState(false);
  const [players, setPlayers] = useState(2);
  const rideDeck = taskName ? deckId ?? deckIdForRideName(taskName) : deckId ?? null;
  const dailyDeck = deckById(dailyDeckId(today, rideDeck)) ?? deckById('park')!;

  useEffect(() => {
    let live = true;
    void loadPersonalBest(1).then((b) => live && setBest(b));
    void loadDaily(today).then((r) => live && setRec(r));
    void loadStreak().then((s) => live && setStreak(s));
    void loadPlayerKey().then((k) => live && setPlayer(k));
    void loadAlbum().then((a) => live && setAlbum(a));
    void fetchDailyGhosts(today).then((g) => live && setGhost(pickGhost(g)));
    return () => { live = false; };
  }, [today]);

  // Entry: shark squash-pops in, the three booth cards slide up 70ms apart.
  const enter = useSharedValue(reducedMotion ? 1 : 0);
  const bob = useSharedValue(0);
  useEffect(() => {
    if (reducedMotion) return;
    enter.value = withTiming(1, { duration: 520, easing: Easing.out(Easing.cubic) });
    bob.value = withRepeat(withTiming(1, { duration: 1000, easing: Easing.inOut(Easing.sin) }), -1, true);
    GameAudio.play('fx.whoosh', { volume: 0.5 });
  }, [enter, bob, reducedMotion]);
  const sharkStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, enter.value * 2),
    transform: [{ translateY: (1 - enter.value) * 40 - bob.value * 3 }, { scaleY: 0.92 + 0.08 * enter.value + bob.value * 0.015 }],
  }));

  const streakNow = streak ? liveStreak(streak, today) : 0;
  const go = useCallback((p: Pick) => {
    Haptic.hitMedium();
    GameAudio.play('mm_flip');
    onPick(p);
  }, [onPick]);

  const startDaily = () => {
    if (!streak || !player) return;
    go({
      kind: 'daily',
      setup: {
        day: today,
        deckId: dailyDeck.id,
        layoutSeed: dailyLayoutSeed(today, player, rec ? 1 : 0),
        faceSeed: dailyFaceSeed(today, dailyDeck.id),
        ranked: !rec,
        ghost: ghost ?? parGhost(8),
        streak,
      },
    });
  };

  return (
    <Modal visible transparent={false} animationType={reducedMotion ? 'none' : 'fade'} onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        <LinearGradient colors={['#0b80c4', '#35a8e6', '#bfe5ff']} style={StyleSheet.absoluteFill} />
        <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
          <Pressable onPress={onClose} style={styles.close} accessibilityRole="button" accessibilityLabel="Close" hitSlop={10}>
            <GameIcon name="close" size={24} />
          </Pressable>
          <Text style={styles.title}>Memory Match</Text>
          <Pressable onPress={() => setAlbumOpen(true)} style={styles.albumBtn} accessibilityRole="button" accessibilityLabel="Card album" hitSlop={8}>
            <Image source={CARD_BACK} style={styles.albumIcon} resizeMode="cover" />
            <Text style={styles.albumText}>ALBUM</Text>
          </Pressable>
        </View>
        <View style={styles.stage}>
          <View style={styles.scene}>
            <View style={styles.sun} />
            <View style={styles.ground} />
            <Image source={BOOTH} style={styles.booth} resizeMode="contain" />
            <Animated.Image source={BARKER_WAVE} style={[styles.barker, sharkStyle]} resizeMode="contain" />
            <View style={styles.bubble}><Text style={styles.bubbleText}>Step right up! Pick your game.</Text></View>
          </View>
        </View>
        <View style={[styles.cards, { paddingBottom: insets.bottom + 14 }]}>
          <BoothCard index={0} reducedMotion={reducedMotion} onPress={() => go({ kind: 'timeAttack' })}
            title="Time Attack" body="Race the clock. Every clean board grows." icon={STOPWATCH}
            right={best > 0 ? <Stat label="BEST" value={best.toLocaleString()} /> : null} />
          <BoothCard index={1} reducedMotion={reducedMotion} onPress={startDaily} gold
            title="Daily Deck" body={rec ? (rec.cleared ? `Cleared in ${rec.turns} turns. Practice runs are open.` : 'Ranked try played. Practice runs are open.') : `Two slips and you're out. ${ghost ? `Race ${ghost.name}.` : 'Beat the par shark.'}`}
            icon={STREAK}
            right={<View style={{ alignItems: 'flex-end' }}>
              <View style={{ flexDirection: 'row' }}>
                {[0, 1, 2].map((f) => <View key={f} style={{ marginLeft: f ? -8 : 0, transform: [{ rotateZ: `${(f - 1) * 8}deg` }] }}><FaceThumb face={faceFor(dailyDeck, f)} w={24} h={30} radius={4} /></View>)}
              </View>
              <Text style={styles.badge}>{rec ? 'PRACTICE' : 'RANKED'}{streakNow ? ` · ${streakNow} DAY${streakNow === 1 ? '' : 'S'}` : ''}</Text>
            </View>} />
          <BoothCard index={2} reducedMotion={reducedMotion} onPress={() => go({ kind: 'passPlay', players })}
            title="Pass & Play" body="One phone, up to 4 sharks. Match and go again." icon={CARD_BACK}
            right={<Stepper value={players} onChange={(v) => { Haptic.tickSelection(); setPlayers(v); }} />} />
        </View>
        <AlbumSheet visible={albumOpen} album={album} onClose={() => setAlbumOpen(false)} />
      </View>
    </Modal>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ alignItems: 'flex-end' }}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

function Stepper({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <View style={styles.stepper}>
      {[2, 3, 4].map((n) => (
        <Pressable key={n} onPress={() => onChange(n)} style={[styles.stepBtn, value === n && styles.stepOn]} hitSlop={4}
          accessibilityRole="button" accessibilityLabel={`${n} players`} accessibilityState={{ selected: value === n }}>
          <Text style={[styles.stepText, value === n && styles.stepTextOn]}>{n}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function BoothCard({ index, title, body, icon, right, onPress, gold, reducedMotion }: {
  index: number; title: string; body: string; icon: number; right: React.ReactNode; onPress: () => void; gold?: boolean; reducedMotion: boolean;
}) {
  const t = useSharedValue(reducedMotion ? 1 : 0);
  const press = useSharedValue(1);
  useEffect(() => {
    if (reducedMotion) return;
    t.value = withDelay(180 + index * 70, withTiming(1, { duration: 360, easing: Easing.out(Easing.back(1.3)) }));
  }, [index, reducedMotion, t]);
  const st = useAnimatedStyle(() => ({ opacity: Math.min(1, t.value * 1.5), transform: [{ translateY: (1 - t.value) * 60 }, { scale: press.value }] }));
  return (
    <Animated.View style={st}>
      <Pressable onPress={onPress}
        onPressIn={() => { press.value = withTiming(0.96, { duration: 60 }); }}
        onPressOut={() => { press.value = withSequence(withTiming(1.02, { duration: 80 }), withTiming(1, { duration: 80 })); }}
        style={[styles.card, gold && styles.cardGold]} accessibilityRole="button" accessibilityLabel={`${title}. ${body}`}>
        <View style={[styles.iconWell, gold && styles.iconWellGold]}>
          <Image source={icon} style={styles.icon} resizeMode="contain" />
        </View>
        <View style={{ flex: 1, paddingRight: 8 }}>
          <Text style={styles.cardTitle}>{title}</Text>
          <Text style={styles.cardBody} numberOfLines={2}>{body}</Text>
        </View>
        {right}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#35a8e6' },
  top: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 },
  close: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#ffffff', borderWidth: 3, borderColor: '#05346e', alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, textAlign: 'center', fontFamily: 'Shark', fontSize: 30, color: '#ffffff', textShadowColor: '#05346e', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0 },
  albumBtn: { alignItems: 'center', width: 52 },
  albumIcon: { width: 30, height: 38, borderRadius: 5, borderWidth: 2, borderColor: '#ffffff' },
  albumText: { fontFamily: 'Knockout', fontSize: 11, color: '#ffffff', marginTop: 2 },
  stage: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', minHeight: 200 },
  scene: { width: 340, height: 270, maxHeight: '100%' },
  sun: { position: 'absolute', left: 40, right: 40, top: 10, height: 260, borderRadius: 130, backgroundColor: 'rgba(255,255,255,0.22)' },
  ground: { position: 'absolute', left: 10, right: 10, bottom: 0, height: 34, borderRadius: 170, backgroundColor: 'rgba(5,52,110,0.18)' },
  booth: { position: 'absolute', bottom: 8, right: 16, height: 250, width: 250 * 299 / 384 },
  barker: { position: 'absolute', bottom: 2, left: 18, height: 220, width: 220 * 581 / 768 },
  bubble: { position: 'absolute', top: 0, left: 140, maxWidth: 150, backgroundColor: '#ffffff', borderRadius: 16, borderWidth: 3, borderColor: MM.ink, paddingHorizontal: 10, paddingVertical: 6 },
  bubbleText: { fontFamily: 'Knockout', fontSize: 15, color: MM.navyText, textAlign: 'center' },
  cards: { paddingHorizontal: 16, gap: 12, paddingTop: 12 },
  card: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#ffffff', borderRadius: 22, borderWidth: 3, borderColor: MM.ink,
    paddingHorizontal: 12, paddingVertical: 12, minHeight: 84, borderBottomWidth: 7,
  },
  cardGold: { backgroundColor: MM.cream, borderColor: MM.goldDeep },
  iconWell: { width: 56, height: 56, borderRadius: 16, backgroundColor: '#dff1ff', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  iconWellGold: { backgroundColor: '#ffe9a6' },
  icon: { width: 40, height: 44 },
  cardTitle: { fontFamily: 'Shark', fontSize: 24, color: MM.navyText },
  cardBody: { fontFamily: 'Knockout', fontSize: 14, color: MM.ink },
  statLabel: { fontFamily: 'Knockout', fontSize: 11, color: MM.ink },
  statValue: { fontFamily: 'Shark', fontSize: 18, color: MM.navyText },
  badge: { fontFamily: 'Knockout', fontSize: 11, color: MM.goldDeep, marginTop: 4 },
  stepper: { flexDirection: 'row', gap: 4 },
  stepBtn: { width: 34, height: 44, borderRadius: 10, borderWidth: 2, borderColor: MM.ink, alignItems: 'center', justifyContent: 'center', backgroundColor: '#ffffff' },
  stepOn: { backgroundColor: MM.gold, borderColor: MM.goldDeep },
  stepText: { fontFamily: 'Shark', fontSize: 18, color: MM.navyText },
  stepTextOn: { color: '#075083' },
});
