/**
 * LineParty: live multiplayer for the people in one ride's line.
 *
 *   lobby -> 3-2-1 on the server's clock -> a micro-round on parallel boards
 *   with a live scoreboard and stickers -> server-verified results -> the next
 *   round, 5 to a Party Series (best 4 count, FINAL ROUND x2) -> the crown
 *
 * The line is always moving, so the room never pauses and movement never
 * stops a board. A HOLD (the pause button, or the phone going to the
 * background) freezes only your own board for up to 6 s, then a quick 3-2-1;
 * past that your ghost finishes the round and you are back for the next one.
 * A real advance of the line shows a small heads-up chip, nothing more.
 * Leaving the line or boarding ends the party with a wrap-up card.
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, ImageBackground, Pressable, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { Easing, FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming, ZoomIn } from 'react-native-reanimated';
import GameButton from '../../ui/GameButton';
import SharkLoader from '../../ui/SharkLoader';
import { BRAND, FONT } from '../../ui/tokens';
import { haptic } from '../Haptics';
import { playSfx } from '../SFX';
import { botTaps, buildTimeline, resolve, type BotProfile } from '../../games/party/bonkRace';
import type { PartyClient } from '../net/PartyClient';
import { usePartyState } from '../net/useParty';
import { displayName, placementOf } from '../net/roomState';
import { useLineHeadsUp } from '../motion/QueueMotion';
import GameIcon from '../../ui/GameIcon';
import type { EmoteId } from '../net/partyTypes';
import BonkBoard from './BonkBoard';
import PartyLobby from './PartyLobby';
import PartyResults from './PartyResults';
import RaceStrip, { type RacerLine } from './RaceStrip';
import { BOARD, STICKERS, STICKER_LABEL } from './partyArt';

export interface LinePartyProps {
  client: PartyClient;
  rideId: number;
  onExit: () => void;
  /** Dev-only demo hands for recorded proof runs. */
  autoplay?: BotProfile | null;
}

const ERROR_COPY: Record<string, { title: string; message: string }> = {
  NOT_IN_QUEUE: { title: 'Get in line first', message: 'Line Party opens once you are in this ride\'s line.' },
  NETWORK: { title: 'Park signal is weak', message: 'We will keep trying. Your spot in line is safe.' },
};

function LineParty({ client, rideId, onExit, autoplay }: LinePartyProps) {
  const state = usePartyState(client);
  const serverNow = useCallback(() => client.clock.serverNow(), [client]);

  useEffect(() => {
    void client.join(rideId);
    return () => client.destroy();
  }, [client, rideId]);

  const onEmote = useCallback((id: EmoteId) => void client.emote(id), [client]);
  const leave = useCallback(async () => {
    await client.leave();
    onExit();
  }, [client, onExit]);

  let body: React.ReactNode;
  switch (state.phase) {
    case 'idle':
    case 'joining':
      body = <SharkLoader tone="onBlue" title="Finding your line party" message="Checking who is in this line with you." />;
      break;
    case 'error': {
      const copy = ERROR_COPY[state.error?.code ?? ''] ?? { title: 'Line Party is resting', message: state.error?.message ?? 'Try again in a moment.' };
      body = <SharkLoader tone="onBlue" state="error" title={copy.title} message={copy.message} onRetry={() => void client.join(rideId)} retryLabel="Try again" />;
      break;
    }
    case 'lobby':
      body = <PartyLobby state={state} serverNow={serverNow} onReady={() => void client.ready(true)} onStart={() => void client.start()} onEmote={onEmote} onLeave={leave} />;
      break;
    case 'results':
      body = <PartyResults state={state} serverNow={serverNow} onRematch={() => void client.rematch()} onEmote={onEmote} onLeave={leave} />;
      break;
    case 'left':
      body = <WrapUp reason={state.leftReason} onClose={onExit} />;
      break;
    default:
      body = <Race client={client} autoplay={autoplay} onEmote={onEmote} />;
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      <ImageBackground source={BOARD.playfield} style={styles.root} resizeMode="cover">
        <View style={styles.tint} />
        <View style={styles.safe}>{body}</View>
        {state.room && state.phase !== 'left' ? <ConnectionChip connection={state.connection} /> : null}
        <HeadsUp enabled={!!state.room && state.phase !== 'left'} />
      </ImageBackground>
    </GestureHandlerRootView>
  );
}

export default memo(LineParty);

// ---------------------------------------------------------------- the race

function Race({ client, autoplay, onEmote }: { client: PartyClient; autoplay?: BotProfile | null; onEmote: (id: EmoteId) => void }) {
  const state = usePartyState(client);
  const round = state.room?.round ?? null;
  const local = client.round;
  const [boardT, setBoardT] = useState(-3000);
  const [myScore, setMyScore] = useState(0);
  const spawns = useMemo(() => (local?.spawns.length ? local.spawns : round ? buildTimeline(round.seed) : []), [local?.roundId, round?.seed]);
  const botLogs = useMemo(() => {
    const m = new Map<number, ReturnType<typeof botTaps>>();
    round?.seats.forEach((s) => { if (s.kind === 'bot' && s.profile) m.set(s.seat, botTaps(spawns, round.seed, s.seat, s.profile)); });
    return m;
  }, [round?.id, spawns]);
  const perfNow = useCallback(() => (globalThis.performance?.now ? globalThis.performance.now() : Date.now()), []);

  // Board clock for the HUD when the board is not mounted (ghosting, spectating).
  useEffect(() => {
    const h = setInterval(() => { const t = client.boardTime(); if (t !== null) setBoardT(t); }, 125);
    return () => clearInterval(h);
  }, [client]);

  const onTick = useCallback((t: number, score: number) => { setBoardT(t); setMyScore(score); }, []);
  const onProgress = useCallback((score: number, streak: number) => { setMyScore(score); client.reportProgress(score, streak); }, [client]);

  const lines: RacerLine[] = useMemo(() => {
    if (!round) return [];
    const emoteBy = new Map(state.emotes.map((e) => [e.user_id, { id: e.emote, key: e.key }]));
    const raw = round.seats.map((seat) => {
      const me = seat.kind === 'human' && seat.user_id === state.userId;
      let score = 0;
      let ghost = false;
      let away = false;
      if (me) {
        score = myScore;
        ghost = state.ghostedRoundId === round.id;
      } else if (seat.kind === 'bot') {
        const log = botLogs.get(seat.seat) ?? [];
        score = resolve(spawns, log.filter(([t]) => t <= boardT)).score;
      } else {
        const rival = seat.user_id !== undefined ? state.rivals[seat.user_id] : undefined;
        const member = state.room?.members.find((m) => m.id === seat.user_id);
        score = rival?.score ?? member?.live_score ?? 0;
        ghost = !!rival?.ghost;
        away = member?.state === 'away';
      }
      const key = seat.kind === 'bot' ? `b:${seat.name}` : `u:${seat.user_id}`;
      const seriesPoints = state.room?.series?.standings.find((r) => r.key === key)?.points;
      const name = seat.kind === 'bot' ? seat.name : displayName(state, seat.user_id, seat.name);
      return { seat, name, seriesPoints, score, me, ghost, away, emote: seat.user_id !== undefined ? emoteBy.get(seat.user_id) ?? null : null };
    });
    const all = raw.map((r) => r.score);
    return raw.map((r) => ({ ...r, placement: placementOf(r.score, all) }));
  }, [boardT, botLogs, myScore, round, spawns, state.emotes, state.ghostedRoundId, state.known, state.rivals, state.room?.members, state.room?.series, state.userId]);

  const phase = state.phase;
  const playing = (phase === 'countdown' || phase === 'playing') && local && local.roundId === round?.id && !local.ended;
  const secondsLeft = local ? Math.max(0, Math.ceil((local.durationMs - boardT) / 1000)) : 0;

  const boardClock = useCallback(() => client.boardTime(), [client]);
  const canHold = phase === 'playing' && !!local && !local.ended && boardT >= 0 && !state.hold;

  return (
    <View style={styles.race}>
      <SeriesPill round={round} />
      <RaceStrip lines={lines} />
      <View style={styles.hud}>
        <Text style={styles.myScore}>{myScore.toLocaleString('en-US')}</Text>
        <View style={styles.hudRight}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Hold my board"
            hitSlop={10}
            disabled={!canHold}
            onPress={() => { if (client.hold('manual')) haptic('tapLight'); }}
            style={[styles.holdBtn, !canHold && { opacity: 0.35 }]}
          >
            <GameIcon name="pause" size={26} />
          </Pressable>
          <Timer seconds={secondsLeft} urgent={secondsLeft <= 3 && boardT > 0} />
        </View>
      </View>
      <View style={styles.boardWrap}>
        {playing && local ? (
          <BonkBoard
            key={local.roundId}
            spawns={spawns}
            seed={local.seed}
            goAt={local.goAt}
            durationMs={local.durationMs}
            perfNow={perfNow}
            onTap={(hole) => client.recordTap(hole)}
            onProgress={onProgress}
            onTick={onTick}
            autoplay={autoplay}
            boardClock={boardClock}
          />
        ) : null}
        {state.hold && phase === 'playing' ? <HoldOverlay client={client} /> : null}
        {phase === 'countdown' && local ? <CountIn boardT={boardT} late={local.lateStart} /> : null}
        {phase === 'ghosting' ? <Banner title="YOUR GHOST IS ON IT" sub="It finishes this round for you. Only your best 4 rounds count, so this one is free." /> : null}
        {phase === 'spectating' ? <Banner title="NEXT ROUND IS YOURS" sub="This race started before you joined. Cheer them on." /> : null}
        {phase === 'submitting' || phase === 'waiting' ? <Banner title="FINISH!" sub="Checking every board on the server..." big /> : null}
      </View>
      <View style={styles.stickers}>
        <MiniStickers onEmote={onEmote} />
      </View>
    </View>
  );
}

/** ROUND 2 OF 5, or the gold FINAL ROUND x2 on round five. */
function SeriesPill({ round }: { round: { series_round: number | null; final: boolean } | null }) {
  if (!round?.series_round) return null;
  return (
    <Animated.View key={round.series_round} entering={ZoomIn.springify().damping(11)} style={[styles.pill, round.final && styles.pillFinal]}>
      <Text style={[styles.pillText, round.final && styles.pillTextFinal]}>{round.final ? 'FINAL ROUND  x2 POINTS' : `ROUND ${round.series_round} OF 5`}</Text>
    </Animated.View>
  );
}

/**
 * My board is on HOLD (nobody else's is). Tap to come back: a quick 3-2-1,
 * then the board picks up exactly where it was. The budget ticks down on screen.
 */
function HoldOverlay({ client }: { client: PartyClient }) {
  const state = usePartyState(client);
  const [left, setLeft] = useState(client.holdBudgetLeft());
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const h = setInterval(() => { setLeft(client.holdBudgetLeft()); setNow(Date.now()); }, 100);
    return () => clearInterval(h);
  }, [client]);
  const resumeAt = state.hold?.resumeAt ?? null;
  const count = resumeAt ? Math.max(1, Math.ceil(((resumeAt - now) / 900) * 3)) : null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Resume my board"
      disabled={!!resumeAt}
      onPress={() => { client.release(); haptic('tickSelection'); }}
      style={styles.holdWrap}
    >
      {count ? (
        <Animated.Text key={count} entering={ZoomIn.duration(140)} style={styles.count}>{String(count)}</Animated.Text>
      ) : (
        <Animated.View entering={ZoomIn.springify().damping(12)} style={styles.holdCard}>
          <GameIcon name="play" size={56} />
          <Text style={styles.holdTitle}>ON HOLD</Text>
          <Text style={styles.holdSub}>{`Only your board is paused. ${Math.ceil(left / 1000)}s left, then your ghost plays it.`}</Text>
          <Text style={styles.holdTap}>TAP TO PLAY</Text>
        </Animated.View>
      )}
    </Pressable>
  );
}

/** The line moved a lot: glance up. Never a pause, never a buzz. */
function HeadsUp({ enabled }: { enabled: boolean }) {
  const show = useLineHeadsUp(enabled);
  if (!show) return null;
  return (
    <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(300)} style={styles.headsUp} pointerEvents="none">
      <GameIcon name="queue" size={18} />
      <Text style={styles.headsUpText}>Line's moving. Heads up!</Text>
    </Animated.View>
  );
}

function Timer({ seconds, urgent }: { seconds: number; urgent: boolean }) {
  const s = useSharedValue(1);
  useEffect(() => {
    if (urgent) s.value = withSequence(withTiming(1.25, { duration: 90 }), withSpring(1, { damping: 8, stiffness: 300 }));
  }, [seconds, urgent, s]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <Animated.View style={[styles.timer, urgent && styles.timerUrgent, style]}>
      <Text style={styles.timerText}>{seconds}</Text>
    </Animated.View>
  );
}

function CountIn({ boardT, late }: { boardT: number; late: boolean }) {
  const n = boardT < 0 ? Math.ceil(-boardT / 1000) : 0;
  const label = n > 0 ? String(Math.min(3, n)) : 'GO!';
  const last = useRef<string | null>(null);
  const s = useSharedValue(2);
  useEffect(() => {
    if (last.current === label) return;
    last.current = label;
    s.value = 2.2;
    s.value = withTiming(1, { duration: 200, easing: Easing.out(Easing.back(2)) });
    if (label === 'GO!') { playSfx('go'); haptic('hitMedium'); } else { playSfx('countdown', 0.8); haptic('tickSelection'); }
  }, [label, s]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <View pointerEvents="none" style={styles.countWrap}>
      <Animated.Text style={[styles.count, label === 'GO!' && styles.go, style]}>{label}</Animated.Text>
      {late ? <Text style={styles.countSub}>You get the full 20 seconds</Text> : null}
    </View>
  );
}

function Banner({ title, sub, big }: { title: string; sub: string; big?: boolean }) {
  return (
    <Animated.View entering={ZoomIn.springify().damping(12)} exiting={FadeOut} style={styles.bannerWrap} pointerEvents="none">
      <Text style={[styles.bannerTitle, big && { fontSize: 52 }]}>{title}</Text>
      <Text style={styles.bannerSub}>{sub}</Text>
    </Animated.View>
  );
}

const MINI: EmoteId[] = ['foam_finger', 'fin', 'sunglasses', 'coin'];
/** Four stickers during play keep the board clear; the full bar lives in the lobby and results. */
function MiniStickers({ onEmote }: { onEmote: (id: EmoteId) => void }) {
  const [cool, setCool] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return (
    <View style={styles.miniRow}>
      {MINI.map((id) => (
        <Pressable
          key={id}
          accessibilityRole="button"
          accessibilityLabel={STICKER_LABEL[id]}
          hitSlop={6}
          disabled={cool}
          onPress={() => {
            setCool(true);
            timer.current = setTimeout(() => setCool(false), 1500);
            haptic('tapLight');
            onEmote(id);
          }}
          style={[styles.mini, cool && { opacity: 0.5 }]}
        >
          <Image source={STICKERS[id]} style={styles.miniImg} />
        </Pressable>
      ))}
    </View>
  );
}

function ConnectionChip({ connection }: { connection: string }) {
  if (connection === 'live') return null;
  return (
    <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.conn} pointerEvents="none">
      <Text style={styles.connText}>{connection === 'connecting' ? 'CONNECTING' : 'SYNCING'}</Text>
    </Animated.View>
  );
}

function WrapUp({ reason, onClose }: { reason: string | null; onClose: () => void }) {
  const rideUp = reason === 'left_queue';
  return (
    <View style={styles.wrap}>
      <Animated.Text entering={ZoomIn.springify().damping(10)} style={styles.wrapTitle}>{rideUp ? 'YOUR RIDE\'S UP!' : 'PARTY\'S OVER'}</Animated.Text>
      <Text style={styles.wrapSub}>{rideUp ? 'Your ghost finishes any race in progress and your results are saved. Have a great ride!' : 'Thanks for racing. Jump into the next line party any time.'}</Text>
      <GameButton label="Done" onPress={onClose} />
    </View>
  );
}

const outline = { textShadowColor: BRAND.navy, textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 0.1 };

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BRAND.blue },
  tint: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(7,104,185,0.18)' },
  safe: { flex: 1, paddingTop: 54 },
  race: { flex: 1 },
  hud: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 18, marginTop: 10 },
  hudRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  holdBtn: { width: 46, height: 46, borderRadius: 23, backgroundColor: BRAND.cream, borderColor: BRAND.navy, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  holdWrap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(8,56,128,0.30)' },
  holdCard: { alignItems: 'center', backgroundColor: BRAND.cream, borderColor: BRAND.navy, borderWidth: 4, borderRadius: 24, paddingHorizontal: 26, paddingVertical: 18, marginHorizontal: 30, gap: 6 },
  holdTitle: { fontFamily: FONT.display, fontSize: 34, color: BRAND.navy },
  holdSub: { fontFamily: FONT.body, fontSize: 15, color: BRAND.navy, textAlign: 'center' },
  holdTap: { marginTop: 4, fontFamily: FONT.display, fontSize: 18, color: BRAND.blue, letterSpacing: 1 },
  pill: { alignSelf: 'center', marginBottom: 18, backgroundColor: BRAND.cream, borderColor: BRAND.navy, borderWidth: 3, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 2 },
  pillFinal: { backgroundColor: BRAND.gold },
  pillText: { fontFamily: FONT.display, fontSize: 14, color: BRAND.navy, letterSpacing: 1 },
  pillTextFinal: { fontSize: 15 },
  headsUp: { position: 'absolute', top: 96, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: BRAND.cream, borderColor: BRAND.navy, borderWidth: 2, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 4 },
  headsUpText: { fontFamily: FONT.body, fontSize: 14, color: BRAND.navy },
  myScore: { fontFamily: FONT.display, fontSize: 44, color: BRAND.white, ...outline, fontVariant: ['tabular-nums'] },
  timer: { width: 62, height: 62, borderRadius: 31, backgroundColor: BRAND.cream, borderColor: BRAND.navy, borderWidth: 4, alignItems: 'center', justifyContent: 'center' },
  timerUrgent: { backgroundColor: '#ff8a5c' },
  timerText: { fontFamily: FONT.display, fontSize: 28, color: BRAND.navy },
  boardWrap: { flex: 1 },
  stickers: { paddingHorizontal: 60, paddingBottom: 22 },
  countWrap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  count: { fontFamily: FONT.display, fontSize: 120, color: BRAND.white, ...outline },
  go: { color: BRAND.gold },
  countSub: { fontFamily: FONT.body, fontSize: 16, color: BRAND.white, marginTop: 6 },
  bannerWrap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30, backgroundColor: 'rgba(8,56,128,0.25)' },
  bannerTitle: { fontFamily: FONT.display, fontSize: 38, color: BRAND.gold, textAlign: 'center', ...outline },
  bannerSub: { marginTop: 8, fontFamily: FONT.body, fontSize: 17, color: BRAND.white, textAlign: 'center' },
  miniRow: { flexDirection: 'row', justifyContent: 'space-around' },
  mini: { padding: 4, backgroundColor: BRAND.cream, borderColor: BRAND.navy, borderWidth: 2, borderRadius: 24 },
  miniImg: { width: 38, height: 38 },
  conn: { position: 'absolute', top: 50, right: 12, backgroundColor: BRAND.cream, borderColor: BRAND.navy, borderWidth: 2, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  connText: { fontFamily: FONT.body, fontSize: 11, color: BRAND.navy, letterSpacing: 1 },
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, gap: 16 },
  wrapTitle: { fontFamily: FONT.display, fontSize: 44, color: BRAND.gold, textAlign: 'center', ...outline },
  wrapSub: { fontFamily: FONT.body, fontSize: 18, color: BRAND.white, textAlign: 'center' },
});
