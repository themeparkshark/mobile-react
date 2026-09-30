/**
 * PartyLobby: who's in this line's party, who's ready, and when it starts.
 * Four seats; empty ones say the house crew will fill them, so a solo player
 * is never stuck waiting. The lobby starts itself on a timer (a friend who
 * pockets their phone never holds up the race), or when everyone is READY,
 * or when the host taps START NOW.
 */
import { memo, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming, ZoomIn } from 'react-native-reanimated';
import GameButton from '../../ui/GameButton';
import { BRAND, FONT } from '../../ui/tokens';
import type { EmoteId, RoomSnapshot } from '../net/partyTypes';
import type { PartyState } from '../net/roomState';
import SeatAvatar from './SeatAvatar';
import EmoteBar, { EmotePop } from './EmoteBar';
import { SHARKS } from './partyArt';

export interface PartyLobbyProps {
  state: PartyState;
  serverNow: () => number;
  onReady: () => void;
  onStart: () => void;
  onEmote: (id: EmoteId) => void;
  onLeave: () => void;
  title?: string;
}

function useSecondsUntil(ms: number | null | undefined, serverNow: () => number): number | null {
  const [, force] = useState(0);
  useEffect(() => {
    if (!ms) return;
    const h = setInterval(() => force((n) => n + 1), 250);
    return () => clearInterval(h);
  }, [ms]);
  return ms ? Math.max(0, Math.ceil((ms - serverNow()) / 1000)) : null;
}

function ReadyDot({ ready }: { ready: boolean }) {
  return <View style={[styles.dot, { backgroundColor: ready ? BRAND.green : BRAND.creamDeep }]} />;
}

function PartyLobby({ state, serverNow, onReady, onStart, onEmote, onLeave, title = 'LINE PARTY' }: PartyLobbyProps) {
  const room = state.room as RoomSnapshot;
  const me = room.members.find((m) => m.id === state.userId);
  const secs = useSecondsUntil(room.autostart_at_ms, serverNow);
  const isHost = room.host_user_id === state.userId;
  const pulse = useSharedValue(1);
  useEffect(() => {
    pulse.value = withRepeat(withSequence(withTiming(1.06, { duration: 500 }), withTiming(1, { duration: 500 })), -1);
  }, [pulse]);
  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));
  const seats = Array.from({ length: room.capacity }, (_, i) => room.members[i] ?? null);
  const emoteBy = new Map(state.emotes.map((e) => [e.user_id, e]));

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.sub}>BONK RACE  ·  20 SECONDS  ·  SAME BOARD FOR EVERYONE</Text>
      </View>

      <View style={styles.seats}>
        {seats.map((m, i) => (
          <View key={m ? `m${m.id}` : `e${i}`} style={styles.seat}>
            {m ? (
              <Animated.View entering={ZoomIn.springify().damping(12)} style={styles.seatInner}>
                <View>
                  <SeatAvatar avatarUrl={m.avatar_url} team={m.team} size={68} me={m.id === state.userId} away={m.state === 'away'} bumpKey={emoteBy.get(m.id)?.key} />
                  {emoteBy.get(m.id) ? <EmotePop key={emoteBy.get(m.id)!.key} emote={emoteBy.get(m.id)!.emote} size={46} /> : null}
                </View>
                <Text numberOfLines={1} style={[styles.name, m.id === state.userId && styles.nameMe]}>{m.id === state.userId ? 'YOU' : m.name}</Text>
                <View style={styles.readyRow}>
                  <ReadyDot ready={m.ready} />
                  <Text style={styles.readyText}>{m.state === 'away' ? 'AWAY' : m.ready ? 'READY' : 'JOINED'}</Text>
                </View>
              </Animated.View>
            ) : (
              <Animated.View entering={FadeIn} exiting={FadeOut} style={[styles.seatInner, styles.seatEmpty]}>
                <View style={styles.emptyRing}>
                  <Animated.Image source={SHARKS.classic} style={styles.emptyShark} resizeMode="contain" />
                </View>
                <Text style={styles.emptyText}>CREW FILLS IN</Text>
              </Animated.View>
            )}
          </View>
        ))}
      </View>

      <View style={styles.startRow}>
        {secs !== null ? (
          <Animated.View style={[styles.timer, pulseStyle]}>
            <Text style={styles.timerNum}>{secs}</Text>
            <Text style={styles.timerLabel}>STARTS IN</Text>
          </Animated.View>
        ) : null}
        <Text style={styles.hint}>
          {state.connection === 'live' ? 'Play while you walk. The line never pauses the race.' : 'Syncing over the park network...'}
        </Text>
      </View>

      <View style={styles.buttons}>
        <GameButton label={me?.ready ? 'READY!' : 'READY'} onPress={onReady} disabled={!!me?.ready} />
        {isHost ? <GameButton label="START NOW" variant="secondary" onPress={onStart} /> : null}
      </View>

      <EmoteBar onSend={onEmote} />
      <GameButton label="Leave party" variant="ghost" tone="onBlue" onPress={onLeave} />
    </View>
  );
}

export default memo(PartyLobby);

const styles = StyleSheet.create({
  wrap: { flex: 1, paddingHorizontal: 16, paddingBottom: 12, justifyContent: 'space-between' },
  header: { alignItems: 'center', marginTop: 8 },
  title: {
    fontFamily: FONT.display,
    fontSize: 40,
    color: BRAND.white,
    textShadowColor: BRAND.navy,
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 0.1,
    letterSpacing: 1,
  },
  sub: { fontFamily: FONT.body, fontSize: 13, color: BRAND.cream, letterSpacing: 1.2, marginTop: 2 },
  seats: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 18 },
  seat: { width: '24%' },
  seatInner: {
    alignItems: 'center',
    backgroundColor: BRAND.blueBright,
    borderColor: BRAND.navy,
    borderWidth: 3,
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 4,
    minHeight: 150,
  },
  seatEmpty: { backgroundColor: 'rgba(191,229,255,0.35)', borderStyle: 'dashed', borderColor: BRAND.white },
  name: { marginTop: 8, fontFamily: FONT.display, fontSize: 15, color: BRAND.white, textShadowColor: BRAND.navy, textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0.1 },
  nameMe: { color: BRAND.gold },
  readyRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  dot: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: BRAND.navy, marginRight: 4 },
  readyText: { fontFamily: FONT.body, fontSize: 12, color: BRAND.white, letterSpacing: 0.8 },
  emptyRing: { width: 60, height: 60, borderRadius: 30, borderWidth: 3, borderColor: BRAND.white, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', opacity: 0.8 },
  emptyShark: { width: 44, height: 44, opacity: 0.45 },
  emptyText: { marginTop: 10, fontFamily: FONT.body, fontSize: 11, color: BRAND.white, letterSpacing: 0.8, textAlign: 'center' },
  startRow: { alignItems: 'center', marginTop: 10 },
  timer: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: BRAND.gold,
    borderColor: BRAND.navy,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timerNum: { fontFamily: FONT.display, fontSize: 46, lineHeight: 50, color: BRAND.white, textShadowColor: BRAND.goldLip, textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 0.1 },
  timerLabel: { fontFamily: FONT.body, fontSize: 12, color: BRAND.navy, letterSpacing: 1 },
  hint: { marginTop: 10, fontFamily: FONT.body, fontSize: 15, color: BRAND.white, textAlign: 'center' },
  buttons: { alignItems: 'center', gap: 8, marginVertical: 8 },
});
