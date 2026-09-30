/**
 * TriviaSprintBoard: Trivia Duel live inside a Line Party room. Everyone in
 * the line answers the same 3 server-seeded questions on the room clock:
 * tiles are face-down until each unlock, one tap locks, speed is points, the
 * streak multiplies. The server replays the tap log (TriviaSprintSim), so this
 * board's score is advisory only. Walk-safe: taps during the read-lock or on a
 * locked question do nothing.
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { runOnJS } from 'react-native-reanimated';
import { Haptic } from '../Haptics';
import {
  buildQuestions, botTaps, GUARD_MS, questionText, resolve, sprintMultTenths, sprintSpeed,
  type SprintBotProfile, type SprintTap,
} from '../../games/trivia-duel/party/triviaSprint';
import { Tile, type TileState } from '../../games/trivia-duel/ui/Tile';
import { C } from '../../games/trivia-duel/art';
import { CUE, registerDuelAudio, sfx, sfxLadder } from '../../games/trivia-duel/audio';
import { OutlinedText } from '../../games/trivia-duel/ui/Overlays';

export interface TriviaSprintBoardProps {
  seed: number;
  goAt: number;
  durationMs: number;
  perfNow: () => number;
  onTap: (choice: number) => number | null;
  onProgress?: (score: number, streak: number) => void;
  onTick?: (boardMs: number, score: number) => void;
  autoplay?: SprintBotProfile | null;
}

type QPhase = 'wait' | 'read' | 'live' | 'reveal';

function TriviaSprintBoard({ seed, goAt, perfNow, onTap, onProgress, onTick, autoplay }: TriviaSprintBoardProps) {
  registerDuelAudio();
  const qs = useMemo(() => buildQuestions(seed), [seed]);
  const [qi, setQi] = useState(0);
  const [phase, setPhase] = useState<QPhase>('wait');
  const [ticker, setTicker] = useState(200);
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
  const text = questionText(q);

  const tap = useCallback((choice: number) => {
    const qq = qs[qiRef.current];
    if (phaseRef.current !== 'live') return;
    if (mine.picks[qq.id] >= 0 || resolve(qs, taps.current).picks[qq.id] >= 0) return;
    const t = onTap(choice);
    if (t === null || t < qq.unlockAt + GUARD_MS) return;
    taps.current.push([t, choice]);
    sfx(CUE.lockIn);
    Haptic.hitMedium();
  }, [mine.picks, onTap, qs]);
  const tapRef = useRef(tap);
  tapRef.current = tap;
  const onJSTap = useCallback((i: number) => tapRef.current(i), []);
  const onTapUI = useCallback((i: number) => {
    'worklet';
    runOnJS(onJSTap)(i);
  }, [onJSTap]);

  useEffect(() => {
    let raf = 0;
    let lastSec = -1;
    const frame = () => {
      const t = perfNow() - goAt;
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
            sfxLadder(CUE.correct, sprintSpeed(r.reactions[cq.id]) >= 70 ? 1 : 0);
            Haptic.success();
            setFlyUp(`+${pts}`);
          } else if (r.picks[cq.id] >= 0) {
            sfx(CUE.wrong, { volume: 0.55 });
            Haptic.comboHeavy();
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
        setTicker(100 + sprintSpeed(elapsed));
        const sec = Math.ceil((cq.closeAt - t) / 1000);
        if (sec <= 3 && sec !== lastSec) { lastSec = sec; sfx(CUE.tickHeavy, { volume: 0.6 }); }
      }
      while (autoIdx.current < auto.length && auto[autoIdx.current][0] <= t) {
        tapRef.current(auto[autoIdx.current][1]);
        autoIdx.current += 1;
      }
      onTick?.(t, lastScore.current);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [auto, goAt, onProgress, onTick, perfNow, qs]);

  const picked = mine.picks[q.id];
  const tileW = (width - 12) / (q.choices === 2 ? 2 : 1);
  const states: TileState[] = Array.from({ length: q.choices }, (_, i) => {
    if (phase === 'wait' || phase === 'read') return 'down';
    if (phase === 'reveal') return i === q.correct ? 'correct' : i === picked ? 'wrong' : 'reveal-dim';
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
          {streakNow >= 2 ? <Text style={styles.streak}>{`x${(sprintMultTenths(streakNow + 1) / 10).toFixed(1)}`}</Text> : null}
        </View>
        <Text style={styles.q} numberOfLines={3}>{text.prompt}</Text>
        {phase === 'read' ? <View style={styles.readBar} /> : null}
      </View>
      <View style={[styles.tiles, { flexDirection: q.choices === 2 ? 'row' : 'column' }]}>
        {text.choices.map((c, i) => (
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
              bar={-1}
              wiggleKey={0}
              reducedMotion={false}
              fontSize={c.length > 24 ? 16 : 19}
              chomped={false}
              frost={false}
              rim={streakNow >= 3 ? 3 : 0}
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
