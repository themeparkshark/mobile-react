/**
 * GameKitGymScreen — a playground that exercises every GameKit primitive.
 *
 * Lives under MiniGameTester. Verifies on-device that the engine layer runs at
 * 60fps and that each primitive fires correctly:
 *   - A full-screen ParticleField running continuously with a live FPS counter.
 *   - Buttons to fire every burst preset (burst / confetti / coins) and trails.
 *   - Screen shake + flash (Juice).
 *   - Combo ticks feeding a live ScoreDisplay with multiplier + fever.
 *   - Spring-scale squash/stretch on a tappable target.
 *
 * No game logic here — this only stresses the shared primitives.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  SafeAreaView,
} from 'react-native';
import Animated, {
  useFrameCallback,
  useSharedValue,
  runOnJS,
  type FrameInfo,
} from 'react-native-reanimated';
import { useNavigation } from '@react-navigation/native';
import Topbar, { BackButton } from '../components/Topbar';
import TopbarColumn from '../components/Topbar/TopbarColumn';
import TopbarText from '../components/Topbar/TopbarText';
import {
  ParticleField,
  type ParticleHandle,
  useSpringScale,
  useShake,
  useFlash,
  useCombo,
  ScoreDisplay,
  Haptic,
  playSfx,
  SFX,
  setHapticsEnabled,
  GAME_COLORS,
} from '../gamekit';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

export default function GameKitGymScreen() {
  const navigation = useNavigation<any>();
  const particles = useRef<ParticleHandle>(null);

  // Preload SFX (silent no-op until assets land) + honor haptics on this screen.
  useEffect(() => {
    setHapticsEnabled(true);
    void SFX.preload();
  }, []);

  // -- FPS counter: sample on UI thread, mirror to JS at ~4Hz. --------------
  const [fps, setFps] = useState(0);
  const frames = useSharedValue(0);
  const acc = useSharedValue(0);
  const lastReport = useRef(60);
  const pushFps = useCallback((v: number) => {
    lastReport.current = v;
    setFps(v);
  }, []);

  useFrameCallback((info: FrameInfo) => {
    'worklet';
    const dt = info.timeSincePreviousFrame;
    if (dt == null) return;
    frames.value += 1;
    acc.value += dt;
    if (acc.value >= 250) {
      const measured = (frames.value * 1000) / acc.value;
      runOnJS(pushFps)(Math.round(measured));
      frames.value = 0;
      acc.value = 0;
    }
  });

  // -- Juice: shake + flash on the whole content. ---------------------------
  const shake = useShake();
  const flash = useFlash();

  // -- Spring-scale target. -------------------------------------------------
  const target = useSpringScale();

  // -- Combo → score. -------------------------------------------------------
  const combo = useCombo();
  const [score, setScore] = useState(0);

  // Poll combo decay each second so the streak lapses realistically.
  useEffect(() => {
    const id = setInterval(() => combo.poll(), 400);
    return () => clearInterval(id);
  }, [combo]);

  const centerX = SCREEN_W / 2;
  const fireBurst = useCallback(
    (preset: 'burst' | 'confetti' | 'coins') => {
      particles.current?.burst({
        x: centerX,
        y: SCREEN_H * 0.32,
        preset,
      });
      Haptic.hitMedium();
      playSfx('hit');
    },
    [centerX],
  );

  const onComboTick = useCallback(() => {
    const state = combo.hit();
    setScore((s) => s + 10 * state.multiplier);
    target.pop();
    particles.current?.burst({
      x: centerX,
      y: SCREEN_H * 0.32,
      preset: 'burst',
      count: 10,
    });
    if (state.fever) {
      Haptic.comboHeavy();
      flash.flash(0.4, 160);
      playSfx('combo');
    } else {
      Haptic.tapLight();
      playSfx('tap');
    }
  }, [combo, target, centerX, flash]);

  const onShake = useCallback(() => {
    shake.shake(12, 110);
    flash.flash(0.5, 140);
    Haptic.failBuzz();
    playSfx('fail');
  }, [shake, flash]);

  const onTrailBurst = useCallback(() => {
    // Simulate a drag trail across the screen.
    let i = 0;
    const id = setInterval(() => {
      const t = i / 20;
      particles.current?.trail(
        SCREEN_W * (0.15 + t * 0.7),
        SCREEN_H * (0.28 + Math.sin(t * Math.PI * 2) * 0.06),
      );
      i += 1;
      if (i > 20) clearInterval(id);
    }, 16);
    Haptic.tickSelection();
  }, []);

  const reset = useCallback(() => {
    combo.reset();
    setScore(0);
    particles.current?.clear();
  }, [combo]);

  return (
    <>
      <Topbar>
        <TopbarColumn stretch={false}>
          <BackButton />
        </TopbarColumn>
        <TopbarColumn>
          <TopbarText>[GYM] GameKit Gym</TopbarText>
        </TopbarColumn>
        <TopbarColumn stretch={false} />
      </Topbar>

      <SafeAreaView style={styles.safe}>
        {/* Live particle field — fills the screen, ignores touches. */}
        <ParticleField
          ref={particles}
          width={SCREEN_W}
          height={SCREEN_H}
          style={styles.field}
          pointerEvents="none"
        />

        {/* Flash overlay (Juice). */}
        <Animated.View
          pointerEvents="none"
          style={[styles.flash, flash.style]}
        />

        <Animated.View style={[styles.content, shake.style]}>
          {/* HUD row: FPS + live score. */}
          <View style={styles.hud}>
            <View style={styles.fpsBox}>
              <Text style={[styles.fpsValue, fps < 55 && styles.fpsBad]}>{fps}</Text>
              <Text style={styles.fpsLabel}>FPS</Text>
            </View>
            <ScoreDisplay
              score={score}
              multiplier={combo.multiplier}
              fever={combo.fever}
              label="SCORE"
            />
            <View style={styles.streakBox}>
              <Text style={styles.streakValue}>{combo.streak}</Text>
              <Text style={styles.fpsLabel}>STREAK</Text>
            </View>
          </View>

          {/* Spring-scale tappable target. */}
          <View style={styles.stage}>
            <TouchableOpacity activeOpacity={0.85} onPress={onComboTick}>
              <Animated.View style={[styles.target, target.style]}>
                <Text style={styles.targetTxt}>TAP</Text>
              </Animated.View>
            </TouchableOpacity>
            {combo.fever ? <Text style={styles.fever}>FEVER!</Text> : null}
          </View>

          <ScrollView
            style={styles.controls}
            contentContainerStyle={styles.controlsInner}
            showsVerticalScrollIndicator={false}
          >
            <Section title="Particles (pooled, max 200)">
              <Row>
                <Btn label="Burst" onPress={() => fireBurst('burst')} />
                <Btn label="Confetti" onPress={() => fireBurst('confetti')} />
              </Row>
              <Row>
                <Btn label="Coins" onPress={() => fireBurst('coins')} />
                <Btn label="Trail" onPress={onTrailBurst} />
              </Row>
            </Section>

            <Section title="Combo / Score">
              <Row>
                <Btn label="Combo Tick" onPress={onComboTick} tint={GAME_COLORS.blue} />
                <Btn label="Reset" onPress={reset} tint={GAME_COLORS.bgElevated} />
              </Row>
            </Section>

            <Section title="Juice">
              <Row>
                <Btn label="Shake + Flash" onPress={onShake} tint={GAME_COLORS.coral} />
                <Btn label="Squash" onPress={() => target.squash()} />
              </Row>
            </Section>

            <TouchableOpacity
              style={styles.shellLink}
              onPress={() => navigation.goBack()}
            >
              <Text style={styles.shellLinkTxt}>Back to Tester</Text>
            </TouchableOpacity>
          </ScrollView>
        </Animated.View>
      </SafeAreaView>
    </>
  );
}

// -- Small presentational helpers. -------------------------------------------

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title.toUpperCase()}</Text>
      {children}
    </View>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <View style={styles.row}>{children}</View>;
}

function Btn({
  label,
  onPress,
  tint = GAME_COLORS.bgPanel,
}: {
  label: string;
  onPress: () => void;
  tint?: string;
}) {
  return (
    <TouchableOpacity style={[styles.btn, { backgroundColor: tint }]} onPress={onPress} activeOpacity={0.8}>
      <Text style={styles.btnTxt}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: GAME_COLORS.bgDeep, marginTop: -8 },
  field: { ...StyleSheet.absoluteFillObject },
  flash: { ...StyleSheet.absoluteFillObject, backgroundColor: GAME_COLORS.gold },
  content: { flex: 1 },
  hud: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 14,
  },
  fpsBox: { alignItems: 'center', minWidth: 56 },
  fpsValue: { color: GAME_COLORS.success, fontSize: 30, fontWeight: '900', fontVariant: ['tabular-nums'] },
  fpsBad: { color: GAME_COLORS.danger },
  fpsLabel: { color: GAME_COLORS.textFaint, fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  streakBox: { alignItems: 'center', minWidth: 56 },
  streakValue: { color: GAME_COLORS.gold, fontSize: 30, fontWeight: '900', fontVariant: ['tabular-nums'] },
  stage: { alignItems: 'center', justifyContent: 'center', paddingVertical: 24 },
  target: {
    width: 120,
    height: 120,
    borderRadius: 24,
    backgroundColor: GAME_COLORS.blue,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: GAME_COLORS.blue,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 16,
    elevation: 6,
  },
  targetTxt: { color: '#fff', fontSize: 26, fontWeight: '900', letterSpacing: 2 },
  fever: { color: GAME_COLORS.coral, fontSize: 18, fontWeight: '900', marginTop: 10, letterSpacing: 2 },
  controls: { flex: 1 },
  controlsInner: { paddingHorizontal: 16, paddingBottom: 40 },
  section: { marginBottom: 18 },
  sectionTitle: {
    color: GAME_COLORS.textFaint,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: 8,
    marginLeft: 4,
  },
  row: { flexDirection: 'row', marginBottom: 10 },
  btn: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    marginHorizontal: 5,
  },
  btnTxt: { color: '#fff', fontSize: 15, fontWeight: '800' },
  shellLink: { alignItems: 'center', paddingVertical: 14, marginTop: 4 },
  shellLinkTxt: { color: GAME_COLORS.textDim, fontSize: 14, fontWeight: '700' },
});
