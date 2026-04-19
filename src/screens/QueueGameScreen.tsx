/**
 * QueueGameScreen — Filament native 3D scene.
 *
 * Third revision: dropped the custom onTouchStart/Move/End handlers that
 * collided with Filament's internal touch-dispatch. Model onPress works
 * on its own because the library wires it via the shared TouchHandlerContext.
 *
 * Camera orbit gestures will come back later through the right API
 * (useCameraManipulator has internal hooks that need a worklet rigged
 * via RenderCallbackContext, not ad-hoc onTouch props).
 */

import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  SafeAreaView,
  StatusBar,
  Animated,
  Easing,
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
} from 'react-native-filament';

import config from '../config';

const SHARK_GLB = require('../../assets/models/shark-avatar.glb');

// --- 3D scene: all Filament children, camera + light + hero model. ---

function Scene({ onTapHero, rotationY }: { onTapHero: () => void; rotationY: number }) {
  return (
    <FilamentView style={StyleSheet.absoluteFill}>
      <Camera cameraPosition={[0, 1.1, 4.8]} cameraTarget={[0, 0, 0]} />
      <DefaultLight />
      <Model
        source={SHARK_GLB}
        castShadow
        receiveShadow
        scale={[1.4, 1.4, 1.4]}
        rotate={[0, rotationY, 0]}
        onPress={onTapHero}
      />
    </FilamentView>
  );
}

// --- Screen wrapper: gradient background + HUD + rotation animator. ---

export default function QueueGameScreen({ navigation }: any) {
  const [score, setScore] = useState(0);
  const [rotationY, setRotationY] = useState(0);

  // Auto-rotate the hero slowly on Y (JS-driven since we removed orbit input).
  // 6-second loop, smooth linear spin.
  useEffect(() => {
    let raf: number;
    let start = Date.now();
    const loop = () => {
      const t = (Date.now() - start) / 1000;
      setRotationY((t * (2 * Math.PI)) / 6);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

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
        <Scene onTapHero={handleTap} rotationY={rotationY} />
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
        <Text style={styles.hintSub}>Tap the shark to score</Text>
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
