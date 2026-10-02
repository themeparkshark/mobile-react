/**
 * TriviaSprintBoard: Trivia Duel live inside a Line Party room (sim
 * trivia_sprint v3). Everyone in the line answers the same 3 seeded questions
 * on the room's beat grid: tiles are face-down until each unlock, one tap
 * locks, speed is points (500 inside the 4-beat floor, down to 200 at close),
 * and a streak adds a flat bonus. Each phone shows the tiles in its own order
 * (tileOrder); the log always carries the canonical choice as code 10 + index.
 * The room replays the tap log, so this board's score is advisory only.
 * Walk-safe: taps during the read-lock or on a locked question do nothing.
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { runOnJS } from 'react-native-reanimated';
import { Haptic } from '../Haptics';
import {
  ANSWER_CODE, buildQuestions, botTaps, GUARD_MS, questionText, resolve, sprintSpeed, STREAK_BONUS, tileOrder,
  type SprintBotProfile, type SprintTap,
} from '../../games/trivia-duel/party/triviaSprint';
import { Tile, type TileState } from '../../games/trivia-duel/ui/Tile';
import { genericize } from '../../games/trivia-duel/engine/labels';
import { C } from '../../games/trivia-duel/art';
import { CUE, registerDuelAudio, sfx, sfxLadder } from '../../games/trivia-duel/audio';
import { OutlinedText } from '../../games/trivia-duel/ui/Overlays';

export interface TriviaSprintBoardProps {
  seed: number;
  /** This player's id: seeds the per-player tile order. */
  userId?: number;
  goAt: number;
  durationMs: number;
  perfNow: () => number;
  /** Records a log code (10 + canonical choice); returns the board ms it was logged at, or null. */
  onTap: (code: number) => number | null;
  onProgress?: (score: number, streak: number) => void;
  onTick?: (boardMs: number, score: number) => void;
  autoplay?: SprintBotProfile | null;
  /** Board ms since GO from the PartyClient: frozen during this phone's personal HOLD. */
  boardClock?: () => number | null;
}

type QPhase = 'wait' | 'read' | 'live' | 'reveal';

function TriviaSprintBoard({ seed, userId = 0, goAt, perfNow, onTap, onProgress, onTick, autoplay, boardClock }: TriviaSprintBoardProps) {
  registerDuelAudio();
  const qs = useMemo(() => buildQuestions(seed), [seed]);
  const [qi, setQi] = useState(0);
  const [phase, setPhase] = useState<QPhase>('wait');
  const [ticker, setTicker] = useState(500);
  const [width, setWidth] = useState(360);
  const [flyUp, setFlyUp] = useState<string | null>(null);
  const taps = useRef<SprintTap[]>([]);
  const lastScore = useRef(0);
  const auto = useMemo(() => (autoplay ? botTaps(qs, seed, 23, autoplay) : []), [autoplay, qs, seed]);
  const autoIdx = useRef(0);
  const phaseRef = useRef<QPhase>('wait');
  const qiRef = useRef(0);

  const result = useCallback(() => resolve(qs, taps.current), [qs]);
  const mine = result();
  const q = qs[qi];
  // No trademarked names in Trivia UI (rev 7, 19.2): the sim keeps its fact ids, the screen shows generic labels.
  const raw = questionText(q);
  const text = { prompt: genericize(raw.prompt), choices: raw.choices.map((c) => { const g = genericize(c); return g ? g[0].toUpperCase() + g.slice(1) : g; }) };
  // order[slot] = canonical choice shown in that slot (display only).
  const orders = useMemo(() => qs.map((x) => tileOrder(seed, x, userId)), [qs, seed, userId]);
  const order = orders[qi];

  /** `choice` is canonical (the slot was already mapped through tileOrder). */
  const tap = useCallback((choice: number) => {
    const qq = qs[qiRef.current];
    if (phaseRef.current !== 'live') return;
    if (choice < 0 || choice >= qq.choices) return;
    if (mine.picks[qq.id] >= 0 || resolve(qs, taps.current).picks[qq.id] >= 0) return;
    const t = onTap(ANSWER_CODE + choice);
    if (t === null || t < qq.unlockAt + GUARD_MS) return;
    taps.current.push([t, ANSWER_CODE + choice]);
    sfx(CUE.lockIn);
    Haptic.hitMedium();
  }, [mine.picks, onTap, qs]);
  const tapRef = useRef(tap);
  tapRef.current = tap;
  const ordersRef = useRef(orders);
  ordersRef.current = orders;
  const onJSTap = useCallback((slot: number) => tapRef.current(ordersRef.current[qiRef.current]?.[slot] ?? -1), []);
  const onTapUI = useCallback((i: number) => {
    'worklet';
    runOnJS(onJSTap)(i);
  }, [onJSTap]);

  useEffect(() => {
    let raf = 0;
    let lastSec = -1;
    const frame = () => {
      const t = boardClock?.() ?? perfNow() - goAt;
      let idx = 0;
      for (let k = 0; k < qs.length; k++) if (t >= qs[k].showAt) idx = k;
      const cq = qs[idx];
      const ph: QPhase = t < cq.showAt ? 'wait' : t < cq.unlockAt ? 'read' : t < cq.closeAt ? 'live' : 'reveal';
      if (idx !== qiRef.current) { qiRef.current = idx; setQi(idx); }
      if (ph !== phaseRef.current) {
        const prev = phaseRef.current;
        phaseRef.current = ph;
        setPhase(ph);
        if (ph === 'live') { sfx(CUE.unlock); Haptic.tickSelection(); }
        if (ph === 'reveal' && prev !== 'reveal') {
          const r = resolve(qs, taps.current);
          const pts = r.points[cq.id];
          if (pts > 0) {
            sfxLadder(CUE.correct, sprintSpeed(r.reactions[cq.id], cq.closeAt - cq.unlockAt) >= 400 ? 1 : 0);
            // Trivia haptic signature: correct rises (success, then a medium hit), wrong is one soft bump.
            Haptic.success();
            setTimeout(() => Haptic.hitMedium(), 120);
            setFlyUp(`+${pts}`);
          } else if (r.picks[cq.id] >= 0) {
            sfx(CUE.wrong, { volume: 0.55 });
            Haptic.hitSoft();
            setFlyUp(null);
          }
          if (r.score !== lastScore.current) {
            lastScore.current = r.score;
            let streak = 0;
            for (const x of qs) streak = r.picks[x.id] === x.correct ? streak + 1 : x.showAt <= t ? 0 : streak;
            onProgress?.(r.score, streak);
          }
        }
      }
      if (ph === 'live') {
        const elapsed = t - cq.unlockAt;
        setTicker(sprintSpeed(Math.max(0, elapsed), cq.closeAt - cq.unlockAt));
        const sec = Math.ceil((cq.closeAt - t) / 1000);
        if (sec <= 3 && sec !== lastSec) { lastSec = sec; sfx(CUE.tickHeavy, { volume: 0.6 }); }
      }
      while (autoIdx.current < auto.length && auto[autoIdx.current][0] <= t) {
        tapRef.current(auto[autoIdx.current][1] - ANSWER_CODE);
        autoIdx.current += 1;
      }
      onTick?.(t, lastScore.current);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [auto, boardClock, goAt, onProgress, onTick, perfNow, qs]);

  const pickedCanon = mine.picks[q.id];
  const picked = pickedCanon >= 0 ? order.indexOf(pickedCanon) : -1;
  const correctSlot = order.indexOf(q.correct);
  const tileW = (width - 12) / (q.choices === 2 ? 2 : 1);
  const states: TileState[] = Array.from({ length: q.choices }, (_, i) => {
    if (phase === 'wait' || phase === 'read') return 'down';
    if (phase === 'reveal') return i === correctSlot ? 'correct' : i === picked ? 'wrong' : 'reveal-dim';
    if (picked >= 0) return i === picked ? 'locked' : 'dim';
    return 'up';
  });
  const streakNow = (() => {
    let s = 0;
    for (const x of qs) { if (x.id > q.id) break; s = mine.picks[x.id] === x.correct ? s + 1 : 0; }
    return s;
  })();

  return (
    <View style={styles.root} onLayout={(e) => setWidth(e.nativeEvent.layout.width - 24)}>
      <View style={styles.card}>
        <View style={styles.head}>
          <Text style={styles.round}>{`QUESTION ${qi + 1} OF ${qs.length}`}</Text>
          {phase === 'live' && picked < 0 ? <Text style={styles.ticker}>{`+${ticker}`}</Text> : null}
          {streakNow >= 1 ? <Text style={styles.streak}>{`STREAK +${STREAK_BONUS[Math.min(streakNow + 1, STREAK_BONUS.length - 1)]}`}</Text> : null}
        </View>
        <Text style={styles.q} numberOfLines={3}>{text.prompt}</Text>
        {phase === 'read' ? <View style={styles.readBar} /> : null}
      </View>
      <View style={[styles.tiles, { flexDirection: q.choices === 2 ? 'row' : 'column' }]}>
        {order.map((canon) => text.choices[canon]).map((c, i) => (
          <View key={`${q.id}-${i}`} style={{ margin: 6 }}>
            <Tile
              index={i}
              label={c}
              state={states[i]}
              width={tileW - 12}
              height={q.choices === 2 ? 130 : 70}
              onTapUI={onTapUI}
              flipDelay={i * 30}
              heads={[]}
              share={-1}
              wiggleKey={0}
              reducedMotion={false}
              fontSize={c.length > 24 ? 16 : 19}
              chomped={false}
            />
          </View>
        ))}
      </View>
      {phase === 'reveal' && flyUp ? <OutlinedText text={flyUp} size={40} color={C.gold} width={2.5} style={styles.fly} /> : null}
    </View>
  );
}

export default memo(TriviaSprintBoard);

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 12, justifyContent: 'flex-end', paddingBottom: 8 },
  card: { backgroundColor: '#ffffff', borderRadius: 20, borderWidth: 3, borderColor: C.ink, borderBottomWidth: 7, padding: 12, marginBottom: 10 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  round: { fontFamily: 'Knockout', fontSize: 15, color: C.blue },
  ticker: { fontFamily: 'Knockout', fontSize: 22, color: C.goldDeep },
  streak: { fontFamily: 'Shark', fontSize: 18, color: C.coral },
  q: { fontSize: 19, lineHeight: 24, fontWeight: '800', color: C.navy, marginTop: 4, minHeight: 50 },
  readBar: { height: 5, borderRadius: 3, backgroundColor: C.gold, marginTop: 6 },
  tiles: { alignItems: 'center', justifyContent: 'center' },
  fly: { position: 'absolute', alignSelf: 'center', top: '30%' },
});
