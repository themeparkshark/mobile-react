/**
 * PassPlayGame.tsx: Pass & Play Classic (design 4.6). 2-4 sharks, one phone.
 *
 * Turn based on the same booth, cards and barker as the solo modes. Match =
 * go again, and the pair flies to your shark token. A miss holds both cards
 * up (tap anywhere or 1.5s), then a handoff curtain slides the next shark in:
 * "PASS TO PLAYER 2", tap to continue. A 10s soft turn ring nudges, never
 * penalises. The forced-new-card rule (modes/passPlay.ts) dims the other known
 * cards for the second flip, explained once with "Try a new card!". The end is
 * a podium: the winner bounces, ties share first.
 *
 * Movement never matters here (one phone, one table) and nothing pauses for it.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FxStage, GameAudio, GameShellV2, Haptic, useGameMusic, useMusicBeat, useStudioAudio, type FxStageHandle, type GameResult } from '../../gamekit';
import { SHARKS } from '../../gamekit/party/partyArt';
import useReducedGameMotion from '../../hooks/useReducedGameMotion';
import { MemoryCard, makeCardValues, type MemoryCardHandle, type ShimmerState } from './MemoryCard';
import { boothGeo, type BoothGeo } from './layout';
import { BoardFxUnder, NO_ARC, type RippleState, type RopeState } from './BoardFx';
import { BoothFront, useMarquee, marqueeChain } from './MemoryBooth';
import { SharkStage, type SharkStageHandle } from './SharkStage';
import { deckById, type Deck } from './decks';
import { faceFor } from './faces';
import { boardSeed, buildLayout } from './logic';
import { FLIP_MS, MM, ladderStep } from './theme';
import { createPassPlay, forcedSet, ppDismiss, ppFlip, ranking, type PPEvent, type PPState } from './modes/passPlay';

const forcedSetFor = (s: PPState) => forcedSet(s, s.a, s.aKnown);

const CARD_BACK = require('../../assets/games/memory/card-back.png');
const PLAYER_SHARKS = [SHARKS.classic, SHARKS.green, SHARKS.pink, SHARKS.orange];
const PLAYER_COLORS = [MM.blue, '#22B573', '#FF7EC8', '#ffa21f'];
const HOLD_MS = 1500;
const IDS16 = Array.from({ length: 16 }, (_, i) => i);
const EMPTY_PRIZES: never[] = [];
const TURN_RING_MS = 10000;

export interface PassPlayProps {
  visible: boolean;
  players: number;
  deckId?: string;
  seed?: number;
  onClose: () => void;
  onQuit?: (resume: () => void) => void;
}

interface Geo { W: number; H: number; stripH: number; stageY: number; stageH: number; panel: { x: number; y: number; w: number; h: number }; gx: number; gy: number; cw: number; ch: number; gap: number; booth: BoothGeo }

function geometry(W: number, H: number, bottom: number): Geo {
  const booth = boothGeo(W, H, 4, 4, { bottomInset: bottom, bandFrac: 0.2 });
  return {
    W, H, stripH: 78, stageY: 80, stageH: Math.max(80, booth.awning.y - 80 + booth.awning.h * 0.5), panel: booth.felt,
    gx: booth.grid.x, gy: booth.grid.y, cw: booth.cw, ch: booth.ch, gap: booth.gap, booth,
  };
}

export function legacyGeometry(W: number, H: number, bottom: number) {
  const stripH = 78;
  const stageY = stripH + 2;
  const stageH = Math.max(80, Math.min(120, H * 0.2));
  const panel = { x: 10, y: stageY + stageH - 6, w: W - 20, h: H - (stageY + stageH - 6) - Math.max(8, bottom) };
  const gap = 8;
  const ax = panel.x + 22;
  const aw = panel.w - 44;
  const ay = panel.y + 22;
  const ah = panel.h - 44;
  const colW = (aw - gap * 3) / 4;
  const ch = Math.min(colW / 0.74, (ah - gap * 3) / 4);
  const cw = Math.min(colW, ch * 0.8);
  const gw = cw * 4 + gap * 3;
  const gh = ch * 4 + gap * 3;
  return { W, H, stripH, stageY, stageH, panel, gx: ax + (aw - gw) / 2, gy: ay + (ah - gh) / 2, cw, ch, gap };
}

const slotXY = (g: Geo, s: number) => ({ x: g.gx + (s % 4) * (g.cw + g.gap), y: g.gy + Math.floor(s / 4) * (g.ch + g.gap) });

export default function PassPlayGame({ visible, players, deckId, seed, onClose, onQuit }: PassPlayProps) {
  const reducedMotion = useReducedGameMotion();
  const insets = useSafeAreaInsets();
  const deck: Deck = useMemo(() => deckById(deckId) ?? deckById('park')!, [deckId]);
  const [round, setRound] = useState(0);
  const baseSeed = useMemo(() => (seed != null ? seed >>> 0 : (Math.random() * 0xffffffff) >>> 0), [seed]);
  const layout = useMemo(() => buildLayout({ pairs: 8, deckSize: deck.symbols.length, seed: boardSeed(baseSeed, 1000 + round), golden: false }), [baseSeed, deck.symbols.length, round]);
  const stateRef = useRef<PPState>(createPassPlay(layout.faces, players));
  const [view, setView] = useState({ current: 0, pairs: new Array(players).fill(0) as number[], allowed: [] as number[], matched: [] as number[] });
  const [curtain, setCurtain] = useState<number | null>(null);
  const [podium, setPodium] = useState<number[][] | null>(null);
  const [result, setResult] = useState<GameResult | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [field, setField] = useState({ w: 0, h: 0 });
  const g = useMemo(() => (field.w ? geometry(field.w, field.h, insets.bottom) : null), [field.w, field.h, insets.bottom]);
  const gRef = useRef(g);
  gRef.current = g;
  const cards = useRef<(MemoryCardHandle | null)[]>([]);
  const stage = useRef<SharkStageHandle>(null);
  const fx = useRef<FxStageHandle>(null);
  const playing = useRef(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = useCallback((ms: number, fn: () => void) => { timers.current.push(setTimeout(fn, ms)); }, []);
  const shimmer = useSharedValue<ShimmerState>({ id: -1, p: 0 });
  const marquee = useMarquee();
  const ropeSv: RopeState = { frac: useSharedValue(1), urgent: useSharedValue(0), dim: useSharedValue(0), glint: useSharedValue(-1), capHit: useSharedValue(0) };
  const rippleSv = useSharedValue<RippleState>({ x: 0, y: 0, p: 0, strength: 0 });
  void NO_ARC;
  const [say, setSay] = useState<{ text: string; color: string; key: number } | null>(null);
  const sayIt = useCallback((text: string, color: string) => setSay({ text, color, key: Date.now() }), []);
  const ring = useSharedValue(1);
  const nudge = useSharedValue(0);
  const warmth = useSharedValue(0);
  const beat = useMusicBeat(visible && !result);
  const [bed, setBed] = useState<string | null>(null);
  useGameMusic(bed, { at: 'bar' });
  useStudioAudio('memory', ['mm_flip', 'mm_match', 'mm_scout_tick', 'mm_board_clear', 'ui_tick', 'sh_whistle']);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const cardValues = useMemo(() => Array.from({ length: 16 }, (_, i) => makeCardValues(g ? slotXY(g, i).x : 0, g ? slotXY(g, i).y : 0)), [round, g == null]);
  const onFieldLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setField((f) => (Math.abs(f.w - width) < 1 && Math.abs(f.h - height) < 1 ? f : { w: width, h: height }));
  }, []);

  const sync = useCallback(() => {
    const s = stateRef.current;
    const matched: number[] = [];
    s.matched.forEach((m, i) => { if (m) matched.push(i); });
    setView((v) => ({ ...v, current: s.current, pairs: s.players.map((p) => p.pairs), matched }));
  }, []);

  // Fresh board each round (and on rematch): deal from the pile.
  useEffect(() => {
    if (!visible) return;
    stateRef.current = createPassPlay(layout.faces, players);
    playing.current = false;
    setResult(null);
    setPodium(null);
    setCurtain(null);
    setHint(null);
    setView({ current: 0, pairs: new Array(players).fill(0), allowed: [], matched: [] });
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, [visible, layout, players]);

  useEffect(() => {
    if (!g) return;
    const pile = { x: g.W / 2 - g.cw / 2, y: g.panel.y + g.panel.h - g.ch * 0.4 };
    const t = setTimeout(() => {
      for (let s = 0; s < 16; s++) {
        const p = slotXY(g, s);
        cards.current[s]?.place(p.x, p.y);
        cards.current[s]?.deal(pile.x, pile.y, s * 38, reducedMotion);
      }
      GameAudio.play('fx.whoosh', { volume: 0.5 });
    }, 40);
    return () => clearTimeout(t);
  }, [g, layout, reducedMotion]);

  useEffect(() => () => { timers.current.forEach(clearTimeout); if (holdTimer.current) clearTimeout(holdTimer.current); }, []);

  // 10s soft turn ring: a nudge, never a penalty.
  const startRing = useCallback(() => {
    ring.value = 1;
    ring.value = withTiming(0, { duration: TURN_RING_MS, easing: Easing.linear }, (done) => {
      if (done) runOnJS(nudgeTurn)();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ring]);
  const nudgeTurn = useCallback(() => {
    if (!playing.current) return;
    nudge.value = withSequence(...[0, 1, 2, 3].map((i) => withTiming(i % 2 ? -1 : 1, { duration: 70 })), withTiming(0, { duration: 70 }));
    sayIt('YOUR TURN!', '#ffffff');
    Haptic.tickSelection();
  }, [nudge]);

  const onStart = useCallback(() => {
    playing.current = true;
    setBed('mm_loop_main');
    stage.current?.pose('wave', 900);
    sayIt('PLAYER 1', PLAYER_COLORS[0]);
    startRing();
  }, [startRing]);

  const finish = useCallback(() => {
    const s = stateRef.current;
    playing.current = false;
    const rank = ranking(s);
    setPodium(rank);
    GameAudio.music.stop(400);
    GameAudio.play('mm_board_clear');
    Haptic.success();
    later(80, () => Haptic.comboHeavy());
    const gg = gRef.current;
    if (gg) fx.current?.burst('confetti', gg.W / 2, gg.panel.y, { count: reducedMotion ? 6 : 60 });
    stage.current?.pose('party', 1800);
    later(2200, () => {
      const top = rank[0];
      const tie = top.length > 1;
      setResult({
        score: s.players[top[0]].pairs,
        stars: 3,
        message: tie ? 'TIE FOR FIRST!' : `PLAYER ${top[0] + 1} WINS!`,
        stats: s.players.map((p, i) => ({ label: `P${i + 1} PAIRS`, value: `${p.pairs}` })),
        note: `Best run: ${Math.max(...s.players.map((p) => p.bestRun))} pairs in a row.`,
        meta: { game: 'memory', mode: 'passPlay', players: s.players.length, local: true },
      });
    });
  }, [later, reducedMotion]);

  const apply = useCallback((events: PPEvent[], allowed: number[]) => {
    const gg = gRef.current;
    if (!gg) return;
    const s = stateRef.current;
    for (const ev of events) {
      switch (ev.k) {
        case 'flip':
          cards.current[ev.slot]?.flipUp(FLIP_MS);
          GameAudio.play('mm_flip', { pan: ((ev.slot % 4) / 3 - 0.5) * 0.8 });
          Haptic.tapLight();
          break;
        case 'rule':
          setHint('Try a new card!');
          later(1800, () => setHint(null));
          break;
        case 'blocked':
          cards.current[ev.slot]?.slip(false);
          Haptic.tickSelection();
          setHint('Try a new card!');
          later(1400, () => setHint(null));
          break;
        case 'match': {
          const { a, b, player, run } = ev;
          later(FLIP_MS, () => {
            cards.current[a]?.stamp(50, run >= 3);
            cards.current[b]?.stamp(50, run >= 3);
            GameAudio.playLadder('mm_match', ladderStep(run));
            if (ev.recall) GameAudio.playLadder('mm_sharp_twinkle', ladderStep(run), { volume: 0.6 });
            Haptic.hitMedium();
            const pa = slotXY(gg, a);
            const pb = slotXY(gg, b);
            fx.current?.burst('stars', (pa.x + pb.x) / 2 + gg.cw / 2, (pa.y + pb.y) / 2 + gg.ch / 2, { count: run >= 3 ? 16 : run === 2 ? 12 : 8 });
            stage.current?.pose(run >= 2 ? 'fist' : 'hmm', 700);
            if (run >= 3) sayIt('ON A ROLL!', MM.gold);
            warmth.value = withTiming(Math.min(3, run) * 0.06, { duration: 300 });
            marqueeChain(marquee, run, reducedMotion);
            // Pair flies to the player's token.
            const tx = tokenX(gg.W, s.players.length, player) - gg.cw * 0.25;
            later(260, () => {
              cards.current[a]?.moveTo(tx, 8, 280, gg.cw * 0.6);
              cards.current[b]?.moveTo(tx, 8, 280, gg.cw * 0.6, 40);
              cards.current[a]?.hide(320);
              cards.current[b]?.hide(360);
              later(380, sync);
            });
          });
          break;
        }
        case 'miss': {
          later(FLIP_MS, () => {
            GameAudio.play('mm_scout_tick');
            Haptic.tickSelection();
            stage.current?.pose('hmm', 600);
          });
          if (holdTimer.current) clearTimeout(holdTimer.current);
          holdTimer.current = setTimeout(() => { holdTimer.current = null; apply(ppDismiss(stateRef.current), []); }, HOLD_MS + FLIP_MS);
          break;
        }
        case 'hide':
          if (holdTimer.current) { clearTimeout(holdTimer.current); holdTimer.current = null; }
          cards.current[ev.a]?.flipDown(FLIP_MS);
          cards.current[ev.b]?.flipDown(FLIP_MS, 60);
          warmth.value = withTiming(0, { duration: 300 });
          marqueeChain(marquee, 0, reducedMotion);
          break;
        case 'pass':
          playing.current = false;
          ring.value = 1;
          later(FLIP_MS + 120, () => {
            setCurtain(ev.to);
            GameAudio.play('fx.whoosh', { volume: 0.6 });
            Haptic.tapLight();
            later(80, () => Haptic.tapLight());
          });
          break;
        case 'over':
          later(FLIP_MS + 700, finish);
          break;
      }
    }
    setView((v) => ({ ...v, allowed }));
    sync();
  }, [finish, later, ring, sync, warmth]);

  const tapAt = useCallback((x: number, y: number) => {
    const gg = gRef.current;
    if (!gg || !playing.current || curtain != null) return;
    let best = -1;
    let bestD = Infinity;
    for (let sIdx = 0; sIdx < 16; sIdx++) {
      if (stateRef.current.matched[sIdx]) continue;
      const p = slotXY(gg, sIdx);
      const cx = p.x + gg.cw / 2;
      const cy = p.y + gg.ch / 2;
      const dx = Math.abs(x - cx);
      const dy = Math.abs(y - cy);
      if (dx > gg.cw / 2 + gg.gap / 2 + 4 || dy > gg.ch / 2 + gg.gap / 2 + 4) continue;
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = sIdx; }
    }
    const s = stateRef.current;
    if (best < 0) {
      if (s.phase === 2) apply(ppDismiss(s), []);
      return;
    }
    if (s.phase === 1 && best === s.a) return;
    const r = ppFlip(s, best);
    if (s.phase === 1 || r.events.some((e) => e.k === 'match')) startRing();
    apply(r.events, r.allowed);
  }, [apply, curtain, startRing]);

  const offY = g?.panel.y ?? 0;
  const tap = useMemo(() => Gesture.Tap().maxDuration(900).maxDistance(40).onEnd((e, ok) => { if (ok) runOnJS(tapAt)(e.x, e.y + offY); }), [tapAt, offY]);

  const continueTurn = useCallback(() => {
    setCurtain(null);
    playing.current = true;
    const who = stateRef.current.current;
    sayIt(`PLAYER ${who + 1}`, PLAYER_COLORS[who]);
    stage.current?.pose('wave', 700);
    startRing();
  }, [startRing]);

  // Dev capture bot (EXPO_PUBLIC_MEMORY_AUTOPLAY set): plays every seat from
  // the table's own knowledge and taps through the handoff curtain.
  const autoplay = typeof __DEV__ !== 'undefined' && __DEV__ && !!process.env.EXPO_PUBLIC_MEMORY_AUTOPLAY;
  useEffect(() => {
    if (!autoplay || !visible || result) return;
    const id = setInterval(() => {
      const gg = gRef.current;
      const s = stateRef.current;
      if (!gg) return;
      if (curtain != null) { if (Math.random() < 0.5) continueTurn(); return; }
      if (!playing.current || s.phase === 3) return;
      if (s.phase === 2) { if (Math.random() < 0.6) apply(ppDismiss(s), []); return; }
      const open: number[] = [];
      for (let i = 0; i < 16; i++) if (!s.matched[i] && i !== s.a) open.push(i);
      const known = (i: number) => s.seen[s.current][i] && Math.random() < 0.8;
      let pick = -1;
      if (s.phase === 1) {
        pick = open.find((i) => s.faces[i] === s.faces[s.a] && known(i)) ?? -1;
        const allowed = forcedSetFor(s);
        if (pick < 0) pick = (allowed.length ? allowed : open.filter((i) => !s.tableSeen[i]))[0] ?? open[0];
      } else {
        pick = open.find((i) => known(i) && open.some((j) => j !== i && s.faces[j] === s.faces[i] && known(j))) ?? open.find((i) => !s.tableSeen[i]) ?? open[0];
      }
      if (pick == null || pick < 0) return;
      const p = slotXY(gg, pick);
      tapAt(p.x + gg.cw / 2, p.y + gg.ch / 2);
    }, 650);
    return () => clearInterval(id);
  }, [autoplay, visible, result, curtain, apply, continueTurn, tapAt]);

  const onRematch = useCallback(() => setRound((r) => r + 1), []);
  const blocked = view.allowed.length ? new Set(Array.from({ length: 16 }, (_, i) => i).filter((i) => view.allowed.indexOf(i) < 0 && i !== stateRef.current.a && !stateRef.current.matched[i])) : null;

  return (
    <GameShellV2
      visible={visible}
      title="Pass & Play"
      subtitle={`${deck.label} · ${players} players`}
      score={view.pairs[view.current] ?? 0}
      // Local table game: no personal best (the winner's pairs never read as a record).
      personalBest={result?.score}
      objective={`${players} sharks, one phone. Match and go again.`}
      result={result}
      gameId="memory"
      movementPolicy="playThrough"
      onStart={onStart}
      onComplete={() => onClose()}
      onClose={onClose}
      onQuit={onQuit}
      onRematch={onRematch}
    >
      <View style={styles.field} onLayout={onFieldLayout}>
        <LinearGradient colors={['#0b80c4', '#35a8e6', '#bfe5ff']} style={StyleSheet.absoluteFill} />
        {g ? (
          <>
            <View style={[styles.strip, { height: g.stripH }]}>
              {Array.from({ length: players }, (_, i) => (
                <PlayerToken key={i} index={i} n={players} W={g.W} active={i === view.current} pairs={view.pairs[i] ?? 0} ring={ring} nudge={nudge}
                  win={podium ? podium[0].indexOf(i) >= 0 : false} place={podium ? podium.findIndex((grp) => grp.indexOf(i) >= 0) + 1 : 0} reducedMotion={reducedMotion} />
              ))}
            </View>
            <View style={{ position: 'absolute', left: 0, top: g.stageY, width: g.W, height: g.stageH }} pointerEvents="none">
              <SharkStage ref={stage} x={8} y={0} height={g.stageH} beat={beat.beat} reducedMotion={reducedMotion} calm={reducedMotion} />
              {say ? <Text key={say.key} style={[styles.say, { color: say.color }]}>{say.text}</Text> : null}
            </View>
            <BoardFxUnder geo={g.booth} wells={view.matched} cards={cardValues} ids={IDS16} rope={ropeSv} showRope={false} notchFrac={-1} beads={null} ripple={rippleSv} />
            <View pointerEvents="none" style={[styles.turnRim, { left: g.booth.felt.x - 2, top: g.booth.felt.y - 2, width: g.booth.felt.w + 4, height: g.booth.felt.h + 4, borderColor: PLAYER_COLORS[view.current] }]} />
            <View style={StyleSheet.absoluteFill} pointerEvents="none" collapsable={false}>
            <View style={[StyleSheet.absoluteFill, styles.tilt]} pointerEvents="none">
              {layout.faces.map((f, s) => {
                const p = slotXY(g, s);
                return (
                  <MemoryCard key={`c${round}-${s}`} ref={(h) => { cards.current[s] = h; }} sv={cardValues[s] ?? makeCardValues(p.x, p.y)} id={s} shimmer={shimmer} w={g.cw} h={g.ch}
                    back={CARD_BACK} face={faceFor(deck, f)} reducedMotion={reducedMotion} />
                );
              })}
            </View>
            </View>
            {blocked ? Array.from(blocked).map((s) => {
              const p = slotXY(g, s);
              return <View key={`b${s}`} pointerEvents="none" style={[styles.blocked, { left: p.x, top: p.y, width: g.cw, height: g.ch }]} />;
            }) : null}
            <View style={StyleSheet.absoluteFill} pointerEvents="none">
              <BoothFront geo={g.booth} marquee={marquee} beat={beat.beat} reducedMotion={reducedMotion} prizes={EMPTY_PRIZES} pot={null} rail={null} bounceKey={0} />
            </View>
            <GestureDetector gesture={tap}>
              <View style={[styles.abs, { left: 0, top: g.panel.y, width: g.W, height: g.panel.h }]} accessible accessibilityLabel="Memory board" />
            </GestureDetector>
            {hint ? <View pointerEvents="none" style={[styles.hint, { top: g.panel.y - 22 }]}><Text style={styles.hintText}>{hint}</Text></View> : null}
            <FxStage ref={fx} width={g.W} height={g.H} reducedMotion={reducedMotion} style={StyleSheet.absoluteFill} />
            {curtain != null ? <Curtain player={curtain} onContinue={continueTurn} reducedMotion={reducedMotion} /> : null}
          </>
        ) : null}
      </View>
    </GameShellV2>
  );
}

function tokenX(W: number, n: number, i: number): number {
  const slot = (W - 20) / n;
  return 10 + slot * i + slot / 2;
}

function PlayerToken({ index, n, W, active, pairs, ring, nudge, win, place, reducedMotion }: {
  index: number; n: number; W: number; active: boolean; pairs: number;
  ring: ReturnType<typeof useSharedValue<number>>; nudge: ReturnType<typeof useSharedValue<number>>;
  win: boolean; place: number; reducedMotion: boolean;
}) {
  const bounce = useSharedValue(1);
  const bump = useSharedValue(1);
  useEffect(() => {
    if (!win || reducedMotion) return;
    bounce.value = withRepeat(withSequence(withTiming(0.88, { duration: 90 }), withTiming(1.1, { duration: 90 })), 3, true);
  }, [win, reducedMotion, bounce]);
  useEffect(() => {
    if (!pairs || reducedMotion) return;
    bump.value = withSequence(withTiming(1.25, { duration: 90 }), withTiming(1, { duration: 140 }));
  }, [pairs, reducedMotion, bump]);
  const st = useAnimatedStyle(() => ({
    transform: [
      { translateX: active ? nudge.value * 4 : 0 },
      { scale: (active ? 1.08 : 0.92) * bump.value },
      { scaleY: bounce.value },
    ],
  }));
  const ringSt = useAnimatedStyle(() => ({ width: `${active ? ring.value * 100 : 0}%` }));
  const x = tokenX(W, n, index);
  return (
    <Animated.View style={[styles.token, { left: x - 40 }, st, !active && { opacity: 0.75 }]}
      accessible accessibilityLabel={`Player ${index + 1}, ${pairs} pairs${active ? ', your turn' : ''}`}>
      <View style={[styles.tokenDisc, { borderColor: active ? MM.gold : '#ffffff', backgroundColor: PLAYER_COLORS[index] }]}>
        <Image source={PLAYER_SHARKS[index]} style={styles.tokenShark} resizeMode="contain" />
      </View>
      <View style={styles.tokenPlate}>
        <Text style={styles.tokenName}>{place ? ['1ST', '2ND', '3RD', '4TH'][place - 1] : `P${index + 1}`}</Text>
        <Text style={styles.tokenPairs}>{pairs}</Text>
      </View>
      <View style={styles.turnTrack}><Animated.View style={[styles.turnFill, ringSt]} /></View>
    </Animated.View>
  );
}

function Curtain({ player, onContinue, reducedMotion }: { player: number; onContinue: () => void; reducedMotion: boolean }) {
  const t = useSharedValue(reducedMotion ? 1 : 0);
  useEffect(() => {
    t.value = withTiming(1, { duration: 320, easing: Easing.out(Easing.back(1.4)) });
  }, [t]);
  const st = useAnimatedStyle(() => ({ transform: [{ translateX: (1 - t.value) * 260 }] }));
  return (
    <Pressable style={StyleSheet.absoluteFill} onPress={onContinue} accessibilityRole="button" accessibilityLabel={`Pass to player ${player + 1}. Tap to continue.`}>
      <BlurView intensity={18} tint="light" style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,255,255,0.85)' }]} />
      <View style={styles.curtainBody}>
        <Animated.View style={[styles.curtainShark, { backgroundColor: PLAYER_COLORS[player] }, st]}>
          <Image source={PLAYER_SHARKS[player]} style={{ width: 120, height: 120 }} resizeMode="contain" />
        </Animated.View>
        <Text style={styles.curtainKicker}>PASS TO</Text>
        <Text style={[styles.curtainTitle, { color: MM.navyText }]}>{`PLAYER ${player + 1}`}</Text>
        <View style={styles.curtainBtn}><Text style={styles.curtainBtnText}>TAP WHEN READY</Text></View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  field: { flex: 1, overflow: 'hidden' },
  abs: { position: 'absolute' },
  strip: { position: 'absolute', left: 0, right: 0, top: 4 },
  token: { position: 'absolute', top: 0, width: 80, alignItems: 'center' },
  tokenDisc: { width: 54, height: 54, borderRadius: 27, borderWidth: 3, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  tokenShark: { width: 58, height: 58, marginTop: 10 },
  tokenPlate: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#ffffff', borderRadius: 10, borderWidth: 2, borderColor: MM.ink, paddingHorizontal: 6, marginTop: -6 },
  tokenName: { fontFamily: 'Knockout', fontSize: 12, color: MM.ink },
  tokenPairs: { fontFamily: 'Shark', fontSize: 16, color: MM.navyText },
  turnTrack: { width: 52, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.4)', marginTop: 3, overflow: 'hidden' },
  turnFill: { height: 4, backgroundColor: MM.gold },
  panel: { position: 'absolute', backgroundColor: MM.wood, borderRadius: 20, borderWidth: 3, borderColor: '#5a2e0e', padding: 9 },
  felt: { flex: 1, borderRadius: 14, overflow: 'hidden', borderWidth: 3 },
  well: { position: 'absolute', backgroundColor: MM.well, borderWidth: 3, borderColor: '#ffffff', borderRadius: 9 },
  wellGold: { backgroundColor: 'rgba(254,201,14,0.18)', borderColor: MM.gold, borderStyle: 'dashed', borderWidth: 2 },
  tilt: {},
  turnRim: { position: 'absolute', borderRadius: 16, borderWidth: 4 },
  blocked: { position: 'absolute', borderRadius: 9, backgroundColor: 'rgba(255,255,255,0.55)', borderWidth: 2, borderColor: 'rgba(11,92,173,0.4)' },
  hint: { position: 'absolute', alignSelf: 'center', backgroundColor: '#ffffff', borderRadius: 14, borderWidth: 3, borderColor: MM.gold, paddingHorizontal: 14, paddingVertical: 4 },
  hintText: { fontFamily: 'Shark', fontSize: 18, color: MM.navyText },
  say: { position: 'absolute', right: 16, top: 18, fontFamily: 'Shark', fontSize: 28, textShadowColor: MM.ink, textShadowOffset: { width: 2, height: 3 }, textShadowRadius: 1 },
  curtainBody: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  curtainShark: { width: 150, height: 150, borderRadius: 75, borderWidth: 5, borderColor: '#ffffff', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  curtainKicker: { fontFamily: 'Knockout', fontSize: 18, color: MM.ink, letterSpacing: 1 },
  curtainTitle: { fontFamily: 'Shark', fontSize: 44 },
  curtainBtn: { marginTop: 18, backgroundColor: MM.gold, borderRadius: 18, paddingHorizontal: 28, paddingVertical: 14, borderBottomWidth: 4, borderBottomColor: MM.goldDeep },
  curtainBtnText: { fontFamily: 'Shark', fontSize: 22, color: '#075083' },
});
