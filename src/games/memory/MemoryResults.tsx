/**
 * MemoryResults.tsx: one results surface, sequenced on 8ths (design v8 6.10).
 *
 * One card, always, on a 70% white scrim; nothing behind it shows through and
 * no modal ever opens on top of another. Its parts reveal 232ms apart (129 BPM
 * 8ths):
 *   1 banner    the pipeline gold ribbon with the title in Shark lettering, a
 *               1-frame white impact and a dust puff
 *   2 headline  RECALL % on a gold plate (Ride Sprint: the coin edition medallion)
 *   3 crowns    slam 1.8 -> 1.0 one per 8th; the third hangs 232ms first
 *   4 numbers   Time Attack tally (operands jiggle, digit shake), Ride Sprint
 *               turns, charged time, PB, cash-out and the honest luck chip
 *   5 grades    Memory, Speed, Chain stamp in 116ms apart, then one tip
 *   6 rewards   NEW CARD / NEW FOIL / NEW STAMP / UPGRADED flips
 *   7 actions   PLAY AGAIN (or TRY AGAIN) big and gold, ALBUM / SHARE /
 *               CHALLENGE icon buttons, Close as text
 * SHARE flips this same card over in place to the share grid; ALBUM and
 * CHALLENGE replace the action row with an inline panel (DONE returns).
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { GameAudio, Haptic } from '../../gamekit';
import GameIcon from '../../ui/GameIcon';
import type { CoinEdition, Grade } from './engine';
import { deckById } from './decks';
import { faceFor } from './faces';
import { AlbumBody, ChallengeBody, NewChip, ShareBack, type DailySummary, type RunRewards } from './MemoryExtras';
import { MM } from './theme';

const BANNER = require('../../assets/games/memory/v8/results_banner.png');
const CROWN = require('../../assets/games/memory/studio/crown.png');
const COIN = require('../../assets/games/memory/studio/coin_alex.png');
const DUST = require('../../assets/games/memory/v8/fx/cloud_puff_2.png');

export const EIGHTH_MS = 232;

export interface ResultsNumber {
  label: string;
  value: string;
  hot?: boolean;
}

export interface MemoryResultsData {
  mode: 'warmup' | 'ride' | 'timeAttack' | 'daily' | 'race' | 'lineDuel';
  banner: string;
  won: boolean;
  recallPct: number;
  /** Replaces the RECALL % plate (duels show points). */
  headline?: { label: string; value: string };
  edition: CoinEdition | null;
  upgraded: boolean;
  stars: number;
  numbers: ResultsNumber[];
  /** Time Attack Balatro tally. */
  tally: { parts: string; total: number } | null;
  chip: string | null;
  grades: { memory: Grade; speed: Grade; chain: Grade } | null;
  tip: string | null;
  newBest: boolean;
  rewards: RunRewards | null;
  daily: DailySummary | null;
  /** Extra reward lines (UPGRADED, ON-SITE, GOLD EDITION). */
  extraRewards: string[];
  againLabel: 'PLAY AGAIN' | 'TRY AGAIN' | null;
}

export type ResultsPanel = 'actions' | 'album' | 'challenge' | 'stats';

/**
 * Which overlays are mounted for a results state. The single-overlay invariant
 * (tested): at most one of {share back, album panel, challenge panel}.
 */
export function mountedOverlays(panel: ResultsPanel, flipped: boolean): string[] {
  if (flipped) return ['share'];
  if (panel === 'album') return ['album'];
  if (panel === 'challenge') return ['challenge'];
  if (panel === 'stats') return ['stats'];
  return [];
}

/** Reveal schedule (ms after the card lands), every step on the 232ms grid. */
export function revealSchedule(stars: number): { banner: number; headline: number; crowns: number[]; numbers: number; grades: number; rewards: number; actions: number } {
  const crowns: number[] = [];
  for (let i = 0; i < stars; i++) crowns.push(EIGHTH_MS * (2 + i) + (i === 2 ? EIGHTH_MS : 0));
  const afterCrowns = EIGHTH_MS * (2 + Math.max(0, stars) + (stars >= 3 ? 1 : 0));
  return {
    banner: 0,
    headline: EIGHTH_MS,
    crowns,
    numbers: afterCrowns,
    grades: afterCrowns + EIGHTH_MS,
    rewards: afterCrowns + EIGHTH_MS * 3,
    actions: afterCrowns + EIGHTH_MS * 4,
  };
}

export function MemoryResults({ data, claim, again, reducedMotion }: {
  data: MemoryResultsData;
  claim: () => void;
  again?: () => void;
  reducedMotion: boolean;
}) {
  const win = useWindowDimensions();
  const sched = useMemo(() => revealSchedule(data.stars), [data.stars]);
  // Step 1 (the ribbon) from the first frame: never an empty card.
  const [step, setStep] = useState(reducedMotion ? 99 : 1);
  const rise = useSharedValue(reducedMotion ? 1 : 0);
  useEffect(() => {
    if (!reducedMotion) rise.value = withSpring(1, { damping: 11, stiffness: 210 });
  }, [reducedMotion, rise]);
  const riseSt = useAnimatedStyle(() => ({ transform: [{ translateY: (1 - rise.value) * 60 }, { scale: 0.92 + rise.value * 0.08 }] }));
  const [panel, setPanel] = useState<ResultsPanel>('actions');
  const [flipped, setFlipped] = useState(false);
  const flip = useSharedValue(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    if (reducedMotion) return undefined;
    const at = (ms: number, fn: () => void) => timers.current.push(setTimeout(fn, ms));
    const marks = [sched.banner, sched.headline, sched.numbers, sched.grades, sched.rewards, sched.actions];
    marks.forEach((ms, i) => at(ms, () => setStep((s) => Math.max(s, i + 1))));
    at(sched.banner, () => { Haptic.hitMedium(); GameAudio.play('fx.hit', { volume: 0.5 }); });
    sched.crowns.forEach((ms, i) => at(ms + 140, () => {
      Haptic.hitRigid();
      GameAudio.playLadder('mm_sharp_twinkle', 4 + i, { volume: 0.8 });
    }));
    return () => timers.current.forEach(clearTimeout);
  }, [sched, reducedMotion]);

  const doFlip = (on: boolean) => {
    setFlipped(on);
    flip.value = withTiming(on ? 1 : 0, { duration: reducedMotion ? 1 : 320, easing: Easing.inOut(Easing.cubic) });
  };
  const frontSt = useAnimatedStyle(() => ({ opacity: flip.value < 0.5 ? 1 : 0, transform: [{ perspective: 900 }, { rotateY: `${flip.value * 180}deg` }] }));
  const backSt = useAnimatedStyle(() => ({ opacity: flip.value >= 0.5 ? 1 : 0, transform: [{ perspective: 900 }, { rotateY: `${flip.value * 180 - 180}deg` }] }));

  const canAlbum = !!data.rewards;
  const canStats = data.numbers.length > 0 || !!data.grades;
  const canShare = !!data.daily;
  const canChallenge = !!data.daily?.ranked;

  return (
    <View style={[styles.wrap, { width: win.width, height: win.height }]} pointerEvents="box-none">
      <View style={styles.scrim} />
      {/* Tall phones: the card sits lower so the barker's celebration stays in view above it. */}
      <Animated.View style={[styles.card, { maxHeight: win.height * 0.8, marginTop: win.height > 800 ? 90 : 0 }, riseSt, frontSt]} pointerEvents={flipped ? 'none' : 'auto'}>
        <ScrollView contentContainerStyle={styles.cardInner} showsVerticalScrollIndicator={false} bounces={false}>
          {/* Every section is laid out from frame 0 and revealed in place on its
              beat, so the card never grows or re-centers while a kid reads it.
              Front: banner, one big number, crowns, new cards, one button.
              The stat chips and grades live behind STATS. */}
          <Banner text={data.banner} show={step >= 1} reducedMotion={reducedMotion} />
          <Headline data={data} reducedMotion={reducedMotion} startMs={reducedMotion ? 0 : sched.headline} />
          <View style={styles.crownRow}>
            {[0, 1, 2].map((i) => (
              <Crown key={i} on={i < data.stars} delay={reducedMotion ? 0 : (sched.crowns[i] ?? 0)} hang={i === 2} reducedMotion={reducedMotion} />
            ))}
          </View>
          {data.newBest ? <Reveal show={step >= 3}><Text style={styles.newBest}>NEW BEST</Text></Reveal> : null}
          {data.tally ? <Reveal show={step >= 3}>{step >= 3 ? <Numbers data={data} reducedMotion={reducedMotion} tallyOnly /> : <Numbers data={data} reducedMotion tallyOnly />}</Reveal> : null}
          <Reveal show={step >= 5}><Rewards data={data} reducedMotion={reducedMotion} startMs={reducedMotion ? 0 : sched.rewards} /></Reveal>
          <Reveal show={step >= 6}>{(
            panel === 'actions' ? (
              <View style={styles.actions}>
                {again && data.againLabel ? (
                  <Pressable onPress={() => { Haptic.tapLight(); again(); }} style={({ pressed }) => [styles.bigBtn, pressed && styles.pressed]} accessibilityRole="button">
                    <Text style={styles.bigBtnText}>{data.againLabel}</Text>
                  </Pressable>
                ) : (
                  <Pressable onPress={() => { Haptic.tapLight(); claim(); }} style={({ pressed }) => [styles.bigBtn, pressed && styles.pressed]} accessibilityRole="button">
                    <Text style={styles.bigBtnText}>{data.won ? 'CONTINUE' : 'CLOSE'}</Text>
                  </Pressable>
                )}
                {canStats || canAlbum || canShare || canChallenge ? (
                  <View style={styles.iconRow}>
                    {canStats ? <IconBtn icon="star" label="STATS" onPress={() => setPanel('stats')} /> : null}
                    {canAlbum ? <IconBtn icon="chest" label="ALBUM" onPress={() => setPanel('album')} /> : null}
                    {canShare ? <IconBtn icon="camera" label="SHARE" onPress={() => doFlip(true)} /> : null}
                    {canChallenge ? <IconBtn icon="swords" label="CHALLENGE" onPress={() => setPanel('challenge')} /> : null}
                  </View>
                ) : null}
                {again && data.againLabel ? (
                  <Pressable onPress={claim} hitSlop={10} accessibilityRole="button"><Text style={styles.closeText}>{data.won ? 'Continue' : 'Close'}</Text></Pressable>
                ) : null}
              </View>
            ) : panel === 'album' && data.rewards ? (
              <View style={styles.panel}>
                <AlbumBody album={data.rewards.album} focusDeck={data.rewards.deckId} compact />
                <Pressable style={styles.bigBtn} onPress={() => setPanel('actions')} accessibilityRole="button"><Text style={styles.bigBtnText}>DONE</Text></Pressable>
              </View>
            ) : panel === 'challenge' && data.daily ? (
              <View style={styles.panel}>
                <ChallengeBody daily={data.daily} onDone={() => setPanel('actions')} />
              </View>
            ) : panel === 'stats' ? (
              <View style={styles.panel}>
                <Numbers data={data} reducedMotion={reducedMotion} statsOnly />
                {data.grades ? <Grades g={data.grades} tip={data.tip} reducedMotion={reducedMotion} /> : null}
                <Pressable style={[styles.bigBtn, { marginTop: 10 }]} onPress={() => setPanel('actions')} accessibilityRole="button"><Text style={styles.bigBtnText}>DONE</Text></Pressable>
              </View>
            ) : null
          )}</Reveal>
        </ScrollView>
        {/* PERFECT: coins burst from the medal, above the ribbon and card. */}
        {data.banner === 'PERFECT!' && !reducedMotion ? <CoinBurst fire /> : null}
      </Animated.View>
      {data.daily ? (
        <Animated.View style={[styles.card, styles.cardBack, { maxHeight: win.height * 0.84 }, backSt]} pointerEvents={flipped ? 'auto' : 'none'}>
          {flipped ? <ShareBack daily={data.daily} onBack={() => doFlip(false)} /> : null}
        </Animated.View>
      ) : null}
    </View>
  );
}

/** Fades a section in on its beat. It is always laid out, so nothing reflows. */
function Reveal({ show, children }: { show: boolean; children: React.ReactNode }) {
  const o = useSharedValue(show ? 1 : 0);
  useEffect(() => { o.value = withTiming(show ? 1 : 0, { duration: 160 }); }, [show, o]);
  const st = useAnimatedStyle(() => ({ opacity: o.value, transform: [{ translateY: (1 - o.value) * 6 }] }));
  return <Animated.View style={[styles.reveal, st]} pointerEvents={show ? 'box-none' : 'none'}>{children}</Animated.View>;
}

/** PERFECT: one capped burst of gold coins behind the ribbon (UI thread). */
export const PERFECT_COINS = 10;
function CoinBurst({ fire }: { fire: boolean }) {
  const t = useSharedValue(0);
  useEffect(() => {
    if (!fire) return;
    t.value = withDelay(180, withTiming(1, { duration: 1000, easing: Easing.out(Easing.quad) }));
    const h = setTimeout(() => Haptic.comboHeavy(), 180);
    return () => clearTimeout(h);
  }, [fire, t]);
  return <View pointerEvents="none" style={styles.burst}>{Array.from({ length: PERFECT_COINS }, (_, k) => <BurstCoin key={k} k={k} t={t} />)}</View>;
}
function BurstCoin({ k, t }: { k: number; t: import('react-native-reanimated').SharedValue<number> }) {
  const a = (k / PERFECT_COINS) * Math.PI * 2 + (k % 2) * 0.2;
  const r = 90 + (k % 3) * 15;
  const st = useAnimatedStyle(() => ({
    opacity: t.value > 0 && t.value < 1 ? 1 - t.value * t.value * t.value : 0,
    // Out on an arc, then a little gravity.
    transform: [{ translateX: Math.cos(a) * r * t.value }, { translateY: Math.sin(a) * r * 0.75 * t.value - Math.sin(Math.PI * t.value) * 30 + t.value * t.value * 70 },
      { rotateZ: `${t.value * 360 * (k % 2 ? 1 : -1)}deg` }, { scale: 0.6 + (1 - t.value) * 0.5 }],
  }));
  return <Animated.Image source={COIN} style={[styles.burstCoin, st]} resizeMode="contain" />;
}

function Banner({ text, show, reducedMotion }: { text: string; show: boolean; reducedMotion: boolean }) {
  const drop = useSharedValue(reducedMotion ? 1 : 0);
  const impact = useSharedValue(0);
  useEffect(() => {
    if (!show || reducedMotion) return;
    drop.value = withSequence(withTiming(1.08, { duration: 140, easing: Easing.in(Easing.quad) }), withTiming(1, { duration: 80 }));
    impact.value = withDelay(140, withSequence(withTiming(1, { duration: 1 }), withTiming(1, { duration: 16 }), withTiming(0, { duration: 120 })));
  }, [show, reducedMotion, drop, impact]);
  const st = useAnimatedStyle(() => ({ opacity: drop.value > 0 ? 1 : 0, transform: [{ translateY: (1 - Math.min(1, drop.value)) * -40 }, { scale: drop.value || 1 }] }));
  const flash = useAnimatedStyle(() => ({ opacity: impact.value }));
  const dust = useAnimatedStyle(() => ({ opacity: impact.value * 0.9, transform: [{ scale: 1 + (1 - impact.value) * 0.4 }] }));
  return (
    <Animated.View style={[styles.banner, st]}>
      <Animated.Image source={DUST} style={[styles.dust, dust]} resizeMode="contain" />
      <Image source={BANNER} style={styles.bannerImg} resizeMode="stretch" />
      <Animated.View style={[styles.bannerFlash, flash]} />
      <Text style={styles.bannerText} numberOfLines={1} adjustsFontSizeToFit>{text}</Text>
    </Animated.View>
  );
}

const EDITION_TINT: Record<string, string> = { bronze: '#C87533', silver: '#DCE9F5', gold: '#FFD23F' };

function Headline({ data, reducedMotion, startMs = 0 }: { data: MemoryResultsData; reducedMotion: boolean; startMs?: number }) {
  const pop = useSharedValue(reducedMotion ? 1 : 0);
  const spin = useSharedValue(reducedMotion ? 0 : 1);
  // One big number that counts up with a coin-tick ladder (Royal Match style).
  const target = data.headline ? null : data.recallPct;
  const [shown, setShown] = useState(reducedMotion || target == null ? target : 0);
  useEffect(() => {
    if (reducedMotion) return undefined;
    pop.value = withDelay(startMs, withSequence(withTiming(1.15, { duration: 120 }), withTiming(1, { duration: 100 })));
    spin.value = withDelay(startMs, withTiming(0, { duration: 420, easing: Easing.out(Easing.back(1.4)) }));
    if (target == null) return undefined;
    const steps = 10;
    const timers = Array.from({ length: steps }, (_, i) => setTimeout(() => {
      setShown(Math.round((target * (i + 1)) / steps));
      if (i % 2 === 1) GameAudio.playLadder('coin_tick', Math.min(12, 2 + i), { volume: 0.35 });
    }, startMs + 60 + i * 45));
    return () => timers.forEach(clearTimeout);
    // Once per card.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const st = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
  const coinSt = useAnimatedStyle(() => ({ transform: [{ perspective: 600 }, { rotateY: `${spin.value * 540}deg` }] }));
  const ed = data.edition && data.edition !== 'none' ? data.edition : null;
  return (
    <Animated.View style={[styles.headline, st]}>
      {ed ? (
        <Animated.View style={[styles.medal, coinSt]}>
          <Image source={COIN} style={{ width: 54, height: 50 }} resizeMode="contain" />
          <View style={[styles.medalTint, { backgroundColor: EDITION_TINT[ed] }]} />
          <View style={[styles.medalBand, { top: 14, backgroundColor: ed === 'bronze' ? 'rgba(255,190,140,0.55)' : ed === 'silver' ? 'rgba(190,220,255,0.6)' : 'rgba(255,250,200,0.6)' }]} />
          <View style={[styles.medalBand, { top: 28, backgroundColor: ed === 'bronze' ? 'rgba(150,80,30,0.35)' : ed === 'silver' ? 'rgba(255,255,255,0.55)' : 'rgba(255,200,40,0.45)' }]} />
        </Animated.View>
      ) : null}
      <View style={styles.recallPlate}>
        <Text style={styles.recallLabel}>{data.headline?.label ?? 'MEMORY'}</Text>
        <Text style={styles.recallValue}>{data.headline?.value ?? `${shown ?? data.recallPct}%`}</Text>
      </View>
      {/* The medal's color says the edition; no "EDITION" jargon for kids. */}
      {ed && data.upgraded ? <Text style={styles.editionText}>COIN UPGRADED!</Text> : null}
    </Animated.View>
  );
}

function Crown({ on, delay, hang, reducedMotion }: { on: boolean; delay: number; hang: boolean; reducedMotion: boolean }) {
  const v = useSharedValue(reducedMotion ? 1 : 0);
  useEffect(() => {
    if (!on || reducedMotion) return;
    // The third crown rises and hangs 232ms before it slams.
    v.value = hang
      ? withDelay(delay - EIGHTH_MS, withSequence(withTiming(0.4, { duration: 120 }), withDelay(EIGHTH_MS - 120, withTiming(1, { duration: 140, easing: Easing.in(Easing.quad) }))))
      : withDelay(delay, withTiming(1, { duration: 140, easing: Easing.in(Easing.quad) }));
  }, [on, delay, hang, reducedMotion, v]);
  const st = useAnimatedStyle(() => {
    const k = v.value;
    const s = k < 1 ? 1.8 - 0.8 * k : 1;
    return { opacity: on ? Math.min(1, k * 2) : 1, transform: [{ scale: on ? s : 1 }, { translateY: k > 0.35 && k < 0.45 ? -10 : 0 }] };
  });
  return (
    <Animated.View style={[styles.crownWrap, st]}>
      <Image source={CROWN} style={[styles.crown, !on && styles.crownOff]} resizeMode="contain" />
    </Animated.View>
  );
}

function Numbers({ data, reducedMotion, tallyOnly = false, statsOnly = false }: { data: MemoryResultsData; reducedMotion: boolean; tallyOnly?: boolean; statsOnly?: boolean }) {
  const jig = useSharedValue(0);
  const total = useSharedValue(0);
  useEffect(() => {
    if (!data.tally || reducedMotion) { total.value = 1; return; }
    jig.value = withSequence(...Array.from({ length: 4 }, (_, i) => withTiming(i % 2 ? -1 : 1, { duration: 58 })), withTiming(0, { duration: 40 }));
    total.value = withDelay(260, withSequence(withTiming(1.25, { duration: 100 }), withTiming(1, { duration: 120 })));
  }, [data.tally, reducedMotion, jig, total]);
  const shake = data.tally ? Math.min(6, Math.floor(data.tally.total / 200)) : 0;
  const jigSt = useAnimatedStyle(() => ({ transform: [{ translateX: jig.value * 1.5 }, { rotateZ: `${jig.value * 2}deg` }] }));
  const totSt = useAnimatedStyle(() => ({ opacity: total.value > 0 ? 1 : 0, transform: [{ scale: total.value || 1 }, { translateX: total.value > 1.05 ? shake * 0.3 : 0 }] }));
  return (
    <View style={styles.numbers}>
      {data.tally && !statsOnly ? (
        <View style={styles.tally}>
          <Animated.Text style={[styles.tallyParts, jigSt]} numberOfLines={1} adjustsFontSizeToFit>{data.tally.parts}</Animated.Text>
          <Animated.Text style={[styles.tallyTotal, totSt]}>{data.tally.total.toLocaleString('en-US')}</Animated.Text>
        </View>
      ) : null}
      {tallyOnly ? null : <View style={styles.numRow}>
        {data.numbers.map((n) => (
          <View key={n.label} style={[styles.num, n.hot && styles.numHot]}>
            <Text style={styles.numLabel}>{n.label}</Text>
            <Text style={styles.numValue} numberOfLines={1} adjustsFontSizeToFit>{n.value}</Text>
          </View>
        ))}
      </View>}
      {data.chip && !tallyOnly ? <View style={styles.luckChip}><Text style={styles.luckText}>{data.chip}</Text></View> : null}
    </View>
  );
}

function Grades({ g, tip, reducedMotion }: { g: { memory: Grade; speed: Grade; chain: Grade }; tip: string | null; reducedMotion: boolean }) {
  const items: [string, Grade][] = [['MEMORY', g.memory], ['SPEED', g.speed], ['CHAIN', g.chain]];
  return (
    <View style={styles.grades}>
      <View style={styles.gradeRow}>
        {items.map(([label, grade], i) => <GradeStamp key={label} label={label} grade={grade} delay={i * 116} reducedMotion={reducedMotion} />)}
      </View>
      {tip ? <Text style={styles.tip}>{tip}</Text> : null}
    </View>
  );
}

function GradeStamp({ label, grade, delay, reducedMotion }: { label: string; grade: Grade; delay: number; reducedMotion: boolean }) {
  const v = useSharedValue(reducedMotion ? 1 : 0);
  useEffect(() => {
    if (reducedMotion) return;
    v.value = withDelay(delay, withSequence(withTiming(1.3, { duration: 90, easing: Easing.out(Easing.quad) }), withTiming(1, { duration: 80 })));
    const t = setTimeout(() => Haptic.tickSelection(), delay + 90);
    return () => clearTimeout(t);
  }, [delay, reducedMotion, v]);
  const st = useAnimatedStyle(() => ({ opacity: v.value > 0 ? 1 : 0, transform: [{ scale: v.value || 1 }, { rotateZ: '-6deg' }] }));
  const color = grade === 'S' ? MM.goldDeep : grade === 'A' ? MM.ink : grade === 'B' ? MM.scout : '#7a8da3';
  return (
    <View style={styles.grade}>
      <Animated.View style={[styles.gradeStamp, { borderColor: color }, st]}>
        <Text style={[styles.gradeLetter, { color }]}>{grade}</Text>
      </Animated.View>
      <Text style={styles.gradeLabel}>{label}</Text>
    </View>
  );
}

function Rewards({ data, reducedMotion, startMs = 0 }: { data: MemoryResultsData; reducedMotion: boolean; startMs?: number }) {
  const deck = data.rewards ? deckById(data.rewards.deckId) : null;
  const chips: { key: string; label: string; face?: number; stamp?: boolean }[] = [];
  if (data.rewards && deck) {
    data.rewards.newFoils.slice(0, 3).forEach((f) => chips.push({ key: `f${f}`, label: 'NEW FOIL', face: f }));
    data.rewards.newCards.slice(0, Math.max(0, 4 - chips.length)).forEach((f) => chips.push({ key: `c${f}`, label: 'NEW CARD', face: f }));
    if (data.rewards.newStamp) chips.unshift({ key: 'stamp', label: 'NEW STAMP', stamp: true });
  }
  if (!chips.length && !data.extraRewards.length) return null;
  return (
    <View style={styles.rewards}>
      {chips.length ? (
        <View style={styles.chipRow}>
          {chips.slice(0, 4).map((c, i) => (
            <NewChip key={c.key} index={i} label={c.label} reducedMotion={reducedMotion} dark startMs={startMs}
              face={c.face != null && deck ? faceFor(deck, c.face) : null} foil={c.label === 'NEW FOIL'} stamp={!!c.stamp} />
          ))}
        </View>
      ) : null}
      {data.extraRewards.map((r) => <Text key={r} style={styles.extraReward}>{r}</Text>)}
    </View>
  );
}

function IconBtn({ icon, label, onPress }: { icon: 'chest' | 'camera' | 'swords' | 'star'; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={() => { Haptic.tapLight(); onPress(); }} style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
      accessibilityRole="button" accessibilityLabel={label.toLowerCase()} hitSlop={4}>
      <GameIcon name={icon} size={22} />
      <Text style={styles.iconLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  // Navy, not milky white: the shark and board stay readable behind a win.
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(4,38,86,0.62)' },
  reveal: { alignSelf: 'stretch', alignItems: 'center' },
  burst: { position: 'absolute', left: 0, right: 0, top: 70, height: 60, alignItems: 'center', justifyContent: 'center', zIndex: 5 },
  burstCoin: { position: 'absolute', width: 38, height: 38 },
  card: {
    width: '90%', maxWidth: 400, backgroundColor: MM.cream, borderRadius: 26, borderWidth: 3, borderColor: MM.ink,
    backfaceVisibility: 'hidden',
  },
  cardBack: { position: 'absolute', padding: 16, alignItems: 'center' },
  cardInner: { alignItems: 'center', paddingHorizontal: 14, paddingBottom: 16 },
  banner: { width: '108%', height: 92, marginTop: -26, alignItems: 'center', justifyContent: 'center' },
  bannerImg: { position: 'absolute', width: '100%', height: '100%' },
  bannerFlash: { position: 'absolute', width: '80%', height: '60%', backgroundColor: '#ffffff', borderRadius: 30 },
  bannerText: {
    fontFamily: 'Shark', fontSize: 32, color: '#ffffff', marginTop: -10, paddingHorizontal: 54,
    textShadowColor: MM.ink, textShadowOffset: { width: 2, height: 3 }, textShadowRadius: 1,
  },
  dust: { position: 'absolute', bottom: -6, width: '70%', height: 40 },
  headlineSlot: { height: 56 },
  headline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', marginTop: 2 },
  medal: { width: 54, height: 50, marginRight: 8, borderRadius: 27, overflow: 'hidden' },
  medalTint: { ...StyleSheet.absoluteFillObject, opacity: 0.35, borderRadius: 27 },
  medalBand: { position: 'absolute', left: -10, right: -10, height: 7, transform: [{ rotateZ: '-20deg' }] },
  recallPlate: { flexDirection: 'row', alignItems: 'baseline', backgroundColor: MM.gold, borderRadius: 14, borderWidth: 2.5, borderColor: '#ffffff', paddingHorizontal: 14, paddingVertical: 4 },
  recallLabel: { fontFamily: 'Knockout', fontSize: 15, color: MM.navyText, marginRight: 6, letterSpacing: 1 },
  recallValue: { fontFamily: 'Shark', fontSize: 30, color: MM.navyText },
  editionText: { width: '100%', textAlign: 'center', fontFamily: 'Shark', fontSize: 13, color: MM.goldDeep, marginTop: 2 },
  crownRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 6, height: 44 },
  crownWrap: { marginHorizontal: 6 },
  crown: { width: 44, height: 40 },
  crownOff: { opacity: 0.2 },
  numbers: { alignSelf: 'stretch', alignItems: 'center', marginTop: 4 },
  tally: { alignItems: 'center', marginBottom: 4 },
  tallyParts: { fontFamily: 'Shark', fontSize: 16, color: MM.ink },
  tallyTotal: { fontFamily: 'Shark', fontSize: 34, color: MM.navyText },
  numRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6 },
  num: { minWidth: 76, backgroundColor: '#ffffff', borderRadius: 12, borderWidth: 2, borderColor: '#cfe3f7', paddingHorizontal: 8, paddingVertical: 3, alignItems: 'center' },
  numHot: { borderColor: MM.gold },
  numLabel: { fontFamily: 'Knockout', fontSize: 11, color: MM.ink, letterSpacing: 0.5 },
  numValue: { fontFamily: 'Shark', fontSize: 18, color: MM.navyText },
  luckChip: { marginTop: 6, backgroundColor: '#ffffff', borderRadius: 10, borderWidth: 1.5, borderColor: MM.ink, paddingHorizontal: 8, paddingVertical: 2 },
  luckText: { fontFamily: 'Knockout', fontSize: 12, color: MM.ink },
  newBest: { fontFamily: 'Shark', fontSize: 16, color: '#ffffff', marginTop: 4, backgroundColor: MM.coral, borderWidth: 2.5,
    borderColor: MM.ink, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 1, overflow: 'hidden', transform: [{ rotateZ: '-4deg' }] },
  grades: { alignItems: 'center', marginTop: 8 },
  gradeRow: { flexDirection: 'row', gap: 18 },
  grade: { alignItems: 'center' },
  gradeStamp: { width: 40, height: 40, borderRadius: 20, borderWidth: 3, alignItems: 'center', justifyContent: 'center', backgroundColor: '#ffffff' },
  gradeLetter: { fontFamily: 'Shark', fontSize: 24 },
  gradeLabel: { fontFamily: 'Knockout', fontSize: 11, color: MM.ink, marginTop: 2 },
  tip: { fontFamily: 'Knockout', fontSize: 14, color: MM.navyText, textAlign: 'center', marginTop: 6, paddingHorizontal: 6 },
  rewards: { alignItems: 'center', marginTop: 8 },
  chipRow: { flexDirection: 'row', justifyContent: 'center', gap: 8 },
  extraReward: { fontFamily: 'Shark', fontSize: 15, color: '#ffffff', backgroundColor: MM.ink, borderRadius: 10, overflow: 'hidden',
    paddingHorizontal: 10, paddingVertical: 2, marginTop: 4 },
  actions: { alignSelf: 'stretch', alignItems: 'center', marginTop: 10 },
  bigBtn: { alignSelf: 'stretch', backgroundColor: MM.gold, borderRadius: 16, paddingVertical: 13, alignItems: 'center', borderBottomWidth: 4, borderBottomColor: MM.goldDeep, minHeight: 54 },
  bigBtnText: { fontFamily: 'Shark', fontSize: 24, color: '#075083' },
  pressed: { transform: [{ scale: 0.97 }] },
  iconRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  iconBtn: { width: 92, minHeight: 56, borderRadius: 14, borderWidth: 2.5, borderColor: MM.ink, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center', paddingVertical: 4 },
  iconLabel: { fontFamily: 'Shark', fontSize: 12, color: MM.navyText, marginTop: 2 },
  closeText: { fontFamily: 'Knockout', fontSize: 15, color: MM.ink, marginTop: 10, textDecorationLine: 'underline' },
  panel: { alignSelf: 'stretch', alignItems: 'center', marginTop: 8 },
});
