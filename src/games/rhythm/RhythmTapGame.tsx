/**
 * RhythmTapGame.tsx — Rhythm Tap, a GameKit minigame.
 *
 * Contract (master plan Component 3):
 *   - Self-contained under src/games/rhythm/.
 *   - Renders inside GameShellV2, difficulty 1-3 chosen by session context.
 *   - 60-120s rounds, personal best in AsyncStorage, reports {score, maxCombo,
 *     seed} through the shell's onComplete meta.
 *   - Zero network, one-thumb (single tap zone), airplane-mode safe.
 *
 * The feel: targets approach with a shrinking ring; tap when the ring meets the
 * hit zone. Perfect/Great/Good windows are judged in a UI-thread worklet
 * against the ring's own clock (see RhythmField). A silent metronome (haptic +
 * pulsing beat bar) carries the tempo until a bundled music loop lands.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Dimensions, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
  withSpring,
  interpolateColor,
} from 'react-native-reanimated';
import {
  GameShellV2,
  ParticleField,
  Haptic,
  playSfx,
  useCombo,
  useShake,
  GAME_COLORS,
  JUICE,
  type GameResult,
  type ParticleHandle,
} from '../../gamekit';
import {
  BEAT_MS,
  DIFFICULTY,
  JUDGMENT_COLOR,
  JUDGMENT_SCORE,
  RHYTHM_COLORS,
  STAR_THRESHOLDS,
  type Judgment,
} from './constants';
import { buildRound, makeSeed, maxScoreFor } from './patterns';
import { RhythmField } from './RhythmField';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const PB_KEY = 'rhythmTap.personalBest';

export interface RhythmTapGameProps {
  visible: boolean;
  /** Stable seed for a saved LinePlay round; omitted for free play. */
  seed?: number;
  /** 1-3, chosen by the LinePlay session context. Defaults to 2. */
  difficulty?: 1 | 2 | 3;
  /** Short ride sprint or longer LinePlay round. */
  format?: 'ride' | 'queue';
  /** Preserved external contract used by MiniGameSelector. */
  onComplete: (multiplier: number, meta?: Record<string, unknown>) => void;
  onClose: () => void;
  onQuit?: (resume: () => void) => void;
}

interface RoundStats {
  perfect: number;
  great: number;
  good: number;
  miss: number;
}

const EMPTY_STATS: RoundStats = { perfect: 0, great: 0, good: 0, miss: 0 };

export function RhythmTapGame({
  visible,
  seed: roundSeed,
  difficulty = 2,
  format = 'queue',
  onComplete,
  onClose,
  onQuit,
}: RhythmTapGameProps) {
  // -- Round plan (seeded, deterministic → server-replayable). ----------------
  const [seed, setSeed] = useState<number>(() => roundSeed ?? makeSeed());
  const plan = useMemo(() => buildRound(seed, difficulty,
    format === 'ride' ? 5 : undefined, format === 'ride' ? 0 : undefined),
  [seed, difficulty, format]);
  const maxScore = useMemo(() => maxScoreFor(plan), [plan]);

  const [score, setScore] = useState(0);
  const [active, setActive] = useState(false);
  const [result, setResult] = useState<GameResult | null>(null);
  const [personalBest, setPersonalBest] = useState<number | undefined>(undefined);
  const statsRef = useRef<RoundStats>({ ...EMPTY_STATS });
  const scoreRef = useRef(0);
  const resolvedRef = useRef(0); // targets resolved (hit or miss)

  const combo = useCombo();
  const particleRef = useRef<ParticleHandle>(null);
  // JS-thread mirror of fever so the (stable) burst callback can read it
  // without re-creating on every combo change.
  const feverRef = useRef(false);

  // Fever + beat-bar visuals.
  const feverProgress = useSharedValue(0); // 0 → normal, 1 → fever
  const beatPulse = useSharedValue(0);
  // Screen shake for misses (capped at MAX_SHAKE_MS inside the primitive).
  const missShake = useShake();

  // -- Reset on (re)open. -----------------------------------------------------
  useEffect(() => {
    if (!visible) return;
    setSeed(roundSeed ?? makeSeed());
    setScore(0);
    scoreRef.current = 0;
    resolvedRef.current = 0;
    statsRef.current = { ...EMPTY_STATS };
    setResult(null);
    setActive(false);
    combo.reset();
    feverProgress.value = 0;
    AsyncStorage.getItem(PB_KEY)
      .then((v) => setPersonalBest(v ? Number(v) : undefined))
      .catch(() => setPersonalBest(undefined));
    // Warm the SFX pool (no-op silent until audio assets land).
    playSfx('tick', 0);
  }, [visible, roundSeed]); // eslint-disable-line react-hooks/exhaustive-deps

  // Drive fever visuals off the combo state.
  useEffect(() => {
    feverRef.current = combo.fever;
    feverProgress.value = withTiming(combo.fever ? 1 : 0, { duration: 260 });
  }, [combo.fever, feverProgress]);

  // -- Judgment handler (JS thread; called from the field's worklet). ---------
  const handleJudge = useCallback(
    (judgment: Judgment, _deltaMs: number, _targetId: number) => {
      resolvedRef.current += 1;
      statsRef.current[judgment] += 1;

      if (judgment === 'miss') {
        // Shake + streak reset (master-plan miss feedback).
        combo.miss();
        missShake.shake(10, 110);
        Haptic.warning();
        playSfx('fail');
        return;
      }

      // Hit → advance combo, score with the CURRENT multiplier.
      const state = combo.hit();
      const base = JUDGMENT_SCORE[judgment];
      const gained = base * state.multiplier;
      scoreRef.current += gained;
      setScore(scoreRef.current);

      // Feedback per judgment tier.
      if (judgment === 'perfect') {
        Haptic.comboHeavy();
        playSfx('combo');
      } else if (judgment === 'great') {
        Haptic.hitMedium();
        playSfx('hit');
      } else {
        Haptic.tapLight();
        playSfx('tap');
      }
    },
    [combo, missShake],
  );

  // -- Metronome beat (JS thread). --------------------------------------------
  const handleBeat = useCallback(
    (_beatIndex: number) => {
      // Silent metronome: haptic tick + a visible pulse on the beat bar.
      Haptic.tickSelection();
      playSfx('tick', 0.6);
      beatPulse.value = withSequence(
        withTiming(1, { duration: 70 }),
        withSpring(0, JUICE.settleSpring),
      );
    },
    [beatPulse],
  );

  // -- Hit burst (JS thread; called from the field's worklet). ----------------
  const emitBurst = useCallback((x: number, y: number, judgment: Judgment) => {
    const color = JUDGMENT_COLOR[judgment];
    // Fever doubles the particle count (master-plan fever spec).
    const feverMul = feverRef.current ? 2 : 1;
    if (judgment === 'perfect') {
      // Gold + coral burst — the big-hit payoff.
      particleRef.current?.burst({
        x,
        y,
        preset: 'burst',
        count: 26 * feverMul,
        colors: [color, GAME_COLORS.coral],
        size: 8,
      });
    } else if (judgment === 'great') {
      particleRef.current?.burst({ x, y, preset: 'burst', count: 14 * feverMul, colors: [color], size: 6 });
    } else if (judgment === 'good') {
      particleRef.current?.burst({ x, y, preset: 'burst', count: 8 * feverMul, colors: [color], size: 5 });
    }
  }, []);

  // -- Round end. -------------------------------------------------------------
  const finishRound = useCallback(() => {
    if (result) return;
    setActive(false);
    const finalScore = scoreRef.current;
    const s = statsRef.current;
    const frac = maxScore > 0 ? finalScore / maxScore : 0;
    let stars = 0;
    if (frac >= STAR_THRESHOLDS.three) stars = 3;
    else if (frac >= STAR_THRESHOLDS.two) stars = 2;
    else if (frac >= STAR_THRESHOLDS.one) stars = 1;
    // Guarantee at least 1 star if they landed a real groove (avoids a
    // demoralizing 0 on a decent run when the max is generous).
    if (stars === 0 && s.perfect + s.great >= Math.ceil(plan.targets.length * 0.4)) {
      stars = 1;
    }

    const maxCombo = combo.maxStreak;

    // Persist personal best (fire-and-forget; offline-safe).
    if (personalBest == null || finalScore > personalBest) {
      setPersonalBest(finalScore);
      AsyncStorage.setItem(PB_KEY, String(finalScore)).catch(() => undefined);
    }

    setResult({
      score: finalScore,
      stars,
      maxCombo,
      message:
        stars === 3 ? 'FLAWLESS RHYTHM!' : stars === 2 ? 'IN THE POCKET!' : stars === 1 ? 'NICE GROOVE!' : 'OFF-BEAT',
      // meta carries the server-authoritative reward inputs. NEVER a client
      // reward — just the facts the backend needs to replay/verify.
      meta: {
        game: 'rhythm-tap',
        score: finalScore,
        maxCombo,
        seed,
        difficulty,
        perfect: s.perfect,
        great: s.great,
        good: s.good,
        miss: s.miss,
        totalTargets: plan.targets.length,
      },
    });
  }, [result, maxScore, combo.maxStreak, personalBest, seed, difficulty, plan.targets.length]);

  // -- Background + beat-bar animated styles. ---------------------------------
  const feverTintStyle = useAnimatedStyle(() => ({ opacity: feverProgress.value * 0.28 }));

  const beatBarStyle = useAnimatedStyle(() => {
    const feverColor = interpolateColor(
      feverProgress.value,
      [0, 1],
      [RHYTHM_COLORS.beatBar, RHYTHM_COLORS.beatBarFever],
    );
    return {
      transform: [{ scaleY: 1 + beatPulse.value * 0.9 }],
      opacity: 0.5 + beatPulse.value * 0.5,
      backgroundColor: feverColor,
    };
  });

  const onStart = useCallback(() => {
    setActive(true);
  }, []);

  const onPause = useCallback(() => setActive(false), []);
  const onResume = useCallback(() => setActive(true), []);

  const objective = DIFFICULTY[difficulty].label;

  return (
    <GameShellV2
      visible={visible}
      title="Rhythm Tap"
      subtitle={`${DIFFICULTY[difficulty].label} · ${plan.targets.length} hits`}
      score={score}
      multiplier={combo.multiplier}
      fever={combo.fever}
      personalBest={personalBest}
      objective={`Tap when the ring meets the target · ${objective}`}
      result={result}
      onStart={onStart}
      onPause={onPause}
      onResume={onResume}
      onComplete={onComplete}
      onClose={onClose}
      onQuit={onQuit}
    >
      <Animated.View style={[StyleSheet.absoluteFill, styles.bg, missShake.style]}>
        <Image source={require('../../../assets/images/screens/lineplay/rhythm-underwater-stage-v1.png')}
          style={StyleSheet.absoluteFillObject} contentFit="cover" pointerEvents="none" />
        <View style={styles.oceanTint} pointerEvents="none" />
        <Animated.View style={[styles.feverTint, feverTintStyle]} pointerEvents="none" />

        {/* Beat bar — the silent metronome's visible pulse. */}
        <View style={styles.beatBarWrap} pointerEvents="none">
          <Animated.View style={[styles.beatBar, beatBarStyle]} />
          <Text style={styles.beatLabel}>{combo.fever ? 'FEVER' : `${Math.round(60000 / BEAT_MS)} BPM`}</Text>
        </View>

        {/* Play field (rings + judge). */}
        {visible ? (
          <RhythmField
            plan={plan}
            active={active}
            fever={combo.fever}
            onJudge={handleJudge}
            onBeat={handleBeat}
            onFinished={finishRound}
            emitBurst={emitBurst}
          />
        ) : null}
        <View style={styles.hintWrap} pointerEvents="none">
          <Text style={styles.playHint}>TAP WHEN THE RINGS MEET</Text>
        </View>

        {/* Hit-burst particles above the field, below the shell overlays. */}
        <ParticleField
          ref={particleRef}
          width={SCREEN_W}
          height={SCREEN_H}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
      </Animated.View>
    </GameShellV2>
  );
}

const styles = StyleSheet.create({
  bg: { overflow: 'hidden', backgroundColor: '#063d7c' },
  oceanTint: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0, 39, 101, 0.32)' },
  feverTint: { ...StyleSheet.absoluteFillObject, backgroundColor: '#812e76' },
  beatBarWrap: {
    position: 'absolute',
    top: SCREEN_H * 0.14,
    alignSelf: 'center',
    alignItems: 'center',
  },
  beatBar: {
    width: 120,
    height: 8,
    borderRadius: 4,
    backgroundColor: RHYTHM_COLORS.beatBar,
  },
  beatLabel: {
    marginTop: 8,
    color: '#e6faff',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2,
  },
  hintWrap: { position: 'absolute', bottom: 45, alignSelf: 'center',
    backgroundColor: 'rgba(0, 42, 92, 0.72)', borderColor: 'rgba(255,255,255,0.55)',
    borderWidth: 1, borderRadius: 11, paddingHorizontal: 12, paddingVertical: 7 },
  playHint: {
    color: '#fff', fontFamily: 'Shark', fontSize: 15,
    textShadowColor: '#003b76', textShadowOffset: { width: 1, height: 2 }, textShadowRadius: 3 },
});

export default RhythmTapGame;
