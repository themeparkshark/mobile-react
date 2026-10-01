/**
 * MemoryExtras.tsx: everything under the results card (design 4.3, 4.4, 5.6, 6.10).
 *
 *   FaceThumb       one face of a deck sheet at any size (shelf, album, chips)
 *   ResultsExtras   NEW CARD / NEW FOIL / NEW STAMP flips, then ALBUM, SHARE,
 *                   CHALLENGE buttons (each sheet opens only on its own tap)
 *   ShareSheet      the Wordle-style grid as an image (view-shot), shared only
 *                   on the SHARE tap through the system share sheet
 *   AlbumSheet      deck pages with collected, foil and perfect states, ride stamps
 *   ChallengeSheet  friend picker; SEND is the only thing that posts
 *
 * Bright surfaces only: cream and white sheets, blue ink, gold actions. No emoji.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { captureRef } from 'react-native-view-shot';
import Svg, { Path } from 'react-native-svg';
import * as Sharing from 'expo-sharing';
import { GameAudio, Haptic } from '../../gamekit';
import apiClient from '../../api/client';
import getFriends from '../../api/endpoints/me/friends';
import type { PlayerType } from '../../models/player-type';
import { DECKS, deckById, type Deck } from './decks';
import { faceFor } from './faces';
import type { CardFace } from './MemoryCard';
import { MM } from './theme';
import { FOIL_AT, collected, foils, isFoil, type Album } from './modes/album';
import { shareRows, type ShareCell } from './modes/daily';
import { parFor } from './engine';

const CARD_BACK = require('../../assets/games/memory/card-back.png');
const STAMP = require('../../assets/games/memory/studio/match_stamp.png');
const STREAK = require('../../assets/games/memory/studio/streak.png');
const CROWN = require('../../assets/games/memory/studio/crown.png');

// -----------------------------------------------------------------------------
// FaceThumb
// -----------------------------------------------------------------------------

export function FaceThumb({ face, w, h, foil, dim, radius = 5 }: { face: CardFace; w: number; h: number; foil?: boolean; dim?: boolean; radius?: number }) {
  return (
    <View style={[styles.thumb, { width: w, height: h, borderRadius: radius }, foil && styles.thumbFoil, dim && styles.thumbDim]}>
      {face.art ? (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: face.plate, alignItems: 'center', justifyContent: 'center' }]}>
          <Image source={face.art} style={{ width: w * 0.8, height: h * 0.7 }} resizeMode="contain" />
        </View>
      ) : face.sheet != null && face.slot != null ? (
        <Image source={face.sheet} resizeMode="stretch" style={{
          position: 'absolute', width: w * (face.cols ?? 4), height: h * (face.rows ?? 2),
          left: -(face.slot % (face.cols ?? 4)) * w, top: -Math.floor(face.slot / (face.cols ?? 4)) * h,
        }} />
      ) : null}
      {foil ? <FoilSweep w={w} h={h} /> : null}
    </View>
  );
}

/** Gold foil: a warm band sweeping across the face every 2.5s (code over Alex's art, no restyle). */
function FoilSweep({ w, h }: { w: number; h: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withRepeat(withSequence(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }), withDelay(1600, withTiming(0, { duration: 0 }))), -1, false);
  }, [t]);
  const st = useAnimatedStyle(() => ({ transform: [{ translateX: -w + t.value * w * 2.2 }, { rotateZ: '20deg' }] }));
  return (
    <>
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(254,201,14,0.16)' }]} />
      <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: -h * 0.2, width: w * 0.32, height: h * 1.4, backgroundColor: 'rgba(255,246,200,0.55)' }, st]} />
    </>
  );
}

// -----------------------------------------------------------------------------
// ResultsExtras
// -----------------------------------------------------------------------------

export interface RunRewards {
  deckId: string;
  newCards: number[];
  newFoils: number[];
  foilDeckDone: boolean;
  newStamp: boolean;
  album: Album;
}

export interface DailySummary {
  day: string;
  ranked: boolean;
  cleared: boolean;
  turns: number;
  pairs: number;
  stars: number;
  streak: number;
  verdicts: number[];
  deckId: string;
}

export function ResultsExtras({ rewards, daily, reducedMotion }: { rewards: RunRewards | null; daily: DailySummary | null; reducedMotion: boolean }) {
  const [sheet, setSheet] = useState<'album' | 'share' | 'challenge' | null>(null);
  const deck = rewards ? deckById(rewards.deckId) : null;
  const chips: { key: string; label: string; face?: number; stamp?: boolean }[] = [];
  if (rewards && deck) {
    rewards.newFoils.slice(0, 3).forEach((f) => chips.push({ key: `f${f}`, label: 'NEW FOIL', face: f }));
    rewards.newCards.slice(0, Math.max(0, 4 - chips.length)).forEach((f) => chips.push({ key: `c${f}`, label: 'NEW CARD', face: f }));
    if (rewards.newStamp) chips.unshift({ key: 'stamp', label: 'NEW STAMP', stamp: true });
  }
  return (
    <View style={styles.extras}>
      {chips.length ? (
        <View style={styles.chipRow}>
          {chips.slice(0, 4).map((c, i) => (
            <NewChip key={c.key} index={i} label={c.label} reducedMotion={reducedMotion}
              face={c.face != null && deck ? faceFor(deck, c.face) : null} foil={c.label === 'NEW FOIL'} stamp={!!c.stamp} />
          ))}
        </View>
      ) : null}
      {rewards?.foilDeckDone ? <Text style={styles.foilDone}>FULL FOIL DECK: gold card back unlocked</Text> : null}
      <View style={styles.btnRow}>
        {rewards ? <SmallBtn label="ALBUM" onPress={() => setSheet('album')} /> : null}
        {daily ? <SmallBtn label="SHARE" onPress={() => setSheet('share')} /> : null}
        {daily && daily.ranked ? <SmallBtn label="CHALLENGE" onPress={() => setSheet('challenge')} /> : null}
      </View>
      {rewards ? <AlbumSheet visible={sheet === 'album'} album={rewards.album} focusDeck={rewards.deckId} onClose={() => setSheet(null)} /> : null}
      {daily ? <ShareSheet visible={sheet === 'share'} daily={daily} onClose={() => setSheet(null)} /> : null}
      {daily ? <ChallengeSheet visible={sheet === 'challenge'} daily={daily} onClose={() => setSheet(null)} /> : null}
    </View>
  );
}

function NewChip({ index, label, face, foil, stamp, reducedMotion }: { index: number; label: string; face: CardFace | null; foil: boolean; stamp: boolean; reducedMotion: boolean }) {
  // Card flip in, 180ms apart, with the twinkle (design 5.6).
  const r = useSharedValue(reducedMotion ? 1 : 0);
  useEffect(() => {
    if (reducedMotion) return;
    const t = setTimeout(() => {
      GameAudio.playLadder('mm_sharp_twinkle', Math.min(7, 3 + index), { volume: 0.6 });
      Haptic.tickSelection();
    }, 700 + index * 180);
    r.value = withDelay(700 + index * 180, withTiming(1, { duration: 320, easing: Easing.out(Easing.back(1.4)) }));
    return () => clearTimeout(t);
  }, [index, r, reducedMotion]);
  const back = useAnimatedStyle(() => ({ opacity: r.value < 0.5 ? 1 : 0, transform: [{ perspective: 600 }, { rotateY: `${r.value * 180}deg` }] }));
  const front = useAnimatedStyle(() => ({ opacity: r.value >= 0.5 ? 1 : 0, transform: [{ perspective: 600 }, { rotateY: `${r.value * 180 - 180}deg` }] }));
  return (
    <View style={styles.newChip}>
      <View style={{ width: 40, height: 50 }}>
        <Animated.Image source={CARD_BACK} style={[styles.chipCard, back]} resizeMode="cover" />
        <Animated.View style={[styles.chipCard, front]}>
          {stamp ? <Image source={STAMP} style={{ width: 40, height: 40, marginTop: 5 }} resizeMode="contain" />
            : face ? <FaceThumb face={face} w={40} h={50} foil={foil} /> : null}
        </Animated.View>
      </View>
      <Text style={[styles.newLabel, foil && { color: MM.goldDeep }]}>{label}</Text>
    </View>
  );
}

function SmallBtn({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={() => { Haptic.tapLight(); onPress(); }} style={({ pressed }) => [styles.smallBtn, pressed && { transform: [{ scale: 0.96 }] }]}
      accessibilityRole="button" accessibilityLabel={label.toLowerCase()} hitSlop={6}>
      <Text style={styles.smallBtnText}>{label}</Text>
    </Pressable>
  );
}

// -----------------------------------------------------------------------------
// Share grid
// -----------------------------------------------------------------------------

const CELL_STYLE: Record<ShareCell, { bg: string; glyph: 'check' | 'star' | 'mag' | 'crack' | 'gull' }> = {
  recall: { bg: MM.gold, glyph: 'check' },
  lucky: { bg: '#ffffff', glyph: 'star' },
  scout: { bg: MM.scout, glyph: 'mag' },
  slip: { bg: MM.coral, glyph: 'crack' },
  gull: { bg: '#bfe5ff', glyph: 'gull' },
};

function Glyph({ kind, size }: { kind: 'check' | 'star' | 'mag' | 'crack' | 'gull'; size: number }) {
  const s = size;
  const ink = '#ffffff';
  if (kind === 'check') {
    return (
      <View style={{ width: s * 0.55, height: s * 0.3, borderLeftWidth: 3, borderBottomWidth: 3, borderColor: MM.navyText, transform: [{ rotateZ: '-45deg' }, { translateY: -s * 0.05 }] }} />
    );
  }
  if (kind === 'star') {
    return (
      <Svg width={s * 0.7} height={s * 0.7} viewBox="0 0 24 24">
        <Path d="M12 2l2.9 6.3 6.9.7-5.2 4.6 1.5 6.8L12 17l-6.1 3.4 1.5-6.8L2.2 9l6.9-.7z" fill={MM.gold} stroke={MM.ink} strokeWidth={1.8} strokeLinejoin="round" />
      </Svg>
    );
  }
  if (kind === 'mag') {
    return (
      <View style={{ width: s * 0.6, height: s * 0.6 }}>
        <View style={{ position: 'absolute', left: 0, top: 0, width: s * 0.42, height: s * 0.42, borderRadius: s, borderWidth: 2.5, borderColor: ink }} />
        <View style={{ position: 'absolute', left: s * 0.36, top: s * 0.36, width: s * 0.24, height: 3, backgroundColor: ink, transform: [{ rotateZ: '45deg' }] }} />
      </View>
    );
  }
  if (kind === 'crack') {
    return (
      <Svg width={s * 0.7} height={s * 0.7} viewBox="0 0 24 24">
        <Path d="M13 2 L9 9 L14 12 L8 22" fill="none" stroke="#ffffff" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    );
  }
  return <View style={{ width: s * 0.4, height: s * 0.22, borderTopLeftRadius: s, borderTopRightRadius: s, borderWidth: 2.5, borderBottomWidth: 0, borderColor: MM.ink }} />;
}

export function ShareCard({ daily }: { daily: DailySummary }) {
  const deck = deckById(daily.deckId) ?? DECKS[0];
  const rows = shareRows(daily.verdicts, 8);
  const par = parFor(daily.pairs);
  return (
    <View style={styles.shareCard} collapsable={false}>
      <View style={styles.shareHead}>
        <View style={styles.shareFaces}>
          {[0, 1, 2].map((f) => <View key={f} style={{ marginLeft: f ? -10 : 0, transform: [{ rotateZ: `${(f - 1) * 8}deg` }] }}><FaceThumb face={faceFor(deck, f)} w={34} h={42} /></View>)}
        </View>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={styles.shareTitle}>Memory Match Daily</Text>
          <Text style={styles.shareSub}>{`${deck.label} · ${daily.day}`}</Text>
        </View>
      </View>
      <View style={styles.gridWrap}>
        {rows.map((row, i) => (
          <View key={i} style={styles.gridRow}>
            {row.map((c, j) => (
              <View key={j} style={[styles.cell, { backgroundColor: CELL_STYLE[c].bg }]}>
                <Glyph kind={CELL_STYLE[c].glyph} size={24} />
              </View>
            ))}
          </View>
        ))}
      </View>
      <View style={styles.shareFoot}>
        <Text style={styles.shareStat}>{daily.cleared ? `${daily.turns} TURNS · PAR ${par}` : `OUT AT ${daily.turns} TURNS`}</Text>
        <View style={styles.shareStars}>
          {[0, 1, 2].map((i) => <Image key={i} source={CROWN} style={[styles.shareCrown, i >= daily.stars && { opacity: 0.25 }]} resizeMode="contain" />)}
        </View>
        {daily.streak > 0 ? (
          <View style={styles.shareStreak}>
            <Image source={STREAK} style={{ width: 18, height: 18 }} resizeMode="contain" />
            <Text style={styles.shareStat}>{`${daily.streak}`}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function ShareSheet({ visible, daily, onClose }: { visible: boolean; daily: DailySummary; onClose: () => void }) {
  const ref = useRef<View>(null);
  const [busy, setBusy] = useState(false);
  const share = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const uri = await captureRef(ref, { format: 'png', quality: 1, result: 'tmpfile' });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share your Daily' });
    } catch {
      // The share sheet was dismissed or view-shot failed: nothing is sent.
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => undefined}>
          <Text style={styles.sheetTitle}>Share your Daily</Text>
          <View ref={ref} collapsable={false} style={{ backgroundColor: '#ffffff', borderRadius: 18 }}>
            <ShareCard daily={daily} />
          </View>
          <Text style={styles.sheetHint}>Only your verdicts go in the picture, never the board.</Text>
          <Pressable style={styles.bigBtn} onPress={share} accessibilityRole="button">
            {busy ? <ActivityIndicator color={MM.navyText} /> : <Text style={styles.bigBtnText}>SHARE</Text>}
          </Pressable>
          <Pressable onPress={onClose} hitSlop={10}><Text style={styles.sheetClose}>Close</Text></Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// -----------------------------------------------------------------------------
// Album
// -----------------------------------------------------------------------------

export function AlbumSheet({ visible, album, focusDeck, onClose }: { visible: boolean; album: Album; focusDeck?: string; onClose: () => void }) {
  const [deckId, setDeckId] = useState(focusDeck ?? DECKS[0].id);
  useEffect(() => { if (visible && focusDeck) setDeckId(focusDeck); }, [visible, focusDeck]);
  const deck: Deck = deckById(deckId) ?? DECKS[0];
  const page = album.decks[deck.id];
  const size = deck.symbols.length;
  const stamps = useMemo(() => Object.entries(album.stamps), [album.stamps]);
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.scrim}>
        <View style={[styles.sheet, styles.albumSheet]}>
          <Text style={styles.sheetTitle}>Card Album</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={styles.tabs}>
            {DECKS.map((d) => {
              const on = d.id === deck.id;
              const c = collected(album.decks[d.id], d.symbols.length);
              return (
                <Pressable key={d.id} onPress={() => setDeckId(d.id)} style={[styles.tab, on && styles.tabOn]} accessibilityRole="tab" accessibilityState={{ selected: on }}>
                  <Text style={[styles.tabText, on && styles.tabTextOn]}>{d.label}</Text>
                  <Text style={[styles.tabCount, on && styles.tabTextOn]}>{`${c}/${d.symbols.length}`}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
          <Text style={styles.pageMeta}>{`${collected(page, size)}/${size} collected · ${foils(page, size)} foil${page?.perfect ? ' · PERFECT' : ''}`}</Text>
          <View style={styles.albumGrid}>
            {deck.symbols.map((_, i) => {
              const f = page?.faces[String(i)];
              const have = (f?.m ?? 0) > 0;
              return (
                <View key={i} style={[styles.albumSlot, page?.perfect && have && styles.albumPerfect]}>
                  {have ? <FaceThumb face={faceFor(deck, i)} w={56} h={70} foil={isFoil(f)} radius={7} />
                    : <Image source={CARD_BACK} style={{ width: 56, height: 70, borderRadius: 7, opacity: 0.35 }} resizeMode="cover" />}
                  <View style={styles.foilBar}>
                    <View style={[styles.foilFill, { width: `${Math.min(1, (f?.r ?? 0) / FOIL_AT) * 100}%` }]} />
                  </View>
                </View>
              );
            })}
          </View>
          <Text style={styles.sectionTitle}>Ride stamps</Text>
          {stamps.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 10, paddingHorizontal: 2 }}>
              {stamps.map(([k, s]) => (
                <View key={k} style={styles.stamp}>
                  <Image source={STAMP} style={{ width: 44, height: 44 }} resizeMode="contain" />
                  <Text style={styles.stampText} numberOfLines={1}>{s.label}</Text>
                  <Text style={styles.stampDay}>{s.day}</Text>
                </View>
              ))}
            </ScrollView>
          ) : <Text style={styles.sheetHint}>Clear a ride's Daily Deck at or under par to stamp its page.</Text>}
          <Pressable style={styles.bigBtn} onPress={onClose} accessibilityRole="button"><Text style={styles.bigBtnText}>DONE</Text></Pressable>
        </View>
      </View>
    </Modal>
  );
}

// -----------------------------------------------------------------------------
// Challenge (friend picker; SEND is the only post)
// -----------------------------------------------------------------------------

function ChallengeSheet({ visible, daily, onClose }: { visible: boolean; daily: DailySummary; onClose: () => void }) {
  const [friends, setFriends] = useState<PlayerType[] | null>(null);
  const [picked, setPicked] = useState<number[]>([]);
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'unavailable'>('idle');
  useEffect(() => {
    if (!visible || friends) return;
    let live = true;
    getFriends(1, 30).then((f) => { if (live) setFriends(f ?? []); }).catch(() => { if (live) setFriends([]); });
    return () => { live = false; };
  }, [visible, friends]);
  const toggle = (id: number) => setPicked((p) => (p.indexOf(id) >= 0 ? p.filter((x) => x !== id) : [...p, id].slice(0, 10)));
  const send = async () => {
    if (!picked.length || state === 'sending') return;
    setState('sending');
    try {
      await apiClient.post('/memory/challenges', { friend_ids: picked, date: daily.day });
      setState('sent');
      Haptic.success();
    } catch {
      setState('unavailable');
    }
  };
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.scrim}>
        <View style={[styles.sheet, { maxHeight: '75%' }]}>
          <Text style={styles.sheetTitle}>Challenge friends</Text>
          <Text style={styles.sheetHint}>{`They play today's Daily with your ghost. ${daily.cleared ? `You cleared in ${daily.turns} turns.` : ''}`}</Text>
          {friends == null ? <ActivityIndicator color={MM.ink} style={{ marginVertical: 20 }} /> : friends.length === 0 ? (
            <Text style={styles.sheetHint}>Add friends to send them challenges.</Text>
          ) : (
            <ScrollView style={{ maxHeight: 280, alignSelf: 'stretch' }}>
              {friends.map((f) => {
                const on = picked.indexOf(f.id) >= 0;
                return (
                  <Pressable key={f.id} onPress={() => toggle(f.id)} style={[styles.friend, on && styles.friendOn]} accessibilityRole="checkbox" accessibilityState={{ checked: on }}>
                    <Text style={styles.friendName} numberOfLines={1}>{f.username}</Text>
                    <View style={[styles.check, on && styles.checkOn]} />
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
          {state === 'sent' ? <Text style={styles.sentText}>Sent</Text> : state === 'unavailable' ? <Text style={styles.sheetHint}>Challenges are not open yet. Nothing was sent.</Text> : null}
          <Pressable style={[styles.bigBtn, (!picked.length || state === 'sent') && { opacity: 0.5 }]} onPress={send} disabled={!picked.length || state === 'sent'} accessibilityRole="button">
            {state === 'sending' ? <ActivityIndicator color={MM.navyText} /> : <Text style={styles.bigBtnText}>{picked.length ? `SEND (${picked.length})` : 'SEND'}</Text>}
          </Pressable>
          <Pressable onPress={onClose} hitSlop={10}><Text style={styles.sheetClose}>Close</Text></Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  thumb: { overflow: 'hidden', borderWidth: 1.5, borderColor: '#ffffff', backgroundColor: '#dfe9f5' },
  thumbFoil: { borderColor: MM.gold, borderWidth: 2 },
  thumbDim: { opacity: 0.4 },
  extras: { marginTop: 10, alignItems: 'center' },
  chipRow: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginBottom: 8 },
  newChip: { alignItems: 'center', width: 64 },
  chipCard: { position: 'absolute', left: 0, top: 0, width: 40, height: 50, borderRadius: 6, overflow: 'hidden', backfaceVisibility: 'hidden' },
  newLabel: { fontFamily: 'Knockout', fontSize: 11, color: '#ffffff', marginTop: 3, letterSpacing: 0.5 },
  foilDone: { fontFamily: 'Knockout', fontSize: 13, color: MM.gold, marginBottom: 6 },
  btnRow: { flexDirection: 'row', gap: 8, justifyContent: 'center' },
  smallBtn: { backgroundColor: '#ffffff', borderRadius: 14, borderWidth: 3, borderColor: MM.ink, paddingHorizontal: 14, paddingVertical: 8, minHeight: 44, justifyContent: 'center' },
  smallBtnText: { fontFamily: 'Shark', fontSize: 16, color: MM.navyText },
  scrim: { flex: 1, backgroundColor: 'rgba(7,80,131,0.35)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  sheet: { width: '100%', maxWidth: 420, backgroundColor: MM.cream, borderRadius: 24, borderWidth: 3, borderColor: MM.ink, padding: 16, alignItems: 'center' },
  albumSheet: { maxHeight: '88%' },
  sheetTitle: { fontFamily: 'Shark', fontSize: 28, color: MM.navyText, marginBottom: 8 },
  sheetHint: { fontFamily: 'Knockout', fontSize: 14, color: MM.ink, textAlign: 'center', marginVertical: 8 },
  sheetClose: { fontFamily: 'Knockout', fontSize: 15, color: MM.ink, marginTop: 10, textDecorationLine: 'underline' },
  bigBtn: { alignSelf: 'stretch', backgroundColor: MM.gold, borderRadius: 16, paddingVertical: 13, alignItems: 'center', borderBottomWidth: 4, borderBottomColor: MM.goldDeep, marginTop: 10, minHeight: 52 },
  bigBtnText: { fontFamily: 'Shark', fontSize: 22, color: '#075083' },
  shareCard: { width: 300, backgroundColor: '#ffffff', borderRadius: 18, borderWidth: 3, borderColor: MM.ink, padding: 12 },
  shareHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  shareFaces: { flexDirection: 'row' },
  shareTitle: { fontFamily: 'Shark', fontSize: 20, color: MM.navyText },
  shareSub: { fontFamily: 'Knockout', fontSize: 13, color: MM.ink },
  gridWrap: { alignItems: 'center', gap: 5 },
  gridRow: { flexDirection: 'row', gap: 5, alignSelf: 'flex-start' },
  cell: { width: 29, height: 29, borderRadius: 7, borderWidth: 2, borderColor: MM.ink, alignItems: 'center', justifyContent: 'center' },
  shareFoot: { flexDirection: 'row', alignItems: 'center', marginTop: 10, justifyContent: 'space-between' },
  shareStat: { fontFamily: 'Knockout', fontSize: 14, color: MM.navyText },
  shareStars: { flexDirection: 'row', gap: 2 },
  shareCrown: { width: 22, height: 20 },
  shareStreak: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  tabs: { gap: 6, paddingVertical: 4 },
  tab: { backgroundColor: '#ffffff', borderRadius: 12, borderWidth: 2, borderColor: MM.ink, paddingHorizontal: 10, paddingVertical: 6, alignItems: 'center' },
  tabOn: { backgroundColor: MM.blue },
  tabText: { fontFamily: 'Knockout', fontSize: 13, color: MM.navyText },
  tabTextOn: { color: '#ffffff' },
  tabCount: { fontFamily: 'Shark', fontSize: 12, color: MM.ink },
  pageMeta: { fontFamily: 'Knockout', fontSize: 14, color: MM.navyText, marginVertical: 8 },
  albumGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10 },
  albumSlot: { alignItems: 'center', padding: 3, borderRadius: 9 },
  albumPerfect: { backgroundColor: 'rgba(254,201,14,0.35)' },
  foilBar: { width: 50, height: 5, borderRadius: 3, backgroundColor: 'rgba(11,92,173,0.18)', marginTop: 4, overflow: 'hidden' },
  foilFill: { height: 5, backgroundColor: MM.gold },
  sectionTitle: { fontFamily: 'Shark', fontSize: 18, color: MM.navyText, marginTop: 12, marginBottom: 4 },
  stamp: { alignItems: 'center', width: 84, backgroundColor: '#ffffff', borderRadius: 12, borderWidth: 2, borderColor: MM.gold, padding: 6 },
  stampText: { fontFamily: 'Knockout', fontSize: 11, color: MM.navyText },
  stampDay: { fontFamily: 'Knockout', fontSize: 10, color: MM.ink },
  friend: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#ffffff', borderRadius: 12, borderWidth: 2, borderColor: '#cfe3f7', paddingHorizontal: 12, paddingVertical: 10, marginVertical: 3, minHeight: 48 },
  friendOn: { borderColor: MM.gold },
  friendName: { fontFamily: 'Knockout', fontSize: 16, color: MM.navyText, flex: 1 },
  check: { width: 24, height: 24, borderRadius: 12, borderWidth: 2.5, borderColor: MM.ink },
  checkOn: { backgroundColor: MM.gold, borderColor: MM.goldDeep },
  sentText: { fontFamily: 'Shark', fontSize: 18, color: MM.goldDeep, marginTop: 6 },
});
