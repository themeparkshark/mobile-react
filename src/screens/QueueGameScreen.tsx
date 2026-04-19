/**
 * QueueGameScreen — Filament native 3D (debug visibility pass).
 *
 * Previous render showed nothing. Adding:
 *   - Skybox in a vivid color so we can confirm Filament is drawing AT ALL
 *   - DebugBox wireframe wrapped around the Model to visualize its
 *     bounding box regardless of whether materials render
 *   - Default Model transform (no scale tweak yet) at origin, so we see
 *     its authored size before we start fitting the viewport around it
 */

import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faXmark, faBolt } from '@fortawesome/free-solid-svg-icons';

import {
  FilamentScene,
  FilamentView,
  Camera,
  DefaultLight,
  Model,
  Skybox,
  DebugBox,
} from 'react-native-filament';

import config from '../config';

const SHARK_GLB = require('../../assets/models/shark-avatar.glb');

function Scene({ onTapHero, rotationY }: { onTapHero: () => void; rotationY: number }) {
  return (
    <FilamentView style={StyleSheet.absoluteFill}>
      {/* Pull camera back far enough to see pretty much any reasonable model */}
      <Camera cameraPosition={[0, 1, 12]} cameraTarget={[0, 0, 0]} />
      <DefaultLight />
      {/* Vivid skybox so we know the scene is rendering even if the model is off-screen or invisible */}
      <Skybox colorInHex="#1a3b6e" />
      <Model
        source={SHARK_GLB}
        castShadow
        receiveShadow
        rotate={[0, rotationY, 0]}
        onPress={onTapHero}
      >
        {/* Draws a wireframe around the model's actual bounding box */}
        <DebugBox />
      </Model>
    </FilamentView>
  );
}

export default function QueueGameScreen({ navigation }: any) {
  const [score, setScore] = useState(0);
  const [rotationY, setRotationY] = useState(0);

  useEffect(() => {
    let raf: number;
    const start = Date.now();
    const loop = () => {
      const t = (Date.now() - start) / 1000;
      setRotationY((t * (2 * Math.PI)) / 8);
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

      <FilamentScene>
        <Scene onTapHero={handleTap} rotationY={rotationY} />
      </FilamentScene>

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
        <Text style={styles.hintText}>Filament debug — skybox + wireframe</Text>
        <Text style={styles.hintSub}>
          Blue skybox should be visible. White wireframe = shark bounds.
        </Text>
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
    fontSize: 18,
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
