/**
 * When the park arrival moment plays, and the "Today" chip it leaves behind.
 *
 * Plays once per park per day (stored per player), the first time the park
 * map is free: after Finn's onboarding and lessons, never over a find, a ride,
 * a boss, a dialog or the daily chest. The map waits for it in turn (the
 * daily chest, the park lesson and Finn's tips hold while it shows), so there
 * is only ever one celebration at a time.
 *
 * The cards come from the map's own coins (already loaded) and one call to the
 * live-parks feed for the boss time; if that call is slow or fails, the moment
 * plays without the boss card rather than waiting.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { getLiveParks } from '../../api/endpoints/me/livePark';
import { queueHaptic } from '../../gamekit/Haptics';
import { BRAND } from '../../ui/tokens';
import GameIcon from '../../ui/GameIcon';
import { TONES, type StatusEntry } from '../map/MapStatusStack';
import ParkArrivalMoment from './ParkArrivalMoment';
import {
  arrivalCards, arrivalSeenToday, markArrivalSeen, parkDayKey,
  type ArrivalBoss, type ArrivalCard, type ArrivalSeen, type ArrivalTask,
} from './parkArrival';

const KEY = (playerId: number) => `tps.parkArrival.v1:${playerId}`;
/** How long the moment waits for the boss feed before playing without it. */
const BOSS_WAIT_MS = 1500;
/** The longest the map holds its other moments for an arrival that has not started. */
const PENDING_MAX_MS = 15_000;

type Projector = (latitude: number, longitude: number) => Promise<{ x: number; y: number } | null>;

let devReset: (() => void) | null = null;
if (__DEV__) {
  // QA: replay today's arrival from the debugger (lane.sh eval 'globalThis.__tpsParkArrivalReset()').
  (globalThis as Record<string, unknown>).__tpsParkArrivalReset = () => { devReset?.(); return 'reset'; };
}

export default function useParkArrival({ playerId, park, tasks, ready, projector }: {
  readonly playerId: number | null | undefined;
  readonly park: { readonly id: number; readonly name?: string | null; readonly display_name?: string | null } | null | undefined;
  /** The map's coins for this park; null while they load. */
  readonly tasks: readonly ArrivalTask[] | null | undefined;
  /** The map is free for a big moment (no tutorial, find, ride, boss, dialog or chest). */
  readonly ready: boolean;
  readonly projector?: MutableRefObject<Projector | null>;
}): { readonly layer: ReactNode; readonly showing: boolean; readonly pending: boolean; readonly todayEntry: StatusEntry | null } {
  const parkId = park?.id ?? null;
  const parkName = (park?.display_name || park?.name || '').trim();
  const [seen, setSeen] = useState<ArrivalSeen | null>(null);
  const [boss, setBoss] = useState<{ parkId: number; value: ArrivalBoss | null } | null>(null);
  const [playing, setPlaying] = useState<{ parkId: number; cards: ArrivalCard[]; replay: boolean } | null>(null);
  const [resetVersion, setResetVersion] = useState(0);
  const day = parkDayKey(new Date());
  const startedFor = useRef<string | null>(null);

  // Load who has seen what today.
  useEffect(() => {
    if (!playerId) { setSeen(null); return; }
    let active = true;
    void AsyncStorage.getItem(KEY(playerId)).then(raw => {
      if (!active) return;
      try { setSeen(raw ? JSON.parse(raw) as ArrivalSeen : {}); } catch { setSeen({}); }
    }).catch(() => { if (active) setSeen({}); });
    return () => { active = false; };
  }, [playerId, resetVersion]);

  useEffect(() => {
    if (!__DEV__ || !playerId) return undefined;
    devReset = () => {
      startedFor.current = null;
      void AsyncStorage.removeItem(KEY(playerId)).then(() => { setSeen({}); setResetVersion(v => v + 1); });
    };
    return () => { devReset = null; };
  }, [playerId]);

  // QA captures: play on every park entry (dev builds only, EXPO_PUBLIC_PARK_ARRIVAL_ALWAYS=1).
  const always = __DEV__ && process.env.EXPO_PUBLIC_PARK_ARRIVAL_ALWAYS === '1';
  const due = !!playerId && parkId !== null && !!parkName && seen !== null && (always || !arrivalSeenToday(seen, parkId, day));

  // The boss time, fetched once per arrival that is due (never on a normal map open).
  useEffect(() => {
    if (!due || parkId === null || boss?.parkId === parkId) return undefined;
    let active = true;
    const timer = setTimeout(() => { if (active) setBoss(current => current?.parkId === parkId ? current : { parkId, value: null }); }, BOSS_WAIT_MS);
    getLiveParks().then(live => { if (active) setBoss({ parkId, value: live.next_boss ?? null }); })
      .catch(() => { if (active) setBoss({ parkId, value: null }); });
    return () => { active = false; clearTimeout(timer); };
  }, [due, parkId, boss?.parkId]);

  const cardsFor = useCallback((bossValue: ArrivalBoss | null) => arrivalCards({
    tasks: tasks ?? [], nextBoss: bossValue, parkNames: [park?.name, park?.display_name], now: new Date(),
  }), [tasks, park?.name, park?.display_name]);

  // Start it: due, the map is free, the coins and the boss answer are in.
  // Each park entry counts (QA "always" mode replays per entry, never in a loop).
  const entry = useRef({ parkId: parkId as number | null, count: 0 });
  if (entry.current.parkId !== parkId) entry.current = { parkId, count: entry.current.count + 1 };
  useEffect(() => {
    if (__DEV__ && process.env.EXPO_PUBLIC_PARK_ARRIVAL_DEBUG === '1') {
      console.log('[arrival]', JSON.stringify({ due, ready, playing: !!playing, parkId, tasks: tasks?.length ?? null, boss: boss?.parkId ?? null, started: startedFor.current }));
    }
    if (!due || !ready || playing || parkId === null || !tasks || boss?.parkId !== parkId || !playerId) return;
    const key = always ? `${playerId}:${parkId}:${day}:${entry.current.count}` : `${playerId}:${parkId}:${day}`;
    if (startedFor.current === key) return;
    startedFor.current = key;
    // Marked first, so a crash or a quick exit never replays it in a loop.
    const next = markArrivalSeen(seen, parkId, day);
    setSeen(next);
    void AsyncStorage.setItem(KEY(playerId), JSON.stringify(next)).catch(() => undefined);
    setPlaying({ parkId, cards: cardsFor(boss.value), replay: false });
  }, [due, ready, playing, parkId, tasks, boss, playerId, day, seen, cardsFor, always]);

  // Leaving the park ends the moment at once.
  useEffect(() => { if (playing && playing.parkId !== parkId) setPlaying(null); }, [parkId, playing]);


  const replay = useCallback(() => {
    if (parkId === null || playing) return;
    queueHaptic('tapLight');
    setPlaying({ parkId, cards: cardsFor(boss?.parkId === parkId ? boss.value : null), replay: true });
  }, [parkId, playing, cardsFor, boss]);

  const todayCards = useMemo(() => (parkId !== null && seen && arrivalSeenToday(seen, parkId, day) ? cardsFor(boss?.parkId === parkId ? boss.value : null) : []),
    [parkId, seen, day, cardsFor, boss]);
  const todayEntry: StatusEntry | null = todayCards.length > 0 && !playing ? {
    key: 'today', label: `Today at ${parkName}`, tone: TONES.park,
    node: <TodayChip parkName={parkName} cards={todayCards} onPress={replay} />,
  } : null;

  const layer = playing ? (
    <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { zIndex: 60 }]}>
      <ParkArrivalMoment key={`${playing.parkId}:${playing.replay ? 'r' : 'f'}`} parkName={parkName} cards={playing.cards}
        projector={projector} replay={playing.replay} onDone={() => setPlaying(null)} />
    </View>
  ) : null;

  // Due and not started yet: Finn's tips and the daily chest wait their turn, but never longer than
  // PENDING_MAX_MS (a map whose coins never load must not hold the chest forever).
  const waiting = due && !playing && !startedFor.current?.startsWith(`${playerId}:${parkId}:${day}`);
  const [gaveUp, setGaveUp] = useState<string | null>(null);
  const waitKey = waiting ? `${playerId}:${parkId}:${day}` : null;
  useEffect(() => {
    if (!waitKey) return undefined;
    const timer = setTimeout(() => setGaveUp(waitKey), PENDING_MAX_MS);
    return () => clearTimeout(timer);
  }, [waitKey]);
  return { layer, showing: !!playing, pending: waiting && gaveUp !== waitKey, todayEntry };
}

/** The "Today" chip in the HUD stack: today's three picture cards, small. Tap to see them again. */
function TodayChip({ parkName, cards, onPress }: {
  readonly parkName: string; readonly cards: readonly ArrivalCard[]; readonly onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Today at ${parkName}. Show again.`} onPress={onPress}
      style={({ pressed }) => [styles.chip, pressed && styles.pressed]}>
      <View style={styles.sun}><GameIcon name="star" size={22} /></View>
      <Text style={styles.label} allowFontScaling={false}>TODAY</Text>
      <View style={styles.icons}>
        {cards.map(card => (
          <View key={card.kind} style={styles.mini}>
            {card.kind === 'limited' ? <GameIcon name="coin" size={22} />
              : card.kind === 'boss' ? <Text style={styles.miniText} allowFontScaling={false}>{card.time}</Text>
                : card.kind === 'new' ? <Text style={styles.miniText} allowFontScaling={false}>{`NEW ${card.count}`}</Text>
                  : <Text style={styles.miniText} allowFontScaling={false}>{card.count}</Text>}
          </View>
        ))}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 54, borderRadius: 16, borderWidth: 3,
    borderColor: BRAND.white, backgroundColor: BRAND.blue, paddingHorizontal: 10 },
  pressed: { transform: [{ scale: 0.94 }] },
  sun: { width: 32, height: 32, borderRadius: 16, backgroundColor: BRAND.cream, alignItems: 'center', justifyContent: 'center' },
  label: { fontFamily: 'Shark', fontSize: 16, color: BRAND.gold, letterSpacing: 0.8 },
  icons: { flex: 1, flexDirection: 'row', justifyContent: 'flex-end', gap: 6 },
  mini: { minWidth: 34, height: 30, borderRadius: 10, backgroundColor: BRAND.cream, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  miniText: { fontFamily: 'Shark', fontSize: 13, color: BRAND.navy },
});
