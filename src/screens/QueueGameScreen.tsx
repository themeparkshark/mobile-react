/**
 * QueueGameScreen — Filament native 3D scene (New Architecture).
 *
 * This is the ambitious path: full PBR rendering on native Metal via
 * react-native-filament, not HTML WebView. Requires `newArchEnabled: true`
 * in ios/Podfile.properties.json (flipped today) because the Nitro bridge
 * underneath Filament needs TurboModules.
 *
 * Scene layout:
 *   - Orbit camera (drag to rotate around target)
 *   - Default IBL environment + directional key light with shadows
 *   - Hero model: shark-avatar.glb, scaled up, casting+receiving shadows
 *   - Tap anywhere to rack up a score (haptic feedback on each tap)
 *
 * Next step once this ships smooth on device: replace the hero shark with
 * a falling-fruits layout for the real Banana Basket game on Filament.
 */

import { useCallback, useState } from 'react';
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

// --- Inner scene component — all Filament children live in here. ---

function Scene({ onTapHero }: { onTapHero: () => void }) {
  // Orbit camera: user drags to rotate around the origin. `cameraManipulator`
  // captures gestures at the FilamentView level and updates the camera each
  // frame via Filament's RenderCallback pipeline.
  const cameraManipulator = useCameraManipulator({
    orbitHomePosition: [0, 1.2, 4.5],
    targetPosition: [0, 0, 0],
    orbitSpeed: [0.004, 0.004],
  });

  const onTouchStart = useCallback(
    (event: any) => {
      'worklet';
      cameraManipulator?.grabBegin?.(event.nativeEvent.x, event.nativeEvent.y, false);
    },
    [cameraManipulator]
  );
  const onTouchMove = useCallback(
    (event: any) => {
      'worklet';
      cameraManipulator?.grabUpdate?.(event.nativeEvent.x, event.nativeEvent.y);
    },
    [cameraManipulator]
  );
  const onTouchEnd = useCallback(() => {
    'worklet';
    cameraManipulator?.grabEnd?.();
  }, [cameraManipulator]);

  return (
    <FilamentView
      style={StyleSheet.absoluteFill}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <Camera cameraManipulator={cameraManipulator} />
      <DefaultLight />
      <Model
        source={SHARK_GLB}
        castShadow
        receiveShadow
        scale={[1.4, 1.4, 1.4]}
        onPress={onTapHero}
      />
    </FilamentView>
  );
}

// --- Screen wrapper: gradient background + HUD on top of Filament view. ---

export default function QueueGameScreen({ navigation }: any) {
  const [score, setScore] = useState(0);

  const handleClose = useCallback(() => {
    Haptics.selectionAsync();
    navigation?.goBack?.();
  }, [navigation]);

  const handleTap = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setScore((s) => s + 1);
  }, []);

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />
      <LinearGradient
        colors={['#0b1b3a', '#1a3b6e', '#2b6cb0', '#4c9cd6']}
        style={StyleSheet.absoluteFill}
      />

      <FilamentScene>
        <Scene onTapHero={handleTap} />
      </FilamentScene>

      {/* HUD */}
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

      <SafeAreaView style={styles.bottomBar} pointerEvents="none">
        <Text style={styles.hintText}>Filament 3D Native</Text>
        <Text style={styles.hintSub}>Drag to orbit • Tap the model to score</Text>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0b1b3a' },
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
    textAlign: 'center',
    paddingHorizontal: 24,
  },
});
