/**
 * PartyResults: the server's verdict for the round. Placements come only from
 * the server replay (VERIFIED), with medals, the crown dropping on the winner,
 * points, and a GHOST tag on any seat a ghost finished. REMATCH votes for the
 * next round; the room also starts it on its own so nobody waits.
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
import type { EmoteId, SeatResult } from '../net/partyTypes';
import type { PartyState } from '../net/roomState';
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

function Row({ r, index, me, emote }: { r: SeatResult; index: number; me: boolean; emote?: { id: EmoteId; key: string } }) {
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
        <Text numberOfLines={1} style={[styles.name, me && styles.nameMe]}>{me ? 'YOU' : r.name}</Text>
        <Text style={styles.detail}>
          {r.verdict.startsWith('dq_') ? 'NOT VERIFIED' : r.filled_by === 'ghost' ? 'GHOST FINISHED IT' : r.kind === 'bot' ? 'HOUSE CREW'
            : `${r.stats.hits ?? 0} BONKS  ·  BEST STREAK ${r.stats.maxStreak ?? 0}`}
        </Text>
      </View>
      <View style={styles.right}>
        <CountUp to={r.score} delay={200 + 120 * index} />
        <Text style={styles.points}>{`+${r.points} PTS`}</Text>
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

  const headline = !mine ? 'RESULTS' : mine.placement === 1 ? 'YOU WIN!' : mine.placement === 2 ? 'SO CLOSE!' : 'NICE RUN!';

  return (
    <View style={styles.wrap}>
      <Animated.Text entering={FadeInDown.springify().damping(12)} style={styles.headline}>{headline}</Animated.Text>
      <View style={styles.verified}>
        <GameIcon name="sparkle" size={18} />
        <Text style={styles.verifiedText}>VERIFIED BY THE SERVER REPLAY</Text>
      </View>
      <View style={styles.list}>
        {results.map((r, i) => <Row key={r.seat} r={r} index={i} me={r.user_id === state.userId} emote={r.user_id ? emoteBy.get(r.user_id) : undefined} />)}
      </View>
      <View style={styles.buttons}>
        <GameButton label={me?.ready ? 'READY FOR MORE!' : 'REMATCH'} icon="retry" onPress={onRematch} disabled={!!me?.ready} />
        {secs !== null ? <Text style={styles.next}>{`Next race in ${secs}s`}</Text> : null}
      </View>
      <EmoteBar onSend={onEmote} />
      <GameButton label="Leave party" variant="ghost" tone="onBlue" onPress={onLeave} />
    </View>
  );
}

export default memo(PartyResults);

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
  crown: { position: 'absolute', top: -24, left: 8 },
  buttons: { alignItems: 'center', gap: 4, marginTop: 10 },
  next: { fontFamily: FONT.body, fontSize: 14, color: BRAND.white },
});
