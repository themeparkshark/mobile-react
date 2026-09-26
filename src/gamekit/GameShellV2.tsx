/**
 * GameShellV2.tsx — the successor to the 1142-line MiniGameShell.
 *
 * Responsibilities (games stay thin and just render their play field):
 *   - Consistent header (title, subtitle, live score, close).
 *   - 3-2-1-GO countdown (tap to skip).
 *   - Instant pause: a pause button + pause sheet with Resume / Quit. Also
 *     exposes requestPause() via ref so a LinePlay "line's moving" event can
 *     freeze the game from outside.
 *   - Results screen: score → 1-3 stars → server-reward handoff → confetti.
 *   - Preserves the EXACT external completion contract used by
 *     MiniGameSelector: onComplete(multiplier: number, meta?) where multiplier
 *     is derived from stars (1★=1x, 2★=1.5x, 3★=2x by default, overridable).
 *
 * Phase model is owned INTERNALLY (unlike MiniGameShell, which pushed phase
 * up to each game). Games drive the shell with declarative props + a small
 * imperative ref, keeping game files short.
 */

import React, {
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  Dimensions,
  Modal,
  AppState,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withSequence,
  withDelay,
  runOnJS,
  Easing,
} from 'react-native-reanimated';
import { GAME_COLORS, COUNTDOWN, JUICE, LINE_MOVING_TOAST } from './theme';
import { ScoreDisplay } from './ScoreDisplay';
import { ParticleField, type ParticleHandle } from './Particles';
import { Haptic } from './Haptics';
import { playSfx } from './SFX';
import { LinePlayMovementContext } from './LinePlayMovementContext';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

export type ShellPhase = 'countdown' | 'playing' | 'paused' | 'results';

/** Result a game hands to the shell when the round ends. */
export interface GameResult {
  /** Final score. */
  score: number;
  /** 0-3 stars. 0 = failed. */
  stars: number;
  /** Optional headline, e.g. "INCREDIBLE!". Shell supplies a default. */
  message?: string;
  /** Best combo reached (surfaced on the results screen). */
  maxCombo?: number;
  /**
   * Extra metadata forwarded verbatim as the 2nd arg of onComplete — this is
   * what carries {score, duration, seed} to the server-authoritative reward
   * path. Never compute rewards on the client.
   */
  meta?: Record<string, unknown>;
}

export interface GameShellV2Handle {
  /** Freeze the game and show the pause sheet (e.g. line started moving). */
  requestPause: (reason?: string) => void;
  resume: () => void;
  /** Current phase (read on demand). */
  getPhase: () => ShellPhase;
}

interface GameShellV2Props {
  visible: boolean;
  title: string;
  subtitle?: string;
  /** Live score shown in the header. */
  score: number;
  multiplier?: number;
  fever?: boolean;
  /** Personal best for the header delta flash. */
  personalBest?: number;
  /** Short objective line shown under the countdown. */
  objective?: string;
  /** Set when the round is over → shell transitions to results. */
  result?: GameResult | null;
  /** Stars → multiplier map. Defaults to {1:1, 2:1.5, 3:2}. */
  starMultipliers?: Record<number, number>;
  /** Fired when the countdown finishes and play should begin. */
  onStart: () => void;
  /** Fired when the shell pauses / resumes (games should freeze their loop). */
  onPause?: (reason?: string) => void;
  onResume?: () => void;
  /** Preserved external contract — matches MiniGameSelector's expectation. */
  onComplete: (multiplier: number, meta?: Record<string, unknown>) => void;
  /** Player closed / quit without a win. */
  onClose: () => void;
  /** Optional deliberate-exit flow. Failed results still use onClose. */
  onQuit?: (resume: () => void) => void;
  children: React.ReactNode;
}

const DEFAULT_STAR_MULT: Record<number, number> = { 0: 0, 1: 1, 2: 1.5, 3: 2 };

export const GameShellV2 = forwardRef<GameShellV2Handle, GameShellV2Props>(
  function GameShellV2(
    {
      visible,
      title,
      subtitle,
      score,
      multiplier = 1,
      fever = false,
      personalBest,
      objective,
      result,
      starMultipliers = DEFAULT_STAR_MULT,
      onStart,
      onPause,
      onResume,
      onComplete,
      onClose,
      onQuit,
      children,
    },
    ref,
  ) {
    const [phase, setPhase] = useState<ShellPhase>('countdown');
    const linePlayMovement = useContext(LinePlayMovementContext);
    const [countText, setCountText] = useState('3');
    const [pauseReason, setPauseReason] = useState<string | undefined>();
    const confettiRef = useRef<ParticleHandle>(null);
    const startedRef = useRef(false);
    const claimedRef = useRef(false);
    const countdownTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

    // Results animation values.
    const resultsScale = useSharedValue(0.7);
    const resultsOpacity = useSharedValue(0);
    const countScale = useSharedValue(1);

    const clearCountdown = useCallback(() => {
      countdownTimers.current.forEach(clearTimeout);
      countdownTimers.current = [];
    }, []);

    // -- Reset when (re)opened. ---------------------------------------------
    useEffect(() => {
      if (!visible) return;
      startedRef.current = false;
      claimedRef.current = false;
      setPhase('countdown');
      setCountText('3');
      resultsScale.value = 0.7;
      resultsOpacity.value = 0;
      return clearCountdown;
    }, [visible, clearCountdown, resultsScale, resultsOpacity]);

    // -- Run the 3-2-1-GO countdown. ----------------------------------------
    const beginPlay = useCallback(() => {
      if (startedRef.current) return;
      startedRef.current = true;
      setPhase('playing');
      onStart();
    }, [onStart]);

    const punchCount = useCallback(() => {
      countScale.value = withSequence(
        withTiming(1.25, { duration: 100 }),
        withSpring(1, JUICE.popSpring),
      );
    }, [countScale]);

    useEffect(() => {
      if (phase !== 'countdown' || !visible) return;
      clearCountdown();
      const steps = ['3', '2', '1', 'GO!'];
      steps.forEach((label, i) => {
        const t = setTimeout(() => {
          setCountText(label);
          punchCount();
          Haptic.tickSelection();
          playSfx(label === 'GO!' ? 'go' : 'countdown');
        }, i * COUNTDOWN.stepMs);
        countdownTimers.current.push(t);
      });
      const done = setTimeout(() => {
        beginPlay();
      }, steps.length * COUNTDOWN.stepMs - (COUNTDOWN.stepMs - COUNTDOWN.goMs));
      countdownTimers.current.push(done);
      return clearCountdown;
    }, [phase, visible, beginPlay, clearCountdown, punchCount]);

    // -- Transition to results when the game reports one. -------------------
    useEffect(() => {
      if (!result) return;
      if (phase === 'results') return;
      clearCountdown();
      setPhase('results');
      Haptic[result.stars > 0 ? 'success' : 'failBuzz']();
      playSfx(result.stars > 0 ? 'win' : 'lose');
      resultsOpacity.value = withTiming(1, { duration: 220 });
      resultsScale.value = withSpring(1, JUICE.settleSpring);
      if (result.stars > 0) {
        // Confetti bursts staggered from the top.
        setTimeout(() => {
          confettiRef.current?.burst({ x: SCREEN_W * 0.5, y: SCREEN_H * 0.32, preset: 'confetti', count: 40 });
        }, 180);
        setTimeout(() => {
          confettiRef.current?.burst({ x: SCREEN_W * 0.3, y: SCREEN_H * 0.28, preset: 'confetti', count: 24 });
          confettiRef.current?.burst({ x: SCREEN_W * 0.7, y: SCREEN_H * 0.28, preset: 'confetti', count: 24 });
        }, 420);
      }
    }, [result, phase, clearCountdown, resultsOpacity, resultsScale]);

    // -- Pause / resume. -----------------------------------------------------
    const doPause = useCallback(
      (reason?: string) => {
        if (phase !== 'playing' && phase !== 'countdown') return;
        if (phase === 'countdown') clearCountdown();
        setPhase('paused');
        setPauseReason(reason);
        if (phase === 'playing') onPause?.(reason);
        Haptic.tickSelection();
      },
      [onPause, phase, clearCountdown],
    );

    const doResume = useCallback(() => {
      if (phase !== 'paused') return;
      setPhase(startedRef.current ? 'playing' : 'countdown');
      if (!startedRef.current) setCountText('3');
      setPauseReason(undefined);
      linePlayMovement?.onResume();
      if (startedRef.current) onResume?.();
      Haptic.tickSelection();
    }, [onResume, phase, linePlayMovement]);

    useEffect(() => {
      if (visible && linePlayMovement?.moving && (phase === 'playing' || phase === 'countdown')) {
        doPause(LINE_MOVING_TOAST);
      }
    }, [visible, linePlayMovement?.moving, phase, doPause]);

    useEffect(() => {
      if (!visible) return;
      const subscription = AppState.addEventListener('change', state => {
        if (state !== 'active') doPause('Paused while away');
      });
      return () => subscription.remove();
    }, [visible, doPause]);

    useImperativeHandle(
      ref,
      (): GameShellV2Handle => ({
        requestPause: (reason) => doPause(reason ?? LINE_MOVING_TOAST),
        resume: doResume,
        getPhase: () => phase,
      }),
      [doPause, doResume, phase],
    );

    // -- Completion: stars → multiplier → external contract. ----------------
    const handleClaim = useCallback(() => {
      if (claimedRef.current || !result) return;
      claimedRef.current = true;
      const stars = result?.stars ?? 0;
      const mult = starMultipliers[stars] ?? DEFAULT_STAR_MULT[stars] ?? 0;
      if (stars > 0) {
        onComplete(mult, result?.meta);
      } else {
        onClose();
      }
    }, [result, starMultipliers, onComplete, onClose]);

    const resumeAfterQuitCancel = useCallback(() => {
      setPhase(startedRef.current ? 'playing' : 'countdown');
      if (!startedRef.current) setCountText('3');
      setPauseReason(undefined);
      if (startedRef.current) onResume?.();
    }, [onResume]);

    const requestQuit = useCallback(() => {
      if (onQuit) onQuit(resumeAfterQuitCancel);
      else onClose();
    }, [onQuit, onClose, resumeAfterQuitCancel]);

    const handleExit = useCallback(() => {
      if (phase === 'playing') doPause();
      else if (phase === 'results') handleClaim();
      else {
        if (phase === 'countdown') doPause();
        requestQuit();
      }
    }, [phase, doPause, handleClaim, requestQuit]);

    const skipCountdown = useCallback(() => {
      if (phase === 'countdown') {
        clearCountdown();
        beginPlay();
      }
    }, [phase, clearCountdown, beginPlay]);

    const resultsStyle = useAnimatedStyle(() => ({
      opacity: resultsOpacity.value,
      transform: [{ scale: resultsScale.value }],
    }));
    const countStyle = useAnimatedStyle(() => ({
      transform: [{ scale: countScale.value }],
    }));

    const stars = result?.stars ?? 0;
    const won = stars > 0;
    const defaultMessage = won
      ? stars === 3
        ? 'INCREDIBLE!'
        : stars === 2
          ? 'GREAT!'
          : 'NICE!'
      : 'TRY AGAIN';

    if (!visible) return null;

    return (
      <Modal visible={visible} animationType="fade" transparent statusBarTranslucent onRequestClose={handleExit}>
        <View style={styles.root}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={handleExit}
              hitSlop={12}
            >
              <Text style={styles.iconTxt}>{phase === 'playing' ? 'II' : '✕'}</Text>
            </TouchableOpacity>
            <View style={styles.headerCenter}>
              <Text style={styles.title} numberOfLines={1}>
                {title}
              </Text>
              {subtitle ? (
                <Text style={styles.subtitle} numberOfLines={1}>
                  {subtitle}
                </Text>
              ) : null}
            </View>
            <View style={styles.headerScore}>
              <ScoreDisplay
                score={score}
                multiplier={multiplier}
                fever={fever}
                personalBest={personalBest}
                compact
              />
            </View>
          </View>

          {/* Play field */}
          <View style={styles.field}>{children}</View>

          {/* Countdown overlay */}
          {phase === 'countdown' ? (
            <Pressable style={styles.overlay} onPress={skipCountdown}>
              <Animated.Text style={[styles.count, countStyle]}>{countText}</Animated.Text>
              {objective ? <Text style={styles.objective}>{objective}</Text> : null}
              <Text style={styles.skipHint}>tap to skip</Text>
            </Pressable>
          ) : null}

          {/* Pause sheet */}
          {phase === 'paused' ? (
            <View style={styles.overlay}>
              <View style={styles.sheet}>
                <Text style={styles.sheetTitle}>{pauseReason ?? 'Paused'}</Text>
                <TouchableOpacity style={[styles.sheetBtn, styles.primaryBtn]} onPress={doResume}>
                  <Text style={styles.primaryBtnTxt}>Resume</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.sheetBtn} onPress={requestQuit}>
                  <Text style={styles.secondaryBtnTxt}>Quit</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}

          {/* Results */}
          {phase === 'results' ? (
            <View style={styles.overlay} pointerEvents="box-none">
              <Animated.View style={[styles.resultsCard, resultsStyle]}>
                <Text style={[styles.resultsMsg, won ? styles.msgWin : styles.msgFail]}>
                  {result?.message ?? defaultMessage}
                </Text>
                <StarRow stars={stars} />
                <ScoreDisplay
                  score={result?.score ?? score}
                  personalBest={personalBest}
                  label="SCORE"
                />
                {result?.maxCombo && result.maxCombo > 1 ? (
                  <Text style={styles.comboLine}>Best combo x{result.maxCombo}</Text>
                ) : null}
                <TouchableOpacity
                  style={[styles.sheetBtn, styles.primaryBtn, styles.claimBtn]}
                  onPress={handleClaim}
                >
                  <Text style={styles.primaryBtnTxt}>{won ? 'Continue' : 'Close'}</Text>
                </TouchableOpacity>
              </Animated.View>
            </View>
          ) : null}

          {/* Confetti sits above everything, ignores touches. */}
          <ParticleField
            ref={confettiRef}
            width={SCREEN_W}
            height={SCREEN_H}
            style={styles.confetti}
            pointerEvents="none"
          />
        </View>
      </Modal>
    );
  },
);

// -- Animated star row. -------------------------------------------------------

function StarRow({ stars }: { stars: number }) {
  return (
    <View style={styles.starRow}>
      {[1, 2, 3].map((n) => (
        <Star key={n} index={n} filled={n <= stars} />
      ))}
    </View>
  );
}

function Star({ index, filled }: { index: number; filled: boolean }) {
  const scale = useSharedValue(0);
  useEffect(() => {
    if (filled) {
      scale.value = withDelay(
        200 + index * 160,
        withSequence(
          withTiming(1.4, { duration: 140, easing: Easing.out(Easing.back(2)) }),
          withSpring(1, JUICE.popSpring, (finished) => {
            'worklet';
            if (finished) runOnJS(popStarHaptic)();
          }),
        ),
      );
    } else {
      scale.value = withTiming(1, { duration: 200 });
    }
  }, [filled, index, scale]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Animated.Text
      style={[styles.star, { color: filled ? GAME_COLORS.star : GAME_COLORS.starEmpty }, style]}
    >
      ★
    </Animated.Text>
  );
}

function popStarHaptic() {
  Haptic.hitMedium();
  playSfx('star');
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: GAME_COLORS.bgDeep,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 54,
    paddingBottom: 12,
    paddingHorizontal: 16,
    backgroundColor: GAME_COLORS.bgDark,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: GAME_COLORS.bgPanel,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconTxt: { color: GAME_COLORS.text, fontSize: 16, fontWeight: '900' },
  headerCenter: { flex: 1, paddingHorizontal: 10 },
  title: { color: GAME_COLORS.text, fontSize: 18, fontWeight: '900' },
  subtitle: { color: GAME_COLORS.textDim, fontSize: 12, fontWeight: '600' },
  headerScore: { minWidth: 70, alignItems: 'flex-end' },
  field: { flex: 1 },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(5,10,30,0.72)',
  },
  count: {
    color: GAME_COLORS.gold,
    fontSize: 120,
    fontWeight: '900',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 12,
  },
  objective: {
    color: GAME_COLORS.text,
    fontSize: 16,
    fontWeight: '700',
    marginTop: 8,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  skipHint: { color: GAME_COLORS.textFaint, fontSize: 12, marginTop: 18, letterSpacing: 1 },
  sheet: {
    width: '80%',
    backgroundColor: GAME_COLORS.bgPanel,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
  },
  sheetTitle: { color: GAME_COLORS.text, fontSize: 22, fontWeight: '900', marginBottom: 18 },
  sheetBtn: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 10,
  },
  primaryBtn: { backgroundColor: GAME_COLORS.gold },
  primaryBtnTxt: { color: GAME_COLORS.navy, fontSize: 17, fontWeight: '900' },
  secondaryBtnTxt: { color: GAME_COLORS.textDim, fontSize: 15, fontWeight: '700' },
  resultsCard: {
    width: '84%',
    backgroundColor: GAME_COLORS.bgPanel,
    borderRadius: 24,
    paddingVertical: 28,
    paddingHorizontal: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  resultsMsg: { fontSize: 30, fontWeight: '900', marginBottom: 10 },
  msgWin: { color: GAME_COLORS.gold },
  msgFail: { color: GAME_COLORS.textDim },
  starRow: { flexDirection: 'row', marginBottom: 14 },
  star: { fontSize: 48, marginHorizontal: 4 },
  comboLine: { color: GAME_COLORS.blue, fontSize: 14, fontWeight: '800', marginTop: 6 },
  claimBtn: { marginTop: 18 },
  confetti: { ...StyleSheet.absoluteFillObject },
});
