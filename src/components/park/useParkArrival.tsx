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
import { getDailyThree } from '../../api/endpoints/retention';
import { loadRetentionFlags } from '../../services/retention/flags';
import { doneCount } from '../../services/retention/logic';
import { queueHaptic } from '../../gamekit/Haptics';
import { BRAND } from '../../ui/tokens';
import GameIcon from '../../ui/GameIcon';
import { TONES, type StatusEntry } from '../map/MapStatusStack';
import ParkArrivalMoment from './ParkArrivalMoment';
import { warmArrivalArt } from './arrivalArt';
import {
  TODAY_CHIP_MS, arrivalCards, arrivalSeenToday, markArrivalSeen, parkDayKey, todayChipFresh,
  type ArrivalBoss, type ArrivalCard, type ArrivalGoal, type ArrivalSeen, type ArrivalTask,
} from './parkArrival';

const KEY = (playerId: number) => `tps.parkArrival.v1:${playerId}`;
/** How long the moment waits for the boss feed before playing without it. */
const BOSS_WAIT_MS = 2200;
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
  const [boss, setBoss] = useState<{ parkId: number; value: ArrivalBoss | null; final: boolean } | null>(null);
  const [playing, setPlaying] = useState<{ parkId: number; cards: ArrivalCard[]; replay: boolean } | null>(null);
  const [goal, setGoal] = useState<ArrivalGoal | null>(null);
  // When this park's arrival last finished (this app run): the Today chip stays in the HUD stack only while fresh.
  const [endedAt, setEndedAt] = useState<{ parkId: number; at: number } | null>(null);
  const [, setTick] = useState(0);
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

  // Due: decode the art now, so the stage's first frame never waits on an image.
  useEffect(() => { if (due) warmArrivalArt(); }, [due]);

  // The boss time and today's Daily 3, fetched once per arrival that is due (never on a normal map open).
  // Keyed by the arrival, not by "due": due turns false the moment the arrival starts, and a fetch still in
  // flight must still land (round 1 lost the boss card and the Daily 3 that way).
  const fetchKey = due && parkId !== null && playerId ? `${playerId}:${parkId}:${day}:${resetVersion}` : null;
  const fetched = useRef<string | null>(null);
  useEffect(() => {
    if (!fetchKey || fetched.current === fetchKey || parkId === null) return undefined;
    fetched.current = fetchKey;
    const forPark = parkId;
    setBoss(current => (current?.parkId === forPark && current.final ? current : null));
    getLiveParks().then(live => setBoss({ parkId: forPark, value: live.next_boss ?? null, final: true }))
      .catch(() => setBoss({ parkId: forPark, value: null, final: true }));
    // Today's Daily 3 (only where the server has it on): one close goal under the cards and on the Today chip.
    const debug = __DEV__ && process.env.EXPO_PUBLIC_PARK_ARRIVAL_DEBUG === '1';
    void loadRetentionFlags().then(flags => {
      if (debug) console.log('[arrival] flags', JSON.stringify(flags));
      if (!flags?.dailyThree) return undefined;
      return getDailyThree(4000).then(state => {
        if (debug) console.log('[arrival] daily3', state.enabled);
        if (!state.enabled) return;
        setGoal({ done: doneCount(state.goals), total: state.goals.length || 3, streak: state.streak.days });
      });
    }).catch(error => { if (debug) console.log('[arrival] goal failed', String(error)); });
    // A slow feed never holds the moment: after BOSS_WAIT_MS it plays without the boss card.
    const timer = setTimeout(() => setBoss(current => (current?.parkId === forPark ? current : { parkId: forPark, value: null, final: false })), BOSS_WAIT_MS);
    return () => clearTimeout(timer);
  }, [fetchKey, parkId]);

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
  // The Today chip keeps today one tap away while it is fresh (it folds away after a while, so the
  // map's HUD row looks like itself again at rest). It never shouts: the stack wears a gold star for it.
  const fresh = endedAt !== null && endedAt.parkId === parkId && todayChipFresh(endedAt.at, Date.now());
  useEffect(() => {
    if (!fresh || !endedAt) return undefined;
    const timer = setTimeout(() => setTick(t => t + 1), Math.max(1000, endedAt.at + TODAY_CHIP_MS - Date.now() + 50));
    return () => clearTimeout(timer);
  }, [fresh, endedAt]);
  const todayEntry: StatusEntry | null = todayCards.length > 0 && !playing && fresh ? {
    key: 'today', label: `Today at ${parkName}`, tone: TONES.park, quiet: true,
    node: <TodayChip parkName={parkName} cards={todayCards} goal={goal} onPress={replay} />,
  } : null;

  const layer = playing ? (
    <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { zIndex: 60 }]}>
      <ParkArrivalMoment key={`${playing.parkId}:${playing.replay ? 'r' : 'f'}`} parkName={parkName} cards={playing.cards}
        goal={goal} projector={projector} replay={playing.replay}
        onDone={() => { setEndedAt({ parkId: playing.parkId, at: Date.now() }); setPlaying(null); }} />
    </View>
  ) : null;

  // Due and not started yet: Finn's tips and the daily chest wait their turn, but never longer than
  // PENDING_MAX_MS (a map whose coins never load must not hold the chest forever).
  // Also while we do not know yet whether today's arrival has played (the seen record is still loading),
  // so the daily chest never opens first and then has the arrival play underneath it.
  const unknown = !!playerId && parkId !== null && !!parkName && seen === null;
  const waiting = (unknown || due) && !playing && !startedFor.current?.startsWith(`${playerId}:${parkId}:${day}`);
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
function TodayChip({ parkName, cards, goal, onPress }: {
  readonly parkName: string; readonly cards: readonly ArrivalCard[]; readonly goal: ArrivalGoal | null; readonly onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Today at ${parkName}. Show again.`} onPress={onPress}
      style={({ pressed }) => [styles.chip, pressed && styles.pressed]}>
      <View style={styles.sun}><GameIcon name="star" size={22} /></View>
      <Text style={styles.label} allowFontScaling={false}>TODAY</Text>
      <View style={styles.icons}>
        {goal && <View style={[styles.mini, styles.goalMini]} accessibilityLabel={`Daily 3: ${goal.done} of ${goal.total}`}>
          <GameIcon name="streak" size={18} />
          {Array.from({ length: goal.total }, (_, i) => <View key={i} style={[styles.pip, i < goal.done && styles.pipDone]} />)}
        </View>}
        {cards.map(card => (
          <View key={card.kind} style={styles.mini}>
            {card.kind === 'limited' ? <GameIcon name="coin" size={22} />
              : card.kind === 'boss' ? <Text style={styles.miniText} allowFontScaling={false}>{card.time}</Text>
                : card.kind === 'new' ? <Text style={styles.miniText} allowFontScaling={false}>{`NEW ${card.count}`}</Text>
                  : <Text style={styles.miniText} allowFontScaling={false}>{`? ${card.count}`}</Text>}
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
  goalMini: { flexDirection: 'row', gap: 3, backgroundColor: BRAND.blueBright, borderWidth: 2, borderColor: BRAND.white },
  pip: { width: 9, height: 9, borderRadius: 5, borderWidth: 1.5, borderColor: BRAND.white },
  pipDone: { backgroundColor: BRAND.gold },
});
