/**
 * QueueGameScreen — Smoke test for react-native-filament integration.
 *
 * This is the foundation for the Universal Studios Hollywood queue mini-games
 * (Banana Basket / Cauldron Brew / Raptor Nest). Phase 1 validates that:
 *
 *   1. Filament renders a GLB on device at 60fps
 *   2. Touch input on the 3D view bridges back to React Native
 *   3. A Release build on physical iPhone matches what we see here
 *
 * Once this ships green, Phase 2 rips out the shark and drops in the real
 * banana/cauldron/raptor-egg models (Meshy-generated) plus the falling-object
 * game loop. Everything above the FilamentView (the HUD) survives that swap.
 */

import { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faXmark, faBolt } from '@fortawesome/free-solid-svg-icons';

// react-native-filament imports. If these throw at runtime, the native pods
// haven't been rebuilt yet — that's expected until the first successful
// `expo run:ios` after `npm install`.
import {
  FilamentScene,
  FilamentView,
  Camera,
  DefaultLight,
  Model,
  useCameraManipulator,
} from 'react-native-filament';

import config from '../config';

const SHARK_GLB = require('../../assets/models/shark-avatar.glb');

// --- Inner scene: everything inside <FilamentScene> ---

function SharkScene({ onTapModel }: { onTapModel: () => void }) {
  const cameraManipulator = useCameraManipulator({
    orbitHomePosition: [0, 0.5, 3.5], // start a bit up and back
    targetPosition: [0, 0, 0],
    orbitSpeed: [0.003, 0.003],
  });

  return (
    <FilamentView style={StyleSheet.absoluteFill}>
      <Camera cameraManipulator={cameraManipulator} />
      <DefaultLight />
      <Model
        source={SHARK_GLB}
        castShadow
        receiveShadow
        onPress={onTapModel}
        scale={[1.2, 1.2, 1.2]}
        rotate={[0, 0, 0]}
      />
    </FilamentView>
  );
}

// --- Screen wrapper: HUD + <FilamentScene> host ---

export default function QueueGameScreen({ navigation }: any) {
  const [score, setScore] = useState(0);
  const [status, setStatus] = useState<'idle' | 'error'>('idle');

  const handleTap = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setScore((s) => s + 1);
  }, []);

  const handleClose = useCallback(() => {
    Haptics.selectionAsync();
    navigation?.goBack?.();
  }, [navigation]);

  // Gradient background that shows through any transparent edges of the
  // Filament view (and around the safe-area insets).
  const gradient = useMemo(
    () => ['#0b1b3a', '#1a3b6e', '#2b6cb0', '#4c9cd6'] as const,
    []
  );

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />
      <LinearGradient colors={gradient} style={StyleSheet.absoluteFill} />

      {/* 3D scene fills the whole screen. HUD sits on top. */}
      {status === 'idle' && (
        <FilamentScene>
          <SharkScene onTapModel={handleTap} />
        </FilamentScene>
      )}

      {status === 'error' && (
        <View style={styles.errorBox}>
          <Text style={styles.errorTitle}>3D engine failed to start</Text>
          <Text style={styles.errorBody}>
            react-native-filament didn't initialize. Rebuild the native iOS
            target (pod install + archive) and try again.
          </Text>
        </View>
      )}

      {/* Top bar */}
      <SafeAreaView style={styles.topBar} pointerEvents="box-none">
        <Pressable
          onPress={handleClose}
          style={styles.closeBtn}
          hitSlop={12}
          accessibilityLabel="Close 3D preview"
        >
          <FontAwesomeIcon icon={faXmark} size={22} color="#fff" />
        </Pressable>

        <View style={styles.scorePill}>
          <FontAwesomeIcon icon={faBolt} size={14} color={config.primary} />
          <Text style={styles.scoreText}>{score}</Text>
        </View>
      </SafeAreaView>

      {/* Bottom hint */}
      <SafeAreaView style={styles.bottomBar} pointerEvents="none">
        <Text style={styles.hintText}>Tap the shark — 3D smoke test</Text>
        <Text style={styles.hintSub}>
          Drag to orbit • Haptic + score on hit
        </Text>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0b1b3a',
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  closeBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scorePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  scoreText: {
    color: '#fff',
    fontFamily: 'Shark',
    fontSize: 18,
    minWidth: 24,
    textAlign: 'right',
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingBottom: 24,
  },
  hintText: {
    color: '#fff',
    fontFamily: 'Shark',
    fontSize: 20,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  hintSub: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    marginTop: 4,
  },
  errorBox: {
    position: 'absolute',
    left: 24,
    right: 24,
    top: '40%',
    padding: 20,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderWidth: 1,
    borderColor: 'rgba(255,100,100,0.4)',
  },
  errorTitle: {
    color: '#ff6b6b',
    fontFamily: 'Shark',
    fontSize: 20,
    marginBottom: 8,
  },
  errorBody: {
    color: '#fff',
    fontSize: 14,
    lineHeight: 20,
  },
});
