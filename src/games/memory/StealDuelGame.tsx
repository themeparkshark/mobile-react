/**
 * StealDuelGame.tsx: Steal Duel on the booth (design v8 4.6, 6.5).
 *
 * Two sharks share one board; every flip is public and every card you flip
 * teaches your rival. Your flips are instant; the rival's replay on your board
 * with their colour rim. A 4000ms turn ring drains on the active player's
 * plate; when it runs out the booth flips for you (Mario Party), so nobody can
 * stall. A match goes again; STOLEN pays +50 and takes the rival's streak:
 * the tag, the streak number flying across, the pair yanked to your end of
 * the counter and the rival barker's gasp.
 *
 * Until WS7's duel endpoints exist, the rival is the HOUSE SHARK (a practice
 * bot that plays only from public reveals), clearly labelled. Rewards are
 * cosmetic and never a ride coin. Movement never pauses it.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, cancelAnimation, runOnJS, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FxStage, GameAudio, GameShellV2, Haptic, useCamera, useGameMusic, useMusicBeat, useStudioAudio, type FxStageHandle, type GameResult } from '../../gamekit';
import { SHARKS } from '../../gamekit/party/partyArt';
import useReducedGameMotion from '../../hooks/useReducedGameMotion';
import { MemoryCard, makeCardValues, type CardValues, type MemoryCardHandle, type ShimmerState } from './MemoryCard';
import { SharkStage, type SharkStageHandle } from './SharkStage';
import { BoardFxOver, BoardFxUnder, NO_ARC, type ArcState, type FlashRects, type RippleState, type RopeState } from './BoardFx';
import { AwningCallouts, BoothFront, marqueeChain, marqueeFlash, useMarquee, type AwningCalloutsHandle, type PrizeEntry } from './MemoryBooth';
import { FlightLayer, type FlightLayerHandle } from './FlightLayer';
import { MemoryResults, type MemoryResultsData } from './MemoryResults';
import { deckById, type Deck } from './decks';
import { faceFor } from './faces';
import { boardSeed, buildLayout } from './logic';
import { boothGeo, hitSlot as geoHitSlot, slotCenter, slotXY, type BoothGeo } from './layout';
import { FLIP_MS, MM, ladderStep } from './theme';
import { HOUSE_SHARK, TURN_RING_MS, createStealDuel, forcedSet, sdBotPick, sdDismiss, sdFlip, sdTick, type SDEvent, type SDState } from './modes/stealDuel';

const CARD_BACK = require('../../assets/games/memory/card-back.png');
const ME = 0;
const RIVAL = 1;
const COLORS = [MM.blue, '#22B573'];
const NAMES = ['YOU', 'HOUSE SHARK'];

export interface StealDuelProps {
  visible: boolean;
  deckId?: string;
  seed?: number;
  onClose: () => void;
  onQuit?: (resume: () => void) => void;
}

const now = () => (global as unknown as { performance?: { now: () => number } }).performance?.now() ?? Date.now();

export default function StealDuelGame({ visible, deckId, seed, onClose, onQuit }: StealDuelProps) {
  const reducedMotion = useReducedGameMotion();
  const insets = useSafeAreaInsets();
  const deck: Deck = useMemo(() => deckById(deckId) ?? deckById('park')!, [deckId]);
  const [round, setRound] = useState(0);
  const baseSeed = useMemo(() => (seed != null ? seed >>> 0 : (Math.random() * 0xffffffff) >>> 0), [seed]);
  const layout = useMemo(() => buildLayout({ pairs: 8, deckSize: deck.symbols.length, seed: boardSeed(baseSeed, 2000 + round) }), [baseSeed, deck.symbols.length, round]);
  const sRef = useRef<SDState>(createStealDuel(layout.faces, baseSeed ^ 0x5d1e, round % 2, 0));
  const t0 = useRef(now());
  const playing = useRef(false);
  const busyBot = useRef(false);
  const [boardKey, setBoardKey] = useState(0);
  const [n, setN] = useState(16);
  const [faces, setFaces] = useState<Record<number, number>>({});
  const [wells, setWells] = useState<number[]>([]);
  const [prizes, setPrizes] = useState<(PrizeEntry | null)[]>(Array.from({ length: 8 }, () => null));
  const [plates, setPlates] = useState({ points: [0, 0], streak: [0, 0], current: 0, sudden: false });
  const [hint, setHint] = useState<string | null>(null);
  const [result, setResult] = useState<GameResult | null>(null);
  const [resultData, setResultData] = useState<MemoryResultsData | null>(null);
  const [field, setField] = useState({ w: 0, h: 0 });
  const cols = 4;
  const rows = n / 4;
  const g = useMemo(() => (field.w ? boothGeo(field.w, field.h, cols, rows, { bottomInset: insets.bottom }) : null), [field.w, field.h, rows, insets.bottom]);
  const gRef = useRef(g);
  gRef.current = g;
  const cards = useRef<(MemoryCardHandle | null)[]>([]);
  const cardValues = useMemo<CardValues[]>(() => Array.from({ length: n }, (_, i) => {
    const p = gRef.current ? slotXY(gRef.current, i) : { x: 0, y: 0 };
    return makeCardValues(p.x, p.y);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [boardKey, n]);
  const stage = useRef<SharkStageHandle>(null);
  const fx = useRef<FxStageHandle>(null);
  const flights = useRef<FlightLayerHandle>(null);
  const awning = useRef<AwningCalloutsHandle>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = useCallback((ms: number, fn: () => void) => { timers.current.push(setTimeout(fn, ms)); }, []);
  const marquee = useMarquee();
  const ring = useSharedValue(1);
  const shimmer = useSharedValue<ShimmerState>({ id: -1, p: 0 });
  const rope: RopeState = { frac: useSharedValue(1), urgent: useSharedValue(0), dim: useSharedValue(0), glint: useSharedValue(-1), capHit: useSharedValue(0) };
  const arc = useSharedValue<ArcState>(NO_ARC);
  const slipArc = useSharedValue<ArcState>(NO_ARC);
  const trail = useSharedValue<ArcState>(NO_ARC);
  const flash = useSharedValue<FlashRects>({ rects: [], p: 0 });
  const flashP = useSharedValue(0);
  const ripple = useSharedValue<RippleState>({ x: 0, y: 0, p: 0, strength: 0 });
  const beat = useMusicBeat(visible && !result);
  const camera = useCamera({ width: field.w || 1, height: field.h || 1, reducedMotion });
  const [bed, setBed] = useState<string | null>(null);
  useGameMusic(bed, { at: 'bar' });
  useStudioAudio('memory', ['mm_flip', 'mm_match', 'mm_sharp_twinkle', 'mm_scout_tick', 'mm_board_clear', 'mm_stolen', 'mm_streak_steal',
    'mm_turn_pass', 'mm_duel_found', 'mm_shelf_drop', 'mm_clock_tick', 'mm_lose', 'fx.reward', 'fx.whoosh', 'sh_whistle']);
  useEffect(() => {
    // Duels run the main bed at -3dB.
    GameAudio.music.setTrimDb(-3, 300);
    return () => GameAudio.music.setTrimDb(0, 0);
  }, []);

  const at = useCallback(() => now() - t0.current, []);
  const onFieldLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setField((f) => (Math.abs(f.w - width) < 1 && Math.abs(f.h - height) < 1 ? f : { w: width, h: height }));
  }, []);

  const sync = useCallback(() => {
    const s = sRef.current;
    setPlates({ points: [s.players[0].points, s.players[1].points], streak: [s.players[0].streak, s.players[1].streak], current: s.current, sudden: s.suddenDeath });
    marqueeChain(marquee, s.players[s.current].streak, reducedMotion);
  }, [marquee, reducedMotion]);

  const startRing = useCallback(() => {
    const s = sRef.current;
    cancelAnimation(ring);
    const left = Math.max(0, s.deadline - at());
    ring.value = left / TURN_RING_MS;
    ring.value = withTiming(0, { duration: left, easing: Easing.linear });
  }, [at, ring]);

  // Fresh duel each round.
  useEffect(() => {
    if (!visible) return;
    timers.current.forEach(clearTimeout);
    timers.current = [];
    sRef.current = createStealDuel(layout.faces, baseSeed ^ (0x5d1e + round), round % 2, 0);
    playing.current = false;
    cards.current = [];
    setN(16);
    setFaces({});
    setWells([]);
    setPrizes(Array.from({ length: 8 }, () => null));
    setResult(null);
    setResultData(null);
    setBoardKey((k) => k + 1);
    sync();
  }, [visible, layout, round, baseSeed, sync]);

  // Deal.
  useEffect(() => {
    if (!g) return;
    const t = setTimeout(() => {
      const pile = { x: g.W / 2 - g.cw / 2, y: g.counter.y - g.ch * 0.3 };
      for (let s = 0; s < n; s++) {
        const p = slotXY(g, s);
        cards.current[s]?.place(p.x, p.y);
        cards.current[s]?.deal(pile.x, pile.y, s * 38, reducedMotion);
      }
      GameAudio.play('fx.whoosh', { volume: 0.5 });
    }, 40);
    return () => clearTimeout(t);
  }, [g, boardKey, n, reducedMotion]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const finish = useCallback((winner: number) => {
    playing.current = false;
    const s = sRef.current;
    GameAudio.music.stop(400);
    const won = winner === ME;
    if (won) {
      GameAudio.play('fx.reward');
      Haptic.success();
      stage.current?.pose('coin');
    } else {
      GameAudio.play('mm_lose');
      Haptic.tickSelection();
      later(80, () => Haptic.tickSelection());
      stage.current?.tumble();
    }
    later(1300, () => {
      const me = s.players[ME];
      const rv = s.players[RIVAL];
      setResultData({
        mode: 'race', banner: winner === 2 ? 'DRAW' : won ? 'YOU WIN' : 'HOUSE SHARK WINS', won, recallPct: 0, headline: { label: 'POINTS', value: `${me.points}` }, edition: null, upgraded: false,
        stars: won ? 3 : winner === 2 ? 2 : 1,
        numbers: [
          { label: 'POINTS', value: `${me.points}`, hot: won },
          { label: 'RIVAL', value: `${rv.points}` },
          { label: 'STEALS', value: `${me.steals}` },
          { label: 'BEST STREAK', value: `${me.bestStreak}` },
        ],
        tally: null, chip: 'Practice duel vs the house shark. Live duels open with your line.', grades: null,
        tip: me.steals ? 'Stealing pairs your rival revealed takes their streak.' : 'Open with a card you know: you reveal one new card instead of two.',
        newBest: false, rewards: null, daily: null, extraRewards: [], againLabel: 'PLAY AGAIN',
      });
      setResult({ score: me.points, stars: won ? 3 : winner === 2 ? 2 : 1, message: won ? 'YOU WIN' : 'RIVAL WINS', meta: { game: 'memory', mode: 'stealDuel', practice: true, local: true, log: s.log.slice() } });
    });
  }, [later]);

  const apply = useCallback((events: SDEvent[]) => {
    const gg = gRef.current;
    if (!gg) return;
    const s = sRef.current;
    for (const ev of events) {
      switch (ev.k) {
        case 'flip': {
          setFaces((m) => ({ ...m, [ev.slot]: ev.face }));
          cards.current[ev.slot]?.flipUp(FLIP_MS);
          cards.current[ev.slot]?.rim(ev.player === RIVAL ? COLORS[RIVAL] : null);
          GameAudio.play('mm_flip', { pan: ((ev.slot % 4) / 3 - 0.5) * 0.8 });
          if (ev.player === ME) Haptic.tapLight();
          if (ev.auto) flights.current?.tag('AUTO', slotCenter(gg, ev.slot).x, slotXY(gg, ev.slot).y - 10, gg.cw * 0.8, 'white');
          break;
        }
        case 'blocked':
          cards.current[ev.slot]?.taken();
          Haptic.tickSelection();
          setHint('New card or its partner!');
          later(1400, () => setHint(null));
          break;
        case 'match': {
          const { a, b, player: who } = ev;
          const ca = slotCenter(gg, a);
          const cb = slotCenter(gg, b);
          later(FLIP_MS, () => {
            cards.current[a]?.stamp(ev.steal ? 90 : 50, ev.streak >= 3);
            cards.current[b]?.stamp(ev.steal ? 90 : 50, ev.streak >= 3);
            GameAudio.playLadder('mm_match', ladderStep(ev.streak));
            fx.current?.burst('stars', (ca.x + cb.x) / 2, (ca.y + cb.y) / 2, { count: reducedMotion ? 6 : ev.streak >= 3 ? 16 : 10 });
            if (who === ME) Haptic.hitRigid();
            flights.current?.tag(`+${ev.value}`, cb.x, slotXY(gg, b).y - 10, gg.cw * 0.9, who === ME ? 'gold' : 'white');
            if (ev.steal) {
              flights.current?.tag('STOLEN', ca.x, slotXY(gg, a).y - 10, gg.cw * 0.9, 'coral');
              GameAudio.play('mm_stolen');
              later(120, () => GameAudio.play('mm_streak_steal'));
              if (who === ME) {
                Haptic.hitRigid();
                stage.current?.pose('gasp', 900);
                awning.current?.ribbon(ev.took ? `STOLEN +${ev.took} STREAK` : 'STOLEN');
              } else {
                Haptic.tickSelection();
                later(80, () => Haptic.tickSelection());
                stage.current?.pose('facepalm', 800);
              }
              if (!reducedMotion) camera.shake(0.25);
            } else {
              stage.current?.pose(who === ME ? 'fist' : 'wave', 700);
            }
            marqueeFlash(marquee);
          });
          // The pair flies to the matcher's end of the counter (mine from the left, theirs from the right).
          later(FLIP_MS + 260, () => {
            cards.current[a]?.hide(60);
            cards.current[b]?.hide(60);
            setWells((w) => [...w, a, b]);
            const mine = s.players[ME].pairs;
            const theirs = s.players[RIVAL].pairs;
            const k = who === ME ? mine - 1 : gg.prize.length - theirs;
            const target = gg.prize[Math.max(0, Math.min(gg.prize.length - 1, k))];
            flights.current?.fly({
              a: slotXY(gg, a), b: slotXY(gg, b), to: target, face: faceFor(deck, ev.face), w: gg.cw, h: gg.ch, delayMs: 0,
              onLand: () => {
                GameAudio.play('mm_shelf_drop', { volume: 0.7 });
                setPrizes((pz) => {
                  const c = pz.slice();
                  c[Math.max(0, Math.min(c.length - 1, k))] = { face: faceFor(deck, ev.face), tint: who === ME ? 'gold' : undefined };
                  return c;
                });
              },
            });
          });
          sync();
          break;
        }
        case 'miss':
          later(FLIP_MS, () => {
            GameAudio.play('mm_scout_tick');
            cards.current[ev.a]?.settle();
            cards.current[ev.b]?.settle();
          });
          break;
        case 'hide':
          cards.current[ev.a]?.flipDown(FLIP_MS);
          cards.current[ev.b]?.flipDown(FLIP_MS, 60);
          break;
        case 'streakReset':
          sync();
          break;
        case 'pass':
          GameAudio.play('mm_turn_pass', { volume: 0.7 });
          if (ev.to === ME) { Haptic.tapLight(); later(80, () => Haptic.tapLight()); }
          stage.current?.lean(ev.to === ME ? -1 : 1);
          sync();
          startRing();
          break;
        case 'ring':
          startRing();
          break;
        case 'suddenDeath': {
          awning.current?.sign('SUDDEN DEATH');
          stage.current?.hatGag(true);
          marquee.all.value = withTiming(1, { duration: 120 });
          setBed('mm_loop_overtime');
          later(1200, () => {
            cards.current = [];
            setN(4);
            setFaces({});
            setWells([]);
            setBoardKey((k) => k + 1);
            later(500, startRing);
          });
          sync();
          break;
        }
        case 'over':
          finish(ev.winner);
          break;
      }
    }
  }, [camera, deck, finish, later, marquee, reducedMotion, startRing, sync]);

  // Clock: ring expiry, miss holds, and the house shark's turn.
  useEffect(() => {
    if (!visible) return undefined;
    let r = (baseSeed ^ 0x9e3779b9) >>> 0;
    const rng = () => { r = (Math.imul(r, 1103515245) + 12345) >>> 0; return r / 4294967296; };
    const id = setInterval(() => {
      const s = sRef.current;
      if (!playing.current || s.phase === 3) return;
      const ev = sdTick(s, at());
      if (ev.length) apply(ev);
      if (s.current === RIVAL && s.phase !== 2 && s.phase !== 3 && !busyBot.current) {
        busyBot.current = true;
        const think = HOUSE_SHARK.minMs + rng() * (HOUSE_SHARK.maxMs - HOUSE_SHARK.minMs);
        later(think, () => {
          busyBot.current = false;
          const ss = sRef.current;
          if (!playing.current || ss.current !== RIVAL || ss.phase === 2 || ss.phase === 3) return;
          const slot = sdBotPick(ss, HOUSE_SHARK.recall, rng);
          if (slot >= 0) apply(sdFlip(ss, RIVAL, slot, at()));
        });
      }
    }, 50);
    return () => clearInterval(id);
  }, [visible, apply, at, baseSeed, later]);

  const onStart = useCallback(() => {
    t0.current = now();
    const s = sRef.current;
    s.deadline = TURN_RING_MS;
    s.now = 0;
    playing.current = true;
    setBed('mm_loop_main');
    GameAudio.play('mm_duel_found');
    awning.current?.sign('STEAL DUEL');
    stage.current?.lean(s.current === ME ? -1 : 1);
    startRing();
    sync();
  }, [startRing, sync]);

  const tapAt = useCallback((x: number, y: number) => {
    const gg = gRef.current;
    const s = sRef.current;
    if (!gg || !playing.current) return;
    if (s.current !== ME) return;
    if (s.phase === 2) { apply(sdDismiss(s, ME, at())); return; }
    const slot = geoHitSlot(gg, x, y, 6, (i) => s.matched[i]);
    if (slot < 0) return;
    apply(sdFlip(s, ME, slot, at()));
  }, [apply, at]);

  const ox = g?.felt.x ?? 0;
  const oy = g?.felt.y ?? 0;
  const tap = useMemo(() => Gesture.Tap().maxDuration(900).maxDistance(40).onEnd((e, ok) => { if (ok) runOnJS(tapAt)(e.x + ox, e.y + oy); }), [tapAt, ox, oy]);

  // Dev capture bot for my seat too.
  const autoplay = typeof __DEV__ !== 'undefined' && __DEV__ && !!process.env.EXPO_PUBLIC_MEMORY_AUTOPLAY;
  useEffect(() => {
    if (!autoplay || !visible || result) return undefined;
    let r = 777;
    const rng = () => { r = (Math.imul(r, 1103515245) + 12345) >>> 0; return r / 4294967296; };
    const id = setInterval(() => {
      const s = sRef.current;
      const gg = gRef.current;
      if (!gg || !playing.current || s.current !== ME) return;
      if (s.phase === 2) { if (rng() < 0.5) apply(sdDismiss(s, ME, at())); return; }
      const slot = sdBotPick(s, 0.85, rng);
      if (slot >= 0) apply(sdFlip(s, ME, slot, at()));
    }, 700);
    return () => clearInterval(id);
  }, [autoplay, visible, result, apply, at]);

  const blocked = useMemo(() => {
    const s = sRef.current;
    if (s.current !== ME || s.phase !== 1) return [] as number[];
    const allowed = forcedSet(s);
    if (!allowed.length) return [];
    return Array.from({ length: s.n }, (_, i) => i).filter((i) => !s.matched[i] && i !== s.a && allowed.indexOf(i) < 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [faces, plates]);

  const ringStyle = useAnimatedStyle(() => ({ width: `${Math.max(0, Math.min(1, ring.value)) * 100}%` }));
  void withSequence;

  return (
    <GameShellV2
      visible={visible}
      title="Steal Duel"
      subtitle={`${deck.label} · Practice vs the house shark`}
      score={plates.points[ME]}
      hideHeaderScore
      objective="Every card you flip teaches your rival. Steal their pairs."
      result={result}
      gameId="memory"
      movementPolicy="playThrough"
      onStart={onStart}
      onComplete={() => onClose()}
      onClose={onClose}
      onQuit={onQuit}
      onRematch={() => setRound((k) => k + 1)}
      renderResults={resultData ? (args) => <MemoryResults data={resultData} claim={args.claim} again={args.rematch} reducedMotion={args.reducedMotion} /> : undefined}
    >
      <View style={styles.field} onLayout={onFieldLayout}>
        <LinearGradient colors={['#0b80c4', '#35a8e6', '#bfe5ff']} style={StyleSheet.absoluteFill} />
        {g ? (
          <>
            <BoardFxUnder geo={g} wells={wells} cards={cardValues} ids={Array.from({ length: n }, (_, i) => i)} rope={rope} showRope={false} notchFrac={-1} beads={null} ripple={ripple} />
            <View key={`b${boardKey}`} style={StyleSheet.absoluteFill} pointerEvents="none">
              {Array.from({ length: n }, (_, i) => (
                <MemoryCard key={`c${boardKey}-${i}`} id={i} ref={(h) => { cards.current[i] = h; }} sv={cardValues[i]} shimmer={shimmer}
                  w={g.cw} h={g.ch} back={CARD_BACK} face={faces[i] != null ? faceFor(deck, faces[i]) : {}} reducedMotion={reducedMotion} />
              ))}
            </View>
            {blocked.map((i) => {
              const p = slotXY(g, i);
              return <View key={`x${i}`} pointerEvents="none" style={[styles.blocked, { left: p.x, top: p.y, width: g.cw, height: g.ch }]} />;
            })}
            <BoardFxOver arc={arc} slipArc={slipArc} flash={flash} flashP={flashP} trail={trail} />
            <Animated.View style={[StyleSheet.absoluteFill, camera.style]} pointerEvents="none">
              <SharkStage ref={stage} x={g.barker.x} y={g.barker.y} height={g.barker.h} beat={beat.beat} reducedMotion={reducedMotion} calm={reducedMotion} />
              <BoothFront geo={g} marquee={marquee} beat={beat.beat} reducedMotion={reducedMotion} prizes={prizes} pot={null} rail={null} bounceKey={0} />
            </Animated.View>
            <FlightLayer ref={flights} reducedMotion={reducedMotion} width={g.W} />
            <FxStage ref={fx} width={g.W} height={g.H} reducedMotion={reducedMotion} style={StyleSheet.absoluteFill} />
            <GestureDetector gesture={tap}>
              <View style={[styles.abs, { left: g.felt.x, top: g.felt.y, width: g.felt.w, height: g.felt.h }]} accessible accessibilityLabel="Duel board" />
            </GestureDetector>
            <View style={[styles.plates, { left: g.hud.x - 30, top: g.hud.y - 6, width: g.hud.w + 30 }]} pointerEvents="none">
              {[ME, RIVAL].map((who) => (
                <View key={who} style={[styles.plate, plates.current === who && { borderColor: MM.gold, transform: [{ scale: 1.06 }] }]}>
                  <Image source={who === ME ? SHARKS.classic : SHARKS.green} style={styles.plateShark} resizeMode="contain" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.plateName} numberOfLines={1}>{NAMES[who]}</Text>
                    <Text style={styles.platePts}>{plates.points[who]}</Text>
                  </View>
                  {plates.streak[who] > 0 ? (
                    <View style={[styles.streak, { backgroundColor: COLORS[who] }]}><Text style={styles.streakText}>{`x${plates.streak[who] >= 3 ? 2 : plates.streak[who] === 2 ? 1.5 : 1}`}</Text></View>
                  ) : null}
                  {plates.current === who ? <View style={styles.ringTrack}><Animated.View style={[styles.ringFill, ringStyle]} /></View> : null}
                </View>
              ))}
            </View>
            <AwningCallouts ref={awning} geo={g} reducedMotion={reducedMotion} />
            {hint ? <View pointerEvents="none" style={[styles.hint, { top: g.awning.y - 44 }]}><Text style={styles.hintText}>{hint}</Text></View> : null}
          </>
        ) : null}
      </View>
    </GameShellV2>
  );
}

const styles = StyleSheet.create({
  field: { flex: 1, overflow: 'hidden' },
  abs: { position: 'absolute' },
  plates: { position: 'absolute', flexDirection: 'row', gap: 6, justifyContent: 'flex-end' },
  plate: {
    flex: 1, maxWidth: 140, height: 48, flexDirection: 'row', alignItems: 'center', backgroundColor: '#ffffff', borderRadius: 14,
    borderWidth: 3, borderColor: MM.ink, paddingHorizontal: 6, overflow: 'hidden',
  },
  plateShark: { width: 30, height: 30, marginRight: 4 },
  plateName: { fontFamily: 'Knockout', fontSize: 11, color: MM.ink },
  platePts: { fontFamily: 'Shark', fontSize: 18, color: MM.navyText },
  streak: { borderRadius: 8, paddingHorizontal: 5, borderWidth: 1.5, borderColor: '#ffffff' },
  streakText: { fontFamily: 'Shark', fontSize: 12, color: '#ffffff' },
  ringTrack: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 5, backgroundColor: 'rgba(11,92,173,0.15)' },
  ringFill: { height: 5, backgroundColor: MM.gold },
  blocked: { position: 'absolute', borderRadius: 9, backgroundColor: 'rgba(255,255,255,0.5)' },
  hint: { position: 'absolute', alignSelf: 'center', backgroundColor: '#ffffff', borderRadius: 14, borderWidth: 3, borderColor: MM.gold, paddingHorizontal: 14, paddingVertical: 4 },
  hintText: { fontFamily: 'Shark', fontSize: 18, color: MM.navyText },
});
