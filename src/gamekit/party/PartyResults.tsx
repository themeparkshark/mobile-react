/**
 * PartyResults: the server's verdict for the micro-round, then the Party
 * Series table. Placements come only from the server replay (VERIFIED), with
 * medals, the crown dropping on the winner, points (FINAL ROUND doubles), and
 * a GHOST tag on any seat a ghost finished. A no-contest round (HOLD over
 * budget, left, desync) reads as a skipped round that best-4-of-5 drops,
 * never as a loss. After round five the series crown drops on the champion.
 * NEXT ROUND votes to go now; the room also starts it on its own.
 */
import { memo, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import GameButton from '../../ui/GameButton';
import GameIcon from '../../ui/GameIcon';
import { BRAND, FONT } from '../../ui/tokens';
import { haptic } from '../Haptics';
import { playSfx } from '../SFX';
import { isDq, isNoContest, type EmoteId, type SeatResult, type SeriesStanding, type SeriesSummary } from '../net/partyTypes';
import { displayName, type PartyState } from '../net/roomState';
import { BOT_SHARK } from './partyArt';
import SeatAvatar from './SeatAvatar';
import EmoteBar, { EmotePop } from './EmoteBar';

export interface PartyResultsProps {
  state: PartyState;
  serverNow: () => number;
  onRematch: () => void;
  onEmote: (id: EmoteId) => void;
  onLeave: () => void;
}

const MEDAL = { 1: 'medal1', 2: 'medal2', 3: 'medal3' } as const;

function CountUp({ to, delay }: { to: number; delay: number }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = Date.now() + delay;
    const tick = () => {
      const p = Math.min(1, Math.max(0, (Date.now() - start) / 650));
      setV(Math.round(to * (1 - (1 - p) ** 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [delay, to]);
  return <Text style={styles.score}>{v.toLocaleString('en-US')}</Text>;
}

function Crown() {
  const y = useSharedValue(-60);
  const r = useSharedValue(-18);
  useEffect(() => {
    y.value = withDelay(500, withSequence(withTiming(4, { duration: 360, easing: Easing.in(Easing.quad) }), withSpring(0, { damping: 6, stiffness: 260 })));
    r.value = withDelay(500, withSpring(0, { damping: 5, stiffness: 180 }));
  }, [r, y]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }, { rotate: `${r.value}deg` }] }));
  return <Animated.View style={[styles.crown, style]}><GameIcon name="crown" size={34} /></Animated.View>;
}

function detailFor(r: SeatResult): string {
  if (isDq(r.verdict)) return 'NOT VERIFIED';
  if (isNoContest(r.verdict)) return r.filled_by === 'ghost' ? 'GHOST FINISHED IT  ·  ROUND SKIPPED' : 'ROUND SKIPPED  ·  BEST 4 COUNT';
  if (r.filled_by === 'ghost') return 'GHOST FINISHED IT';
  if (r.kind === 'bot') return 'HOUSE CREW';
  if (r.stats.hits === undefined) return `${r.stats.maxStreak ?? 0} IN A ROW`;
  return `${r.stats.hits ?? 0} BONKS  ·  BEST STREAK ${r.stats.maxStreak ?? 0}`;
}

function Row({ r, index, me, emote, name }: { r: SeatResult; index: number; me: boolean; emote?: { id: EmoteId; key: string }; name: string }) {
  return (
    <Animated.View entering={FadeInDown.delay(120 * index).springify().damping(14)} style={[styles.row, me && styles.rowMe, r.placement === 1 && styles.rowWin]}>
      <View style={styles.place}>
        {r.placement <= 3 ? <GameIcon name={MEDAL[r.placement as 1 | 2 | 3]} size={34} /> : <Text style={styles.placeText}>{`${r.placement}TH`}</Text>}
      </View>
      <View>
        <SeatAvatar avatarUrl={r.avatar_url} team={r.team} size={50} me={me} ghost={r.filled_by === 'ghost'} bumpKey={emote?.key} />
        {r.placement === 1 ? <Crown /> : null}
        {emote ? <EmotePop key={emote.key} emote={emote.id} size={40} /> : null}
      </View>
      <View style={styles.who}>
        <Text numberOfLines={1} style={[styles.name, me && styles.nameMe]}>{me ? 'YOU' : name}</Text>
        <Text style={styles.detail}>{detailFor(r)}</Text>
      </View>
      <View style={styles.right}>
        <CountUp to={r.score} delay={200 + 120 * index} />
        <Text style={[styles.points, isNoContest(r.verdict) && styles.pointsSkip]}>{isNoContest(r.verdict) ? 'SKIPPED' : `+${r.points} PTS`}</Text>
      </View>
    </Animated.View>
  );
}

function PartyResults({ state, serverNow, onRematch, onEmote, onLeave }: PartyResultsProps) {
  const room = state.room!;
  const results = room.round?.results ?? [];
  const mine = results.find((r) => r.user_id === state.userId);
  const me = room.members.find((m) => m.id === state.userId);
  const [secs, setSecs] = useState<number | null>(null);
  const emoteBy = new Map(state.emotes.map((e) => [e.user_id, { id: e.emote, key: e.key }]));

  useEffect(() => {
    if (!mine) return;
    if (mine.placement === 1) { haptic('success'); playSfx('win'); } else { haptic('tapLight'); playSfx('star', 0.7); }
  }, [mine?.placement, room.round?.id]);

  useEffect(() => {
    const h = setInterval(() => setSecs(room.autostart_at_ms ? Math.max(0, Math.ceil((room.autostart_at_ms - serverNow()) / 1000)) : null), 250);
    return () => clearInterval(h);
  }, [room.autostart_at_ms, serverNow]);

  const series = room.series ?? null;
  const finished = series?.status === 'finished' && series.rounds_played === room.round?.series_round;
  const crowned = finished && series?.crown_user_id === state.userId;
  const headline = finished ? (crowned ? 'SERIES CROWN!' : 'SERIES OVER!')
    : !mine ? 'RESULTS' : isNoContest(mine.verdict) ? 'ROUND SKIPPED' : mine.placement === 1 ? 'YOU WIN!' : mine.placement === 2 ? 'SO CLOSE!' : 'NICE RUN!';
  const nameOf = (userId: number | null | undefined, fallback: string | null | undefined, kind: string) =>
    kind === 'bot' ? fallback ?? 'Crew' : displayName(state, userId, fallback);

  return (
    <View style={styles.wrap}>
      <Animated.Text entering={FadeInDown.springify().damping(12)} style={styles.headline}>{headline}</Animated.Text>
      <View style={styles.verified}>
        <GameIcon name="sparkle" size={18} />
        <Text style={styles.verifiedText}>{room.round?.final ? 'FINAL ROUND  ·  DOUBLE POINTS  ·  VERIFIED' : 'VERIFIED BY THE SERVER REPLAY'}</Text>
      </View>
      {finished && series ? <SeriesCrown series={series} nameOf={nameOf} me={state.userId} /> : (
        <View style={styles.list}>
          {results.map((r, i) => <Row key={r.seat} r={r} index={i} me={r.user_id === state.userId} name={nameOf(r.user_id, r.name, r.kind)} emote={r.user_id ? emoteBy.get(r.user_id) : undefined} />)}
        </View>
      )}
      {series ? <SeriesTable series={series} nameOf={nameOf} me={state.userId} /> : null}
      <View style={styles.buttons}>
        <GameButton label={me?.ready ? 'READY!' : finished ? 'PLAY AGAIN' : 'NEXT ROUND'} icon="retry" onPress={onRematch} disabled={!!me?.ready} />
        {secs !== null ? <Text style={styles.next}>{finished ? `New series in ${secs}s` : `Next round in ${secs}s`}</Text> : null}
      </View>
      <EmoteBar onSend={onEmote} />
      <GameButton label="Leave party" variant="ghost" tone="onBlue" onPress={onLeave} />
    </View>
  );
}

export default memo(PartyResults);

type NameOf = (userId: number | null | undefined, fallback: string | null | undefined, kind: string) => string;

/** The Party Series so far: points per round (best 4 of 5 count; the dropped round fades). */
function SeriesTable({ series, nameOf, me }: { series: SeriesSummary; nameOf: NameOf; me: number | null }) {
  const rows = series.standings.slice(0, 4);
  return (
    <Animated.View entering={FadeInDown.delay(500).springify().damping(14)} style={styles.table}>
      <Text style={styles.tableTitle}>{`PARTY SERIES  ·  ROUND ${series.rounds_played} OF ${series.rounds_total}  ·  BEST ${series.count_best} COUNT`}</Text>
      {rows.map((r) => (
        <View key={r.key} style={[styles.tRow, r.user_id === me && styles.tRowMe]}>
          <Text style={styles.tRank}>{r.rank}</Text>
          <Text numberOfLines={1} style={[styles.tName, r.user_id === me && styles.nameMe]}>{r.user_id === me ? 'YOU' : nameOf(r.user_id, r.name, r.kind)}</Text>
          {r.rounds.map((p, i) => (
            <Text key={i} style={[styles.tCell, i === r.dropped && styles.tDropped, r.no_contest[i] && styles.tSkip, i === series.rounds_total - 1 && styles.tFinal]}>
              {p === null ? '-' : String(p)}
            </Text>
          ))}
          <Text style={styles.tTotal}>{r.points}</Text>
        </View>
      ))}
    </Animated.View>
  );
}

/** Crown ceremony: the champion's shark takes the crown (Supercell-style anticipation, then the drop). */
function SeriesCrown({ series, nameOf, me }: { series: SeriesSummary; nameOf: NameOf; me: number | null }) {
  const champ: SeriesStanding | undefined = series.standings[0];
  const glow = useSharedValue(0);
  const y = useSharedValue(-140);
  const squash = useSharedValue(1);
  useEffect(() => {
    glow.value = withTiming(1, { duration: 300 });
    y.value = withDelay(700, withTiming(0, { duration: 500, easing: Easing.bounce }));
    squash.value = withDelay(1200, withSequence(withTiming(0.86, { duration: 60 }), withSpring(1, { damping: 7, stiffness: 320 })));
    const t = setTimeout(() => { haptic(champ?.user_id === me ? 'success' : 'tapLight'); playSfx(champ?.user_id === me ? 'win' : 'star', 0.9); }, 1200);
    return () => clearTimeout(t);
  }, [champ?.key]);
  const crownStyle = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: glow.value * 0.9, transform: [{ scale: 0.8 + glow.value * 0.4 }] }));
  const sharkStyle = useAnimatedStyle(() => ({ transform: [{ scaleY: squash.value }, { scaleX: 2 - squash.value }] }));
  if (!champ) return null;
  return (
    <View style={styles.ceremony}>
      <Animated.View style={[styles.ray, glowStyle]} />
      <Animated.View style={sharkStyle}>
        {champ.kind === 'bot'
          ? <Animated.Image source={BOT_SHARK[champ.avatar_url ?? ''] ?? BOT_SHARK['bot:captain']} style={styles.champImg} />
          : <SeatAvatar avatarUrl={champ.avatar_url} team={champ.team} size={96} me={champ.user_id === me} />}
      </Animated.View>
      <Animated.View style={[styles.bigCrown, crownStyle]}><GameIcon name="crown" size={64} /></Animated.View>
      <Text style={styles.champName}>{champ.user_id === me ? 'YOU' : nameOf(champ.user_id, champ.name, champ.kind)}</Text>
      <Text style={styles.champPts}>{`${champ.points} SERIES POINTS`}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, paddingHorizontal: 16, paddingBottom: 12, justifyContent: 'space-between' },
  headline: {
    marginTop: 10,
    textAlign: 'center',
    fontFamily: FONT.display,
    fontSize: 44,
    color: BRAND.gold,
    textShadowColor: BRAND.navy,
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 0.1,
  },
  verified: { flexDirection: 'row', alignSelf: 'center', alignItems: 'center', gap: 6, backgroundColor: BRAND.cream, borderColor: BRAND.navy, borderWidth: 2, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 3 },
  verifiedText: { fontFamily: FONT.body, fontSize: 12, color: BRAND.navy, letterSpacing: 1 },
  list: { gap: 8, marginTop: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BRAND.blueBright,
    borderColor: BRAND.navy,
    borderWidth: 3,
    borderRadius: 18,
    paddingVertical: 8,
    paddingHorizontal: 10,
    gap: 10,
  },
  rowMe: { borderColor: BRAND.gold },
  rowWin: { backgroundColor: BRAND.blue },
  place: { width: 40, alignItems: 'center' },
  placeText: { fontFamily: FONT.display, fontSize: 20, color: BRAND.white },
  who: { flex: 1 },
  name: { fontFamily: FONT.display, fontSize: 18, color: BRAND.white, textShadowColor: BRAND.navy, textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0.1 },
  nameMe: { color: BRAND.gold },
  detail: { fontFamily: FONT.body, fontSize: 12, color: BRAND.cream, letterSpacing: 0.6, marginTop: 2 },
  right: { alignItems: 'flex-end' },
  score: { fontFamily: FONT.display, fontSize: 24, color: BRAND.white, textShadowColor: BRAND.navy, textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0.1, fontVariant: ['tabular-nums'] },
  points: { fontFamily: FONT.body, fontSize: 12, color: BRAND.goldLight, letterSpacing: 0.8 },
  pointsSkip: { color: BRAND.cream },
  table: { marginTop: 10, backgroundColor: BRAND.cream, borderColor: BRAND.navy, borderWidth: 3, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 6, gap: 2 },
  tableTitle: { fontFamily: FONT.body, fontSize: 11, color: BRAND.navy, letterSpacing: 0.8, textAlign: 'center', marginBottom: 2 },
  tRow: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 1 },
  tRowMe: { backgroundColor: 'rgba(255,207,59,0.35)', borderRadius: 8 },
  tRank: { width: 16, fontFamily: FONT.display, fontSize: 14, color: BRAND.navy, textAlign: 'center' },
  tName: { flex: 1, fontFamily: FONT.display, fontSize: 14, color: BRAND.navy },
  tCell: { width: 20, fontFamily: FONT.display, fontSize: 14, color: BRAND.navy, textAlign: 'center', fontVariant: ['tabular-nums'] },
  tDropped: { opacity: 0.35, textDecorationLine: 'line-through' },
  tSkip: { color: '#5a88b8' },
  tFinal: { color: '#c98a00' },
  tTotal: { width: 30, fontFamily: FONT.display, fontSize: 16, color: BRAND.blue, textAlign: 'right' },
  ceremony: { alignItems: 'center', justifyContent: 'center', marginTop: 16, height: 250 },
  ray: { position: 'absolute', width: 220, height: 220, borderRadius: 110, backgroundColor: 'rgba(255,248,228,0.5)', borderColor: BRAND.gold, borderWidth: 6 },
  champImg: { width: 110, height: 110, resizeMode: 'contain' },
  bigCrown: { position: 'absolute', top: 18 },
  champName: { marginTop: 10, fontFamily: FONT.display, fontSize: 30, color: BRAND.white, textShadowColor: BRAND.navy, textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 0.1 },
  champPts: { fontFamily: FONT.body, fontSize: 14, color: BRAND.goldLight, letterSpacing: 1 },
  crown: { position: 'absolute', top: -24, left: 8 },
  buttons: { alignItems: 'center', gap: 4, marginTop: 10 },
  next: { fontFamily: FONT.body, fontSize: 14, color: BRAND.white },
});
